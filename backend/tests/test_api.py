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
os.environ["LOCAL_QUALITY_CHECK"] = "true"  # existing tests exercise the local gate; see test_ai_judges_quality_when_local_check_off
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
        json={"referral_id": ref.json()["id"], "kind": "video", "slot": "2026-11-02T10:00:00+05:30", "status": "CONFIRMED"},
    )
    assert appt.status_code == 422  # a Google Meet link is required for video
    appt = client.post(
        "/appointments",
        headers=spec,
        json={"referral_id": ref.json()["id"], "kind": "video", "slot": "2026-11-02T10:00:00+05:30", "status": "CONFIRMED", "meet_url": "https://meet.google.com/abc-defg-hij"},
    )
    assert appt.status_code == 200, appt.text
    nav_start = client.post(
        "/appointments",
        headers=nav,
        json={"referral_id": ref.json()["id"], "kind": "video", "slot": "x", "meet_url": "https://meet.google.com/abc-defg-hij", "start_now": True},
    )
    assert nav_start.status_code == 403  # only specialists may start immediately
    now_call = client.post(
        "/appointments",
        headers=spec,
        json={"referral_id": ref.json()["id"], "kind": "video", "slot": "ignored", "meet_url": "https://meet.google.com/xyz-wxyz-abc", "start_now": True},
    )
    assert now_call.status_code == 200, now_call.text
    assert now_call.json()["status"] == "CONFIRMED"
    video = client.get(f"/appointments/{appt.json()['id']}/video", headers=spec)
    assert video.status_code == 200
    assert video.json()["url"] == "https://meet.google.com/abc-defg-hij"
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


def _journey_to_image(hw, name: str, phone: str):
    p = client.post(
        "/patients",
        headers={**hw, "Idempotency-Key": f"p-{name}"},
        json={"full_name": name, "age": 52, "sex": "male", "phone": phone, "village": "Test", "tobacco_use": "gutka"},
    )
    assert p.status_code == 200, p.text
    pid = p.json()["id"]
    for purpose in ("examination", "imaging"):
        assert client.post(f"/patients/{pid}/consents", headers=hw, json={"purpose": purpose}).status_code == 200
    s = client.post(
        "/screenings",
        headers={**hw, "Idempotency-Key": f"s-{name}"},
        json={"patient_id": pid, "symptoms": "sore for 3 weeks", "tobacco": "gutka daily"},
    )
    sid = s.json()["id"]
    img = client.post(
        f"/screenings/{sid}/images",
        headers=hw,
        files={"file": ("photo.jpg", make_image(), "image/jpeg")},
        data={"view": "cheek"},
    )
    assert img.status_code == 200, img.text
    return sid, img.json()["id"]


def test_ollama_feedback_is_stored_and_returned(monkeypatch):
    from app import routers
    from app.ai import ollama_adapter

    seen = {}

    def fake_ollama(raw, screening_id, context):
        seen["bytes"] = len(raw)
        seen["context"] = context
        return {
            "provider": "ollama",
            "model_version": "fake-vision:1",
            "status": "completed",
            "research_label": "suspicious_example",
            "score": None,
            "clinical_use": False,
            "requires_clinician_review": True,
            "warning": "NOT FOR CLINICAL USE",
            "screening_id": screening_id,
            "feedback": {
                "predicted_condition": {"disease_detected": True, "name": "Oral leukoplakia (most likely)", "likelihood": "medium"},
                "suggested_urgency": "soon",
                "clinician_summary": "Examine the left cheek.",
                "patient_message": {"en": "Please see a doctor soon.", "te": "త్వరగా డాక్టర్‌ని కలవండి."},
            },
        }

    monkeypatch.setattr(routers.settings, "AI_PROVIDER", "ollama")
    monkeypatch.setattr(routers, "ollama_analyze", fake_ollama)

    hw = auth("hw@demo.local")
    sid, image_id = _journey_to_image(hw, "Ollama Patient", "9222222222")
    r = client.post("/ai/analyze", headers=hw, json={"screening_id": sid, "image_id": image_id})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["provider"] == "ollama"
    assert body["clinical_use"] is False and body["requires_clinician_review"] is True
    assert body["feedback"]["suggested_urgency"] == "soon"
    # the backend, not the browser, read the stored photo and passed patient context along
    assert seen["bytes"] > 1000
    assert seen["context"]["view"] == "cheek" and seen["context"]["age"] == 52
    assert "full_name" not in seen["context"] and "phone" not in seen["context"]

    detail = client.get(f"/screenings/{sid}", headers=hw).json()
    assert detail["ai_analyses"][-1]["feedback"]["predicted_condition"]["name"].startswith("Oral leukoplakia")


def test_ollama_failure_preserves_screening(monkeypatch):
    from app import routers
    from app.ai.ollama_adapter import OllamaError

    def boom(*_a, **_k):
        raise OllamaError("Ollama Cloud timed out")

    monkeypatch.setattr(routers.settings, "AI_PROVIDER", "ollama")
    monkeypatch.setattr(routers, "ollama_analyze", boom)

    hw = auth("hw@demo.local")
    sid, image_id = _journey_to_image(hw, "Ollama Fail Patient", "9333333333")
    r = client.post("/ai/analyze", headers=hw, json={"screening_id": sid, "image_id": image_id})
    assert r.status_code == 503
    assert r.json()["detail"]["status"] == "failed"
    detail = client.get(f"/screenings/{sid}", headers=hw).json()
    assert detail["status"] == "AWAITING_CLINICIAN"
    assert detail["ai_analyses"][-1]["status"] == "failed"


def test_cannot_analyze_image_from_another_screening():
    hw = auth("hw@demo.local")
    sid_a, _ = _journey_to_image(hw, "Owner A", "9444444444")
    _sid_b, image_b = _journey_to_image(hw, "Owner B", "9555555555")
    r = client.post("/ai/analyze", headers=hw, json={"screening_id": sid_a, "image_id": image_b})
    assert r.status_code == 404


def test_ai_judges_quality_when_local_check_off(monkeypatch):
    from app import routers

    monkeypatch.setattr(routers.settings, "LOCAL_QUALITY_CHECK", False)
    monkeypatch.setattr(routers.settings, "AI_PROVIDER", "ollama")

    def fake_ollama(raw, screening_id, context):
        usable = context["view"] != "tongue"
        return {
            "provider": "ollama",
            "model_version": "fake-vision:1",
            "status": "completed" if usable else "image_insufficient",
            "research_label": "no_suspicious_finding_example" if usable else "inconclusive_example",
            "score": None,
            "clinical_use": False,
            "requires_clinician_review": True,
            "warning": "NOT FOR CLINICAL USE",
            "screening_id": screening_id,
            "feedback": {
                "image_assessment": {"is_oral_photo": usable, "usable": usable, "issues": [] if usable else ["too dark"]},
                "recapture_tips": [] if usable else ["Use more light"],
            },
        }

    monkeypatch.setattr(routers, "ollama_analyze", fake_ollama)

    hw = auth("hw@demo.local")
    sid, image_id = _journey_to_image(hw, "No Gate Patient", "9666666666")
    detail = client.get(f"/screenings/{sid}", headers=hw).json()
    # a blurry photo is no longer rejected locally
    blur = client.post(
        f"/screenings/{sid}/images",
        headers=hw,
        files={"file": ("blur.jpg", make_image(blur=True), "image/jpeg")},
        data={"view": "tongue"},
    )
    assert blur.status_code == 200 and blur.json()["quality_status"] == "pending_ai"

    ok = client.post("/ai/analyze", headers=hw, json={"screening_id": sid, "image_id": image_id})
    assert ok.status_code == 200 and ok.json()["status"] == "completed"

    bad = client.post("/ai/analyze", headers=hw, json={"screening_id": sid, "image_id": blur.json()["id"]})
    assert bad.status_code == 200
    assert bad.json()["status"] == "image_insufficient"
    assert bad.json()["feedback"]["recapture_tips"] == ["Use more light"]

    images = {i["id"]: i for i in client.get(f"/screenings/{sid}", headers=hw).json()["images"]}
    assert images[image_id]["quality_status"] == "acceptable"
    assert images[blur.json()["id"]]["quality_status"] == "recapture"
    assert images[blur.json()["id"]]["quality_reason"] == "too dark"


def test_registration_requires_admin_approval():
    body = {"full_name": "New Navigator", "email": "New.Nav@Example.com", "password": "Strong#123", "role": "navigator"}
    r = client.post("/auth/register", json=body)
    assert r.status_code == 201, r.text

    # duplicate email and bad designation are refused
    assert client.post("/auth/register", json=body).status_code == 409
    assert client.post("/auth/register", json={**body, "email": "x@y.com", "role": "admin"}).status_code == 422

    # pending users cannot sign in
    blocked = client.post("/auth/login", json={"email": "new.nav@example.com", "password": "Strong#123"})
    assert blocked.status_code == 403

    admin = auth("admin@demo.local")
    notes = client.get("/notifications", headers=admin).json()
    assert any("awaiting approval" in n["title"] for n in notes)

    # non-admins cannot approve
    assert client.get("/admin/users", headers=auth("hw@demo.local")).status_code == 403

    pending = client.get("/admin/users?status=pending", headers=admin).json()
    uid_ = next(u["id"] for u in pending if u["email"] == "new.nav@example.com")
    assert client.post(f"/admin/users/{uid_}/approve", headers=admin).status_code == 200
    assert client.post(f"/admin/users/{uid_}/approve", headers=admin).status_code == 409

    ok = client.post("/auth/login", json={"email": "new.nav@example.com", "password": "Strong#123"})
    assert ok.status_code == 200
    assert ok.json()["user"]["role"] == "navigator"

    detail = client.get(f"/admin/users/{uid_}", headers=admin).json()
    assert "tasks_assigned" in detail["work"]["metrics"]
    roles = {u["role"] for u in client.get("/admin/users", headers=admin).json()}
    assert "admin" not in roles


def test_rejected_registration_cannot_login():
    client.post("/auth/register", json={"full_name": "Rej User", "email": "rej@example.com", "password": "Strong#123", "role": "specialist"})
    admin = auth("admin@demo.local")
    pending = client.get("/admin/users?status=pending", headers=admin).json()
    uid_ = next(u["id"] for u in pending if u["email"] == "rej@example.com")
    assert client.post(f"/admin/users/{uid_}/reject", headers=admin).status_code == 200
    assert client.post("/auth/login", json={"email": "rej@example.com", "password": "Strong#123"}).status_code == 403


def test_slot_helpers():
    from app.routers import fmt_slot, parse_slot

    assert parse_slot("2026-11-02T05:00:00+00:00").hour == 5
    assert parse_slot("2026-11-02 10:00") is not None
    assert parse_slot("next tuesday") is None
    assert fmt_slot("2026-11-02T10:00:00+05:30") == "Mon, 02 Nov 2026, 10:00 (UTC+05:30)"
    assert fmt_slot("next tuesday") == "next tuesday"


def test_google_meet_link_validation():
    from fastapi import HTTPException
    from app.routers import clean_meet_url

    assert clean_meet_url("https://meet.google.com/abc-defg-hij") == "https://meet.google.com/abc-defg-hij"
    for bad in ["", "http://meet.google.com/abc-defg-hij", "https://meet.google.com.evil.com/abc-defg-hij", "https://example.com/abc-defg-hij"]:
        try:
            clean_meet_url(bad)
            raise AssertionError(bad)
        except HTTPException as e:
            assert e.status_code == 422
