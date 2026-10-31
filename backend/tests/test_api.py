import io
import os
import sys
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# Use a SEPARATE PostgreSQL database for tests (tables are dropped/recreated).
os.environ["DATABASE_URL"] = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+psycopg2://postgres:postgres@localhost:5432/aarogya_drishti_test",
)
os.environ["SEED_ON_START"] = "true"
os.environ["JWT_SECRET"] = "test-secret-not-for-production-use-32b"
os.environ["STORAGE_DIR"] = str(ROOT / "storage-test")

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import seed_if_empty  # noqa: E402

Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)
_db = SessionLocal()
seed_if_empty(_db)
_db.close()

client = TestClient(app)


def login(email: str) -> str:
    r = client.post("/auth/login", json={"email": email, "password": "Demo@123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def auth(email: str):
    return {"Authorization": f"Bearer {login(email)}"}


def make_image(blur=False) -> bytes:
    img = Image.new("RGB", (400, 400), color=(180, 90, 90) if not blur else (40, 40, 40))
    if not blur:
        for x in range(0, 400, 4):
            for y in range(0, 400, 4):
                img.putpixel((x, y), (10, 200, 20) if (x + y) % 8 == 0 else (220, 30, 30))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=92)
    return buf.getvalue()


def test_health():
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json()["clinical_use"] is False


def test_login_and_role_isolation():
    token = login("hw@demo.local")
    assert token
    admin = auth("admin@demo.local")
    r = client.get("/patients", headers=admin)
    assert r.status_code == 403
    dash = client.get("/dashboard/summary", headers=admin)
    assert dash.status_code == 200


def test_consent_gate_and_journey():
    hw = auth("hw@demo.local")
    p = client.post(
        "/patients",
        headers={**hw, "Idempotency-Key": "p1"},
        json={
            "full_name": "Synthetic Test Patient",
            "age": 46,
            "sex": "female",
            "phone": "9111111111",
            "village": "G. Madugula",
            "tobacco_use": "gutkha",
            "symptoms": "white patch",
        },
    )
    assert p.status_code == 200, p.text
    pid = p.json()["id"]
    again = client.post(
        "/patients",
        headers={**hw, "Idempotency-Key": "p1"},
        json={"full_name": "Synthetic Test Patient"},
    )
    assert again.json()["id"] == pid

    blocked = client.post("/screenings", headers=hw, json={"patient_id": pid, "exam_notes": "lesion"})
    assert blocked.status_code == 400

    for purpose in ("examination", "imaging"):
        c = client.post(f"/patients/{pid}/consents", headers=hw, json={"purpose": purpose, "language": "te"})
        assert c.status_code == 200

    s = client.post("/screenings", headers={**hw, "Idempotency-Key": "s1"}, json={"patient_id": pid, "exam_notes": "ulcer"})
    assert s.status_code == 200
    sid = s.json()["id"]

    img = client.post(
        f"/screenings/{sid}/images",
        headers=hw,
        files={"file": ("photo.jpg", make_image(), "image/jpeg")},
        data={"view": "cheek"},
    )
    assert img.status_code == 200, img.text
    assert img.json()["quality_status"] == "acceptable"
    image_id = img.json()["id"]

    blur = client.post(
        f"/screenings/{sid}/images",
        headers=hw,
        files={"file": ("blur.jpg", make_image(blur=True), "image/jpeg")},
        data={"view": "tongue"},
    )
    assert blur.status_code == 200
    insufficient = client.post(
        "/ai/analyze",
        headers=hw,
        json={"screening_id": sid, "image_id": blur.json()["id"]},
    )
    assert insufficient.status_code == 200
    assert insufficient.json()["status"] == "image_insufficient"

    ai = client.post("/ai/analyze", headers=hw, json={"screening_id": sid, "image_id": image_id})
    assert ai.status_code == 200
    assert ai.json()["clinical_use"] is False
    assert ai.json()["requires_clinician_review"] is True

    mo = auth("mo@demo.local")
    review = client.post(
        "/reviews",
        headers=mo,
        json={"screening_id": sid, "finding": "Clinical suspicion, independent of AI", "outcome": "refer", "ai_agreement": "disagree"},
    )
    assert review.status_code == 200
    replay = client.post(
        "/reviews",
        headers=mo,
        json={"screening_id": sid, "finding": "overwrite", "outcome": "refer"},
    )
    assert replay.status_code == 409

    spec = auth("spec@demo.local")
    denied = client.get(f"/patients/{pid}", headers=spec)
    assert denied.status_code == 403

    ref = client.post("/referrals", headers=mo, json={"review_id": review.json()["id"], "reason": "specialist exam"})
    assert ref.status_code == 200
    assert "te" in ref.json()["slip"]
    allowed = client.get(f"/patients/{pid}", headers=spec)
    assert allowed.status_code == 200

    hw_blocked = client.get("/referrals", headers=hw)
    assert hw_blocked.status_code == 403

    nav = auth("nav@demo.local")
    tasks = client.get("/navigation", headers=nav)
    assert tasks.status_code == 200
    assert tasks.json()

    appt = client.post(
        "/appointments",
        headers=spec,
        json={"referral_id": ref.json()["id"], "kind": "video", "slot": "2026-11-02 10:00", "status": "CONFIRMED"},
    )
    assert appt.status_code == 200, appt.text
    video = client.get(f"/appointments/{appt.json()['id']}/video", headers=spec)
    assert video.status_code == 200
    assert "meet.jit.si" in video.json()["url"]
    assert video.json()["recording_default"] is False

    inv = client.post("/investigations", headers=spec, json={"referral_id": ref.json()["id"], "kind": "biopsy"})
    assert inv.status_code == 200
    advanced = client.patch(
        f"/investigations/{inv.json()['id']}",
        headers=spec,
        json={"state": "CLINICIAN_REVIEWED", "clinician_result": "Synthetic clinician result"},
    )
    assert advanced.status_code == 200

    closed = client.patch(
        f"/navigation/{tasks.json()[0]['id']}",
        headers=nav,
        json={"status": "CLOSED", "contact_log": "Linked to care (synthetic)."},
    )
    assert closed.status_code == 200

    dash = client.get("/dashboard/summary", headers=auth("admin@demo.local"))
    assert dash.status_code == 200
    assert dash.json()["referrals"] >= 1


def test_wrong_password():
    r = client.post("/auth/login", json={"email": "hw@demo.local", "password": "wrong"})
    assert r.status_code == 401
