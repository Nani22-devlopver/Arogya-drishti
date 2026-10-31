import hashlib
import json
import re
from pathlib import Path

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .access import assert_patient_access, assert_screening_access, audit, get_patient_or_404, notify
from .config import settings
from .db import get_db
from .models import (
    AiAnalysis,
    Appointment,
    AuditEvent,
    ClinicalReview,
    Consent,
    IdempotencyRecord,
    ImageRecord,
    Investigation,
    NavigationTask,
    Notification,
    Patient,
    Referral,
    Screening,
    User,
    uid,
)
from .security import bearer, create_token, current_user, decode_token, hash_password, require_roles, verify_password

from .ai.mock_adapter import analyze as mock_analyze
from .ai.ollama_adapter import OllamaError, analyze as ollama_analyze
from .ai.quality import MAX_BYTES, QualityResult, check_quality

router = APIRouter()
storage = Path(settings.STORAGE_DIR)
storage.mkdir(parents=True, exist_ok=True)

REQUIRED_CONSENTS = {"examination", "imaging"}


class LoginIn(BaseModel):
    email: str
    password: str


class PatientIn(BaseModel):
    full_name: str
    age: int | None = None
    sex: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    village: str | None = None
    habitation: str | None = None
    gram_panchayat: str | None = None
    mandal: str | None = None
    phc: str | None = None
    tobacco_use: str | None = None
    symptoms: str | None = None
    medical_history: str | None = None


class ConsentIn(BaseModel):
    purpose: str
    language: str = "en"
    method: str = "checkbox"
    granted: bool = True


class ScreeningIn(BaseModel):
    patient_id: str
    symptoms: str | None = None
    duration: str | None = None
    tobacco: str | None = None
    exam_notes: str | None = None


class ReviewIn(BaseModel):
    screening_id: str
    finding: str
    outcome: str
    ai_agreement: str = "deferred"


class ReferralIn(BaseModel):
    review_id: str
    facility: str = "Area Hospital Paderu"
    specialty: str = "Oral surgery / ENT"
    priority: str = "urgent"
    reason: str | None = None


class AppointmentIn(BaseModel):
    referral_id: str
    kind: str = "physical"
    slot: str
    status: str = "REQUESTED"
    meet_url: str | None = None  # Google Meet link, required for video consultations
    start_now: bool = False  # specialists only: start the Meet immediately instead of scheduling


class AppointmentPatch(BaseModel):
    status: str
    attendance_outcome: str | None = None
    slot: str | None = None  # new time when rescheduling
    meet_url: str | None = None  # add or replace the Google Meet link


class InvestigationIn(BaseModel):
    referral_id: str
    kind: str = "biopsy"


class InvestigationPatch(BaseModel):
    state: str
    report_note: str | None = None
    clinician_result: str | None = None


class NavPatch(BaseModel):
    status: str | None = None
    contact_log: str | None = None
    due: str | None = None


class RegisterIn(BaseModel):
    full_name: str
    email: str
    password: str
    role: str
    assigned_facility: str | None = None


class AnalyzeIn(BaseModel):
    screening_id: str
    image_id: str | None = None


def user_out(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "full_name": u.full_name,
        "role": u.role,
        "assigned_facility": u.assigned_facility,
        "status": u.status,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


def patient_out(p: Patient) -> dict:
    return {
        "id": p.id,
        "full_name": p.full_name,
        "age": p.age,
        "sex": p.sex,
        "phone": p.phone,
        "email": p.email,
        "address": p.address,
        "village": p.village,
        "habitation": p.habitation,
        "gram_panchayat": p.gram_panchayat,
        "mandal": p.mandal,
        "phc": p.phc,
        "tobacco_use": p.tobacco_use,
        "symptoms": p.symptoms,
        "medical_history": p.medical_history,
        "duplicate_hint": p.duplicate_hint,
        "facility": p.facility,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def has_consent(db: Session, patient_id: str, purpose: str) -> bool:
    return (
        db.query(Consent)
        .filter(Consent.patient_id == patient_id, Consent.purpose == purpose, Consent.granted.is_(True))
        .first()
        is not None
    )


def parse_feedback(raw: str | None) -> dict | None:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


@router.get("/healthz")
def healthz():
    return {"ok": True, "service": "aarogya-drishti-api", "clinical_use": False}


@router.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid credentials")
    if user.status == "pending":
        raise HTTPException(403, "Your registration is awaiting admin approval. You can sign in once it is approved.")
    if user.status == "rejected":
        raise HTTPException(403, "Your registration was not approved. Please contact the district admin.")
    if user.status != "active":
        raise HTTPException(403, "This account is not active.")
    audit(db, user.id, "login", f"user:{user.id}")
    db.commit()
    return {"token": create_token(user), "user": user_out(user)}


SELF_REGISTER_ROLES = {"health_worker", "navigator", "medical_officer", "specialist"}


@router.post("/auth/register", status_code=201)
def register_account(body: RegisterIn, db: Session = Depends(get_db)):
    """Public self-registration. The account stays `pending` until an admin approves it."""
    email = body.email.strip().lower()
    name = body.full_name.strip()
    if body.role not in SELF_REGISTER_ROLES:
        raise HTTPException(422, "Choose a valid designation")
    if len(name) < 2 or "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(422, "Enter your full name and a valid email")
    if len(body.password) < 8:
        raise HTTPException(422, "Password must be at least 8 characters")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(409, "An account with this email already exists")
    user = User(
        email=email,
        full_name=name,
        password_hash=hash_password(body.password),
        role=body.role,
        assigned_facility=(body.assigned_facility or "").strip() or "PHC G. Madugula",
        status="pending",
    )
    db.add(user)
    db.flush()
    label = body.role.replace("_", " ")
    for admin in db.query(User).filter(User.role == "admin", User.status == "active").all():
        notify(db, admin.id, "New registration awaiting approval", f"{name} applied as {label}. Review it under Pending approvals.")
    audit(db, user.id, "user.register", f"user:{user.id}", json.dumps({"role": body.role}))
    db.commit()
    return {"ok": True, "status": "pending", "message": "Registration received. An admin must approve it before you can sign in."}


@router.get("/auth/me")
def me(user: User = Depends(current_user)):
    return user_out(user)


@router.post("/patients")
def create_patient(
    body: PatientIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("health_worker")),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    if idempotency_key:
        existing = db.get(IdempotencyRecord, idempotency_key)
        if existing:
            return patient_out(db.get(Patient, existing.resource_id))
    dup = None
    if body.phone:
        dup = db.query(Patient).filter(Patient.phone == body.phone).first()
    if not dup and body.full_name and body.village:
        dup = (
            db.query(Patient)
            .filter(Patient.full_name == body.full_name, Patient.village == body.village)
            .first()
        )
    patient = Patient(
        **body.model_dump(),
        created_by=user.id,
        facility=user.assigned_facility,
        duplicate_hint=f"Possible duplicate of {dup.id}" if dup else None,
    )
    db.add(patient)
    db.flush()
    if idempotency_key:
        db.add(IdempotencyRecord(key=idempotency_key, resource_type="patient", resource_id=patient.id))
    audit(db, user.id, "patient.create", f"patient:{patient.id}")
    db.commit()
    db.refresh(patient)
    return patient_out(patient)


@router.get("/patients")
def list_patients(q: str | None = None, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role == "admin":
        raise HTTPException(403, "Administrators receive aggregate data only")
    query = db.query(Patient)
    if user.role in {"health_worker", "medical_officer"}:
        query = query.filter(Patient.facility == user.assigned_facility)
    if user.role in {"specialist", "navigator"}:
        referred = db.query(Referral.patient_id)
        query = query.filter(Patient.id.in_(referred))
    if q:
        like = f"%{q}%"
        query = query.filter((Patient.full_name.ilike(like)) | (Patient.phone.ilike(like)))
    return [patient_out(p) for p in query.order_by(Patient.created_at.desc()).limit(100).all()]


@router.get("/patients/{patient_id}")
def get_patient(patient_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    patient = get_patient_or_404(db, patient_id)
    assert_patient_access(user, patient, db)
    audit(db, user.id, "patient.view", f"patient:{patient.id}")
    db.commit()
    return patient_out(patient)


@router.post("/patients/{patient_id}/consents")
def add_consent(
    patient_id: str,
    body: ConsentIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("health_worker")),
):
    patient = get_patient_or_404(db, patient_id)
    assert_patient_access(user, patient, db)
    rec = Consent(
        patient_id=patient_id,
        purpose=body.purpose,
        language=body.language,
        method=body.method,
        granted=body.granted,
        created_by=user.id,
    )
    db.add(rec)
    audit(db, user.id, "consent.create", f"patient:{patient_id}", body.purpose)
    db.commit()
    db.refresh(rec)
    return {
        "id": rec.id,
        "patient_id": rec.patient_id,
        "purpose": rec.purpose,
        "language": rec.language,
        "granted": rec.granted,
        "version": rec.version,
        "created_at": rec.created_at.isoformat(),
    }


@router.get("/patients/{patient_id}/consents")
def list_consents(patient_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    patient = get_patient_or_404(db, patient_id)
    assert_patient_access(user, patient, db)
    rows = db.query(Consent).filter(Consent.patient_id == patient_id).all()
    return [
        {
            "id": c.id,
            "purpose": c.purpose,
            "language": c.language,
            "granted": c.granted,
            "version": c.version,
            "created_at": c.created_at.isoformat(),
        }
        for c in rows
    ]


@router.post("/screenings")
def create_screening(
    body: ScreeningIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("health_worker")),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    if idempotency_key:
        existing = db.get(IdempotencyRecord, idempotency_key)
        if existing:
            row = db.get(Screening, existing.resource_id)
            return {"id": row.id, "status": row.status, "sync_status": row.sync_status}
    patient = get_patient_or_404(db, body.patient_id)
    assert_patient_access(user, patient, db)
    if not has_consent(db, patient.id, "examination"):
        raise HTTPException(400, "Examination consent is required before screening")
    rec = Screening(
        patient_id=patient.id,
        examiner_id=user.id,
        status="SCREENED",
        symptoms=body.symptoms,
        duration=body.duration,
        tobacco=body.tobacco,
        exam_notes=body.exam_notes,
        sync_status="confirmed",
        idempotency_key=idempotency_key,
    )
    db.add(rec)
    db.flush()
    if idempotency_key:
        db.add(IdempotencyRecord(key=idempotency_key, resource_type="screening", resource_id=rec.id))
    audit(db, user.id, "screening.create", f"screening:{rec.id}")
    db.commit()
    return {"id": rec.id, "status": rec.status, "sync_status": rec.sync_status, "patient_id": rec.patient_id}


@router.get("/screenings")
def list_screenings(
    status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if user.role == "admin":
        raise HTTPException(403, "Administrators receive aggregate data only")
    if user.role == "navigator":
        raise HTTPException(403, "Navigators cannot list clinical screenings")
    q = db.query(Screening)
    if status:
        q = q.filter(Screening.status == status)
    if user.role in {"health_worker", "medical_officer"}:
        patients = db.query(Patient.id).filter(Patient.facility == user.assigned_facility)
        q = q.filter(Screening.patient_id.in_(patients))
    if user.role == "specialist":
        referred = db.query(Referral.patient_id)
        q = q.filter(Screening.patient_id.in_(referred))
    rows = q.order_by(Screening.created_at.desc()).limit(200).all()
    return [
        {
            "id": s.id,
            "patient_id": s.patient_id,
            "status": s.status,
            "symptoms": s.symptoms,
            "tobacco": s.tobacco,
            "exam_notes": s.exam_notes,
            "created_at": s.created_at.isoformat(),
        }
        for s in rows
    ]


@router.get("/screenings/{screening_id}")
def get_screening(screening_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    s = db.get(Screening, screening_id)
    if not s:
        raise HTTPException(404, "Screening not found")
    assert_screening_access(db, user, s)
    images = db.query(ImageRecord).filter(ImageRecord.screening_id == s.id).order_by(ImageRecord.created_at).all()
    ai = db.query(AiAnalysis).filter(AiAnalysis.screening_id == s.id).order_by(AiAnalysis.created_at).all()
    reviews = db.query(ClinicalReview).filter(ClinicalReview.screening_id == s.id).all()
    return {
        "id": s.id,
        "patient_id": s.patient_id,
        "status": s.status,
        "symptoms": s.symptoms,
        "duration": s.duration,
        "tobacco": s.tobacco,
        "exam_notes": s.exam_notes,
        "images": [
            {
                "id": i.id,
                "view": i.view,
                "quality_status": i.quality_status,
                "quality_reason": i.quality_reason,
            }
            for i in images
        ],
        "ai_analyses": [
            {
                "id": a.id,
                "status": a.status,
                "research_label": a.research_label,
                "model_version": a.model_version,
                "provider": a.provider,
                "warning": a.warning,
                "clinical_use": a.clinical_use,
                "feedback": parse_feedback(a.feedback),
            }
            for a in ai
        ],
        "reviews": [
            {
                "id": r.id,
                "finding": r.finding,
                "outcome": r.outcome,
                "ai_agreement": r.ai_agreement,
                "signed_at": r.signed_at.isoformat(),
            }
            for r in reviews
        ],
    }


@router.post("/screenings/{screening_id}/images")
def upload_image(
    screening_id: str,
    view: str = Form("unspecified"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("health_worker")),
):
    s = db.get(Screening, screening_id)
    if not s:
        raise HTTPException(404, "Screening not found")
    assert_screening_access(db, user, s)
    if not has_consent(db, s.patient_id, "imaging"):
        raise HTTPException(400, "Imaging consent is required before photograph upload")
    data = file.file.read()
    if settings.LOCAL_QUALITY_CHECK:
        quality = check_quality(data, file.content_type)
    else:
        # No local gate: the AI decides whether the photo is good enough. Only reject files that cannot be processed at all.
        if not data:
            raise HTTPException(400, "The uploaded file is empty")
        if len(data) > MAX_BYTES:
            raise HTTPException(400, "The photo is larger than 8 MB; please upload a smaller one")
        quality = QualityResult("pending_ai", None)
    checksum = hashlib.sha256(data).hexdigest()
    image_id = uid()
    path = storage / f"{image_id}.bin"
    path.write_bytes(data)
    rec = ImageRecord(
        id=image_id,
        screening_id=s.id,
        view=view,
        checksum=checksum,
        storage_key=str(path.name),
        quality_status=quality.status,
        quality_reason=quality.reason,
        blur_score=quality.blur_score,
        created_by=user.id,
    )
    db.add(rec)
    audit(db, user.id, "image.upload", f"image:{image_id}")
    db.commit()
    return {
        "id": rec.id,
        "quality_status": rec.quality_status,
        "quality_reason": rec.quality_reason,
        "blur_score": rec.blur_score,
        "warning": "Photographs supplement examination and are not a diagnosis.",
    }


@router.get("/screenings/{screening_id}/images/{image_id}/file")
def download_image(
    screening_id: str,
    image_id: str,
    access_token: str | None = Query(default=None),
    db: Session = Depends(get_db),
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
):
    token = creds.credentials if creds else access_token
    if not token:
        raise HTTPException(401, "Authentication required")
    data = decode_token(token)
    user = db.get(User, data.get("sub"))
    if user is None:
        raise HTTPException(401, "Authentication required")
    s = db.get(Screening, screening_id)
    if not s:
        raise HTTPException(404, "Screening not found")
    if user.role == "navigator":
        raise HTTPException(403, "Photograph access is restricted")
    assert_screening_access(db, user, s)
    rec = db.get(ImageRecord, image_id)
    if not rec or rec.screening_id != screening_id:
        raise HTTPException(404, "Image not found")
    path = storage / rec.storage_key
    if not path.exists():
        raise HTTPException(404, "Stored file missing")
    audit(db, user.id, "image.view", f"image:{image_id}")
    db.commit()
    return FileResponse(path, media_type="application/octet-stream")


def _record_failed_analysis(db: Session, s: Screening, image_id: str | None, provider: str, model: str, user: User, event: str, reason: str | None = None) -> AiAnalysis:
    rec = AiAnalysis(
        feedback=json.dumps({"error": reason}, ensure_ascii=False) if reason else None,
        screening_id=s.id,
        image_id=image_id,
        model_version=model[:40],
        provider=provider,
        status="failed",
        research_label=None,
    )
    db.add(rec)
    db.flush()
    s.status = "AWAITING_CLINICIAN"
    audit(db, user.id, event, f"screening:{s.id}")
    db.commit()
    return rec


@router.post("/ai/analyze")
def ai_analyze(body: AnalyzeIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role not in {"health_worker", "medical_officer"}:
        raise HTTPException(403, "Not permitted")
    s = db.get(Screening, body.screening_id)
    if not s:
        raise HTTPException(404, "Screening not found")
    assert_screening_access(db, user, s)
    use_ollama = settings.use_ollama
    provider_name = "ollama" if use_ollama else "mock"
    model_name = settings.OLLAMA_MODEL if use_ollama else "mock-v1"
    if settings.AI_FORCE_FAIL:
        rec = _record_failed_analysis(db, s, body.image_id, provider_name, model_name, user, "ai.fail")
        raise HTTPException(
            503,
            detail={
                "message": "AI adapter unavailable. Screening is preserved for manual clinician review.",
                "analysis_id": rec.id,
                "status": "failed",
                "clinical_use": False,
            },
        )
    image = None
    if body.image_id:
        image = db.get(ImageRecord, body.image_id)
        if image and image.screening_id != s.id:
            raise HTTPException(404, "Image not found for this screening")
    else:
        q = db.query(ImageRecord).filter(ImageRecord.screening_id == s.id)
        if settings.LOCAL_QUALITY_CHECK:
            q = q.filter(ImageRecord.quality_status == "acceptable")
        image = q.order_by(ImageRecord.created_at.desc()).first()
    if not image:
        raise HTTPException(400, "No photo available for analysis. Upload a photo first.")
    if settings.LOCAL_QUALITY_CHECK and image.quality_status != "acceptable":
        rec = AiAnalysis(
            screening_id=s.id,
            image_id=image.id,
            model_version=model_name[:40],
            provider=provider_name,
            status="image_insufficient",
            research_label=None,
        )
        db.add(rec)
        db.commit()
        return {
            "analysis_id": rec.id,
            "status": "image_insufficient",
            "image_quality": image.quality_status,
            "image_quality_reason": image.quality_reason,
            "clinical_use": False,
            "warning": "NOT FOR CLINICAL USE",
        }
    path = storage / image.storage_key
    if not path.exists():
        raise HTTPException(404, "Stored file missing")
    raw = path.read_bytes()

    if use_ollama:
        patient = db.get(Patient, s.patient_id)
        context = {
            "view": image.view,
            "age": patient.age if patient else None,
            "sex": patient.sex if patient else None,
            "symptoms": s.symptoms,
            "duration": s.duration,
            "tobacco": s.tobacco,
            "exam_notes": s.exam_notes,
        }
        try:
            result = ollama_analyze(raw, s.id, context)
        except OllamaError as exc:
            rec = _record_failed_analysis(db, s, image.id, "ollama", model_name, user, "ai.fail", reason=str(exc))
            raise HTTPException(
                503,
                detail={
                    "message": f"AI analysis unavailable: {exc}. Screening is preserved for manual clinician review.",
                    "analysis_id": rec.id,
                    "status": "failed",
                    "clinical_use": False,
                },
            )
    else:
        result = mock_analyze(raw, s.id)
        result.setdefault("status", "completed")
        result.setdefault("feedback", None)

    rec = AiAnalysis(
        screening_id=s.id,
        image_id=image.id,
        model_version=result["model_version"],
        provider=result["provider"],
        research_label=result["research_label"],
        status=result["status"],
        warning=result["warning"],
        clinical_use=False,
        feedback=json.dumps(result["feedback"], ensure_ascii=False) if result.get("feedback") else None,
    )
    db.add(rec)
    db.flush()
    fb = result.get("feedback") or {}
    if not settings.LOCAL_QUALITY_CHECK and fb.get("image_assessment"):
        # Show the AI's quality verdict on the photo instead of a local blur/size result.
        assess = fb["image_assessment"]
        image.quality_status = "acceptable" if assess.get("usable", True) else "recapture"
        issues = assess.get("issues") or []
        image.quality_reason = str(issues[0])[:80] if (issues and not assess.get("usable", True)) else None
    s.status = "AWAITING_CLINICIAN"
    audit(db, user.id, "ai.analyze", f"analysis:{rec.id}")
    db.commit()
    return {
        "analysis_id": rec.id,
        "screening_id": s.id,
        "status": rec.status,
        "image_quality": image.quality_status,
        "provider": rec.provider,
        "model_version": rec.model_version,
        "research_label": rec.research_label,
        "score": None,
        "clinical_use": False,
        "requires_clinician_review": True,
        "warning": rec.warning,
        "feedback": result.get("feedback"),
    }


@router.post("/reviews")
def create_review(body: ReviewIn, db: Session = Depends(get_db), user: User = Depends(require_roles("medical_officer"))):
    s = db.get(Screening, body.screening_id)
    if not s:
        raise HTTPException(404, "Screening not found")
    assert_screening_access(db, user, s)
    existing = db.query(ClinicalReview).filter(ClinicalReview.screening_id == s.id).first()
    if existing:
        raise HTTPException(409, "A signed review already exists and cannot be silently overwritten")
    rec = ClinicalReview(
        screening_id=s.id,
        doctor_id=user.id,
        finding=body.finding,
        outcome=body.outcome,
        ai_agreement=body.ai_agreement,
    )
    db.add(rec)
    s.status = "REVIEWED"
    audit(db, user.id, "review.sign", f"review:{rec.id}")
    db.commit()
    db.refresh(rec)
    return {
        "id": rec.id,
        "screening_id": s.id,
        "finding": rec.finding,
        "outcome": rec.outcome,
        "ai_agreement": rec.ai_agreement,
        "signed_at": rec.signed_at.isoformat(),
    }


@router.post("/referrals")
def create_referral(body: ReferralIn, db: Session = Depends(get_db), user: User = Depends(require_roles("medical_officer"))):
    review = db.get(ClinicalReview, body.review_id)
    if not review:
        raise HTTPException(404, "Review not found")
    s = db.get(Screening, review.screening_id)
    rec = Referral(
        review_id=review.id,
        patient_id=s.patient_id,
        facility=body.facility,
        specialty=body.specialty,
        priority=body.priority,
        reason=body.reason,
        created_by=user.id,
    )
    db.add(rec)
    db.flush()
    task = NavigationTask(referral_id=rec.id, status="OPEN", due="7d")
    db.add(task)
    s.status = "REFERRAL_PLANNED"
    nav = db.query(User).filter(User.role == "navigator").first()
    spec = db.query(User).filter(User.role == "specialist").first()
    if nav:
        notify(db, nav.id, "New referral", "A referral needs navigation follow-up.")
    if spec:
        notify(db, spec.id, "New referred case", "A synthetic referred case is waiting.")
    audit(db, user.id, "referral.create", f"referral:{rec.id}")
    db.commit()
    return {
        "id": rec.id,
        "patient_id": rec.patient_id,
        "facility": rec.facility,
        "specialty": rec.specialty,
        "priority": rec.priority,
        "status": rec.status,
        "slip": {
            "en": f"Referral {rec.id[:8]} to {rec.facility} ({rec.specialty}). Priority: {rec.priority}.",
            "te": f"రెఫరల్ {rec.id[:8]} — {rec.facility} ({rec.specialty}). ప్రాధాన్యం: {rec.priority}.",
        },
    }


def referral_out(r: Referral, patient: Patient | None = None) -> dict:
    name = patient.full_name if patient else None
    village = patient.village if patient else None
    return {
        "id": r.id,
        "patient_id": r.patient_id,
        "patient_name": name,
        "village": village,
        "facility": r.facility,
        "specialty": r.specialty,
        "priority": r.priority,
        "status": r.status,
        "reason": r.reason,
        "slip": {
            "en": f"Referral {r.id[:8]} to {r.facility} ({r.specialty}). Priority: {r.priority}.",
            "te": f"రెఫరల్ {r.id[:8]} — {r.facility} ({r.specialty}). ప్రాధాన్యం: {r.priority}.",
        },
    }


@router.get("/referrals")
def list_referrals(db: Session = Depends(get_db), user: User = Depends(require_roles("medical_officer", "specialist", "navigator"))):
    rows = db.query(Referral).order_by(Referral.created_at.desc()).all()
    out = []
    for r in rows:
        patient = db.get(Patient, r.patient_id)
        out.append(referral_out(r, patient))
    return out


@router.get("/referrals/{referral_id}")
def get_referral(referral_id: str, db: Session = Depends(get_db), user: User = Depends(require_roles("medical_officer", "specialist", "navigator"))):
    rec = db.get(Referral, referral_id)
    if not rec:
        raise HTTPException(404, "Referral not found")
    return referral_out(rec, db.get(Patient, rec.patient_id))


MEET_RE = re.compile(r"^https://meet\.google\.com/(?:lookup/)?[A-Za-z0-9_-]{3,40}(?:-[A-Za-z0-9_-]{2,40}){0,3}(?:\?[^\s#]*)?$")


def clean_meet_url(url: str | None) -> str:
    url = (url or "").strip()
    if not MEET_RE.match(url):
        raise HTTPException(422, "Enter a valid Google Meet link, for example https://meet.google.com/abc-defg-hij")
    return url


# ---------- appointment / video-call notifications ----------

def parse_slot(slot: str | None) -> datetime | None:
    """Slots are ISO strings from the scheduler. Older free-text slots return None."""
    if not slot:
        return None
    try:
        dt = datetime.fromisoformat(slot.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def fmt_slot(slot: str | None) -> str:
    """Human text with the weekday, kept in the time zone the scheduler chose, e.g. 'Mon, 02 Nov 2026, 10:00 (UTC+05:30)'."""
    dt = parse_slot(slot)
    if not dt:
        return slot or "time to be confirmed"
    off = dt.strftime("%z")
    return f"{dt.strftime('%a, %d %b %Y, %H:%M')} (UTC{off[:3]}:{off[3:]})"


def appointment_parties(db: Session, ref: Referral) -> dict[str, set[str]]:
    """Who should hear about an appointment, grouped by role. Names/clinical details are never sent."""
    parties: dict[str, set[str]] = {"health_worker": set(), "medical_officer": set(), "navigator": set(), "specialist": set()}
    review = db.get(ClinicalReview, ref.review_id)
    screening = db.get(Screening, review.screening_id) if review else None
    patient = db.get(Patient, ref.patient_id)
    if screening and screening.examiner_id:
        parties["health_worker"].add(screening.examiner_id)
    if patient and patient.created_by:
        parties["health_worker"].add(patient.created_by)
    if review and review.doctor_id:
        parties["medical_officer"].add(review.doctor_id)
    for role in ("navigator", "specialist"):
        for u in db.query(User).filter(User.role == role, User.status == "active").all():
            parties[role].add(u.id)
    if not parties["health_worker"] and patient:
        for u in db.query(User).filter(User.role == "health_worker", User.status == "active", User.assigned_facility == patient.facility).all():
            parties["health_worker"].add(u.id)
    return parties


def notify_appointment(db: Session, rec: Appointment, actor: User, title: str, body: str, roles: set[str] | None = None, dedupe_minutes: int = 0) -> int:
    ref = db.get(Referral, rec.referral_id)
    if not ref:
        return 0
    tag = f" [appt:{rec.id}]"
    sent = 0
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=dedupe_minutes)
    seen: set[str] = set()
    for role, ids in appointment_parties(db, ref).items():
        if roles is not None and role not in roles:
            continue
        for uid_ in ids:
            if uid_ == actor.id or uid_ in seen:
                continue
            seen.add(uid_)
            if dedupe_minutes and (
                db.query(Notification)
                .filter(Notification.user_id == uid_, Notification.title == title, Notification.body.like(f"%{rec.id}%"), Notification.created_at >= cutoff)
                .first()
            ):
                continue
            notify(db, uid_, title, (body[: 255 - len(tag)] + tag))
            sent += 1
    return sent


def make_call_reminders(db: Session, user: User) -> None:
    """Lazy 'starting soon' reminders: created when the user's notifications are fetched."""
    now = datetime.now(timezone.utc)
    rows = db.query(Appointment).filter(Appointment.kind == "video", Appointment.status.in_(["REQUESTED", "CONFIRMED", "RESCHEDULED"])).all()
    changed = False
    for a in rows:
        dt = parse_slot(a.slot)
        if not dt or not (now - timedelta(minutes=15) <= dt <= now + timedelta(minutes=30)):
            continue
        ref = db.get(Referral, a.referral_id)
        if not ref or user.id not in set().union(*appointment_parties(db, ref).values()):
            continue
        title = "Video consultation starting soon"
        exists = db.query(Notification).filter(Notification.user_id == user.id, Notification.title == title, Notification.body.like(f"%{a.id}%")).first()
        if not exists:
            notify(db, user.id, title, f"Scheduled for {fmt_slot(a.slot)}. Be ready to join. [appt:{a.id}]")
            changed = True
    if changed:
        db.commit()


@router.post("/appointments")
def create_appointment(
    body: AppointmentIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("navigator", "specialist", "medical_officer")),
):
    ref = db.get(Referral, body.referral_id)
    if not ref:
        raise HTTPException(404, "Referral not found")
    if body.kind not in {"video", "physical"}:
        raise HTTPException(422, "Unknown appointment type")
    if body.start_now:
        if user.role != "specialist":
            raise HTTPException(403, "Only a specialist can start a video consultation immediately")
        if body.kind != "video":
            raise HTTPException(422, "Only video consultations can be started immediately")
        slot = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        status = "CONFIRMED"
    else:
        slot = body.slot
        status = body.status
        if parse_slot(slot) is None:
            raise HTTPException(422, "Pick a valid date and time")
    meet_url = clean_meet_url(body.meet_url) if body.kind == "video" else None
    rec = Appointment(
        referral_id=ref.id,
        kind=body.kind,
        slot=slot,
        status=status,
        video_provider="google_meet",
        video_url=meet_url,
        video_ref=meet_url.rsplit("/", 1)[-1].split("?")[0] if meet_url else None,
    )
    db.add(rec)
    s = db.query(Screening).join(ClinicalReview, ClinicalReview.screening_id == Screening.id).filter(
        ClinicalReview.id == ref.review_id
    ).first()
    if s:
        s.status = "APPOINTED"
    db.flush()
    label = "Video consultation" if rec.kind == "video" else "Hospital appointment"
    if body.start_now:
        notify_appointment(db, rec, user, "Video consultation is live", "The specialist has started the Google Meet call. Join now with the patient.", roles={"health_worker", "medical_officer", "navigator"})
        audit(db, user.id, "appointment.start_now", f"appointment:{rec.id}")
    else:
        via = " on Google Meet" if rec.kind == "video" else ""
        notify_appointment(db, rec, user, f"{label} scheduled", f"{label}{via} booked for {fmt_slot(rec.slot)}. No clinical details included.")
        audit(db, user.id, "appointment.create", f"appointment:{rec.id}")
    db.commit()
    db.refresh(rec)
    return {
        "id": rec.id,
        "referral_id": rec.referral_id,
        "kind": rec.kind,
        "slot": rec.slot,
        "status": rec.status,
        "video_ref": rec.video_ref,
        "has_meet_link": bool(rec.video_url),
    }


@router.patch("/appointments/{appointment_id}")
def patch_appointment(
    appointment_id: str,
    body: AppointmentPatch,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("navigator", "specialist", "medical_officer")),
):
    rec = db.get(Appointment, appointment_id)
    if not rec:
        raise HTTPException(404, "Appointment not found")
    allowed = {"REQUESTED", "CONFIRMED", "COMPLETED", "MISSED", "CANCELLED", "RESCHEDULED"}
    if body.status not in allowed:
        raise HTTPException(400, "Invalid appointment status")
    rec.status = body.status
    rec.attendance_outcome = body.attendance_outcome
    if body.slot:
        rec.slot = body.slot
    if body.meet_url and rec.kind == "video":
        rec.video_url = clean_meet_url(body.meet_url)
        rec.video_provider = "google_meet"
        rec.video_ref = rec.video_url.rsplit("/", 1)[-1].split("?")[0]
    label = "Video consultation" if rec.kind == "video" else "Appointment"
    if body.status == "MISSED":
        task = NavigationTask(referral_id=rec.referral_id, status="OVERDUE", contact_log="Missed appointment follow-up")
        db.add(task)
        notify_appointment(db, rec, user, "Missed appointment", "Follow-up required. No clinical details included.")
    elif body.status == "RESCHEDULED":
        notify_appointment(db, rec, user, f"{label} rescheduled", f"New time: {fmt_slot(rec.slot)}.")
    elif body.status == "CANCELLED":
        notify_appointment(db, rec, user, f"{label} cancelled", f"The booking for {fmt_slot(rec.slot)} was cancelled.")
    elif body.status == "CONFIRMED":
        notify_appointment(db, rec, user, f"{label} confirmed", f"Confirmed for {fmt_slot(rec.slot)}.")
    elif body.status == "COMPLETED":
        notify_appointment(db, rec, user, f"{label} completed", "The consultation was marked completed.", roles={"health_worker", "medical_officer", "navigator"})
    if body.status == "COMPLETED":
        ref = db.get(Referral, rec.referral_id)
        if ref:
            ref.status = "ASSESSED"
    audit(db, user.id, "appointment.status", f"appointment:{rec.id}", body.status)
    db.commit()
    return {"id": rec.id, "status": rec.status, "attendance_outcome": rec.attendance_outcome}


def appointment_out(a: Appointment) -> dict:
    return {
        "id": a.id,
        "referral_id": a.referral_id,
        "kind": a.kind,
        "slot": a.slot,
        "status": a.status,
        "video_ref": a.video_ref,
        "has_meet_link": bool(a.video_url),
        "attendance_outcome": a.attendance_outcome,
    }


@router.get("/appointments")
def list_appointments(db: Session = Depends(get_db), user: User = Depends(require_roles("navigator", "specialist", "medical_officer", "health_worker"))):
    rows = db.query(Appointment).order_by(Appointment.created_at.desc()).all()
    return [appointment_out(a) for a in rows]


@router.get("/appointments/{appointment_id}")
def get_appointment(
    appointment_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("navigator", "specialist", "medical_officer", "health_worker")),
):
    rec = db.get(Appointment, appointment_id)
    if not rec:
        raise HTTPException(404, "Appointment not found")
    return appointment_out(rec)


@router.get("/appointments/{appointment_id}/video")
def video_token(
    appointment_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("specialist", "health_worker", "medical_officer")),
):
    rec = db.get(Appointment, appointment_id)
    if not rec or rec.kind != "video":
        raise HTTPException(404, "Video appointment not found")
    if rec.status in {"CANCELLED"}:
        raise HTTPException(403, "Meeting link is not active")
    audit(db, user.id, "video.join", f"appointment:{rec.id}")
    if user.role == "health_worker":
        notify_appointment(db, rec, user, "Health worker joined the video call", "The patient side is ready. Join the consultation.", roles={"specialist", "medical_officer"}, dedupe_minutes=10)
    else:
        notify_appointment(db, rec, user, "Video consultation is live", "The doctor has started the call. Join now with the patient.", roles={"health_worker", "navigator"}, dedupe_minutes=10)
    db.commit()
    if not rec.video_url:
        raise HTTPException(409, "No Google Meet link has been added to this appointment yet")
    return {
        "provider": "google_meet",
        "room": rec.video_ref,
        "url": rec.video_url,
        "recording_default": False,
        "warning": "Synthetic demo consultation only.",
    }


@router.post("/investigations")
def create_investigation(
    body: InvestigationIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("specialist", "medical_officer")),
):
    ref = db.get(Referral, body.referral_id)
    if not ref:
        raise HTTPException(404, "Referral not found")
    rec = Investigation(referral_id=ref.id, kind=body.kind, state="ADVISED")
    db.add(rec)
    audit(db, user.id, "investigation.create", f"investigation:{rec.id}")
    db.commit()
    db.refresh(rec)
    return {"id": rec.id, "kind": rec.kind, "state": rec.state, "referral_id": rec.referral_id}


@router.patch("/investigations/{investigation_id}")
def patch_investigation(
    investigation_id: str,
    body: InvestigationPatch,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("specialist", "medical_officer")),
):
    rec = db.get(Investigation, investigation_id)
    if not rec:
        raise HTTPException(404, "Investigation not found")
    allowed = {
        "ADVISED",
        "SCHEDULED",
        "SAMPLE_COLLECTED",
        "REPORT_PENDING",
        "REPORT_RECEIVED",
        "CLINICIAN_REVIEWED",
    }
    if body.state not in allowed:
        raise HTTPException(400, "Invalid investigation state")
    rec.state = body.state
    if body.report_note is not None:
        rec.report_note = body.report_note
    if body.clinician_result is not None:
        rec.clinician_result = body.clinician_result
    if body.state == "CLINICIAN_REVIEWED":
        ref = db.get(Referral, rec.referral_id)
        if ref:
            s = (
                db.query(Screening)
                .join(ClinicalReview, ClinicalReview.screening_id == Screening.id)
                .filter(ClinicalReview.id == ref.review_id)
                .first()
            )
            if s:
                s.status = "RESULT_REVIEWED"
    audit(db, user.id, "investigation.status", f"investigation:{rec.id}", body.state)
    db.commit()
    return {
        "id": rec.id,
        "state": rec.state,
        "report_note": rec.report_note,
        "clinician_result": rec.clinician_result,
    }


@router.get("/investigations")
def list_investigations(db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role == "admin":
        raise HTTPException(403, "Administrators receive aggregate data only")
    rows = db.query(Investigation).order_by(Investigation.created_at.desc()).all()
    return [{"id": i.id, "referral_id": i.referral_id, "kind": i.kind, "state": i.state, "report_note": i.report_note, "clinician_result": i.clinician_result} for i in rows]


@router.get("/navigation")
def list_nav(db: Session = Depends(get_db), user: User = Depends(require_roles("navigator", "medical_officer"))):
    rows = db.query(NavigationTask).order_by(NavigationTask.created_at.desc()).all()
    out = []
    for t in rows:
        ref = db.get(Referral, t.referral_id)
        patient = db.get(Patient, ref.patient_id) if ref else None
        out.append(
            {
                "id": t.id,
                "referral_id": t.referral_id,
                "patient_name": patient.full_name if patient else None,
                "village": patient.village if patient else None,
                "facility": ref.facility if ref else None,
                "status": t.status,
                "due": t.due,
                "contact_log": t.contact_log,
            }
        )
    return out


@router.patch("/navigation/{task_id}")
def patch_nav(task_id: str, body: NavPatch, db: Session = Depends(get_db), user: User = Depends(require_roles("navigator"))):
    rec = db.get(NavigationTask, task_id)
    if not rec:
        raise HTTPException(404, "Task not found")
    if body.status:
        rec.status = body.status
    if body.contact_log:
        rec.contact_log = (rec.contact_log or "") + "\n" + body.contact_log
    if body.due:
        rec.due = body.due
    rec.owner_id = user.id
    if rec.status == "CLOSED":
        ref = db.get(Referral, rec.referral_id)
        if ref:
            ref.status = "CARE_LINKED"
            s = (
                db.query(Screening)
                .join(ClinicalReview, ClinicalReview.screening_id == Screening.id)
                .filter(ClinicalReview.id == ref.review_id)
                .first()
            )
            if s:
                s.status = "CARE_LINKED"
    audit(db, user.id, "navigation.update", f"nav:{rec.id}")
    db.commit()
    return {"id": rec.id, "status": rec.status, "contact_log": rec.contact_log}


@router.get("/patients/{patient_id}/timeline")
def timeline(patient_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    patient = get_patient_or_404(db, patient_id)
    assert_patient_access(user, patient, db)
    events = []
    events.append({"type": "registration", "at": patient.created_at.isoformat(), "summary": "Patient registered"})
    for c in db.query(Consent).filter(Consent.patient_id == patient_id):
        events.append({"type": "consent", "at": c.created_at.isoformat(), "summary": f"Consent {c.purpose}"})
    for s in db.query(Screening).filter(Screening.patient_id == patient_id):
        events.append({"type": "screening", "at": s.created_at.isoformat(), "summary": f"Screening {s.status}", "id": s.id})
        for a in db.query(AiAnalysis).filter(AiAnalysis.screening_id == s.id):
            events.append({"type": "ai", "at": a.created_at.isoformat(), "summary": f"AI {a.status} ({a.research_label or 'n/a'}) — NOT CLINICAL"})
        for r in db.query(ClinicalReview).filter(ClinicalReview.screening_id == s.id):
            events.append({"type": "review", "at": r.signed_at.isoformat(), "summary": f"Signed review: {r.outcome}"})
    for ref in db.query(Referral).filter(Referral.patient_id == patient_id):
        events.append({"type": "referral", "at": ref.created_at.isoformat(), "summary": f"Referral to {ref.facility}", "id": ref.id})
        for ap in db.query(Appointment).filter(Appointment.referral_id == ref.id):
            events.append({"type": "appointment", "at": ap.created_at.isoformat(), "summary": f"{ap.kind} {ap.status}", "id": ap.id})
        for inv in db.query(Investigation).filter(Investigation.referral_id == ref.id):
            events.append({"type": "investigation", "at": inv.created_at.isoformat(), "summary": f"{inv.kind} {inv.state}"})
    events.sort(key=lambda e: e["at"])
    return {"patient": patient_out(patient), "events": events}


@router.get("/dashboard/summary")
def dashboard(db: Session = Depends(get_db), user: User = Depends(require_roles("admin", "medical_officer"))):
    def count(model, **kw):
        q = db.query(model)
        for k, v in kw.items():
            q = q.filter(getattr(model, k) == v)
        return q.count()

    payload = {
        "screenings": count(Screening),
        "reviews": count(ClinicalReview),
        "referrals": count(Referral),
        "appointments_completed": db.query(Appointment).filter(Appointment.status == "COMPLETED").count(),
        "appointments_overdue": db.query(Appointment).filter(Appointment.status.in_(["MISSED", "REQUESTED"])).count(),
        "investigations_pending": db.query(Investigation).filter(Investigation.state != "CLINICIAN_REVIEWED").count(),
        "investigations_done": db.query(Investigation).filter(Investigation.state == "CLINICIAN_REVIEWED").count(),
        "navigation_open": db.query(NavigationTask).filter(NavigationTask.status.in_(["OPEN", "OVERDUE"])).count(),
        "ai_suspicious_demo": db.query(AiAnalysis).filter(AiAnalysis.research_label == "suspicious_example").count(),
        "note": "Aggregated synthetic programme indicators only. Admin accounts cannot open identifiable records.",
    }
    audit(db, user.id, "dashboard.view", "dashboard:summary")
    db.commit()
    return payload


@router.get("/audit")
def list_audit(db: Session = Depends(get_db), user: User = Depends(require_roles("admin", "medical_officer"))):
    rows = db.query(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(500).all()
    actors = {u.id: u for u in db.query(User).all()}
    return [
        {
            "id": a.id,
            "actor_id": a.actor_id,
            "actor_name": actors[a.actor_id].full_name if a.actor_id in actors else None,
            "actor_role": actors[a.actor_id].role if a.actor_id in actors else None,
            "event": a.event,
            "resource": a.resource,
            "created_at": a.created_at.isoformat(),
        }
        for a in rows
    ]


@router.get("/notifications")
def list_notes(db: Session = Depends(get_db), user: User = Depends(current_user)):
    make_call_reminders(db, user)
    rows = db.query(Notification).filter(Notification.user_id == user.id).order_by(Notification.created_at.desc()).all()
    return [{"id": n.id, "title": n.title, "body": n.body, "read": n.read, "created_at": n.created_at.isoformat()} for n in rows]


@router.patch("/notifications/{note_id}")
def read_note(note_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    rec = db.get(Notification, note_id)
    if not rec or rec.user_id != user.id:
        raise HTTPException(404, "Notification not found")
    rec.read = True
    db.commit()
    return {"id": rec.id, "read": True}


def _work_status(db: Session, u: User) -> dict:
    """Role-specific work figures shown on the admin user page. Counts only, no patient identities."""
    def n(q):
        return q.count()

    out: dict = {}
    if u.role == "health_worker":
        out = {
            "patients_registered": n(db.query(Patient).filter(Patient.created_by == u.id)),
            "screenings_done": n(db.query(Screening).filter(Screening.examiner_id == u.id)),
            "photos_uploaded": n(db.query(ImageRecord).filter(ImageRecord.created_by == u.id)),
            "awaiting_clinician": n(db.query(Screening).filter(Screening.examiner_id == u.id, Screening.status == "AWAITING_CLINICIAN")),
        }
    elif u.role == "medical_officer":
        out = {
            "reviews_signed": n(db.query(ClinicalReview).filter(ClinicalReview.doctor_id == u.id)),
            "referrals_created": n(db.query(Referral).filter(Referral.created_by == u.id)),
            "cases_waiting_review": n(db.query(Screening).filter(Screening.status.in_(["AWAITING_CLINICIAN", "SCREENED"]))),
        }
    elif u.role == "specialist":
        out = {
            "referrals_in_system": n(db.query(Referral)),
            "appointments_completed": n(db.query(Appointment).filter(Appointment.status == "COMPLETED")),
            "appointments_open": n(db.query(Appointment).filter(Appointment.status.in_(["REQUESTED", "CONFIRMED", "SCHEDULED", "RESCHEDULED"]))),
            "investigations_reviewed": n(db.query(Investigation).filter(Investigation.state == "CLINICIAN_REVIEWED")),
            "investigations_pending": n(db.query(Investigation).filter(Investigation.state != "CLINICIAN_REVIEWED")),
        }
    elif u.role == "navigator":
        out = {
            "tasks_assigned": n(db.query(NavigationTask).filter(NavigationTask.owner_id == u.id)),
            "tasks_open": n(db.query(NavigationTask).filter(NavigationTask.owner_id == u.id, NavigationTask.status.in_(["OPEN", "OVERDUE"]))),
            "tasks_closed": n(db.query(NavigationTask).filter(NavigationTask.owner_id == u.id, NavigationTask.status.notin_(["OPEN", "OVERDUE"]))),
            "unassigned_tasks": n(db.query(NavigationTask).filter(NavigationTask.owner_id.is_(None))),
        }
    events = db.query(AuditEvent).filter(AuditEvent.actor_id == u.id).order_by(AuditEvent.created_at.desc())
    out["audit_events"] = events.count()
    last = events.first()
    return {
        "metrics": out,
        "last_activity": last.created_at.isoformat() if last else None,
        "recent_activity": [
            {"event": e.event, "resource": e.resource, "created_at": e.created_at.isoformat()} for e in events.limit(8).all()
        ],
    }


@router.get("/admin/users")
def admin_list_users(status: str | None = None, role: str | None = None, db: Session = Depends(get_db), user: User = Depends(require_roles("admin"))):
    q = db.query(User).filter(User.role != "admin")
    if status:
        q = q.filter(User.status == status)
    if role:
        q = q.filter(User.role == role)
    rows = q.order_by(User.created_at.desc()).all()
    return [user_out(u) for u in rows]


@router.get("/admin/users/{user_id}")
def admin_get_user(user_id: str, db: Session = Depends(get_db), user: User = Depends(require_roles("admin"))):
    u = db.get(User, user_id)
    if not u or u.role == "admin":
        raise HTTPException(404, "User not found")
    audit(db, user.id, "admin.user.view", f"user:{u.id}")
    db.commit()
    return {"user": user_out(u), "work": _work_status(db, u)}


def _decide_user(user_id: str, decision: str, db: Session, admin: User) -> dict:
    u = db.get(User, user_id)
    if not u or u.role == "admin":
        raise HTTPException(404, "User not found")
    if u.status != "pending":
        raise HTTPException(409, f"Registration already {u.status}")
    u.status = "active" if decision == "approve" else "rejected"
    notify(db, u.id, "Registration " + ("approved" if decision == "approve" else "declined"), "Your account was reviewed by the district admin.")
    audit(db, admin.id, f"admin.user.{decision}", f"user:{u.id}", json.dumps({"role": u.role}))
    db.commit()
    return user_out(u)


@router.post("/admin/users/{user_id}/approve")
def approve_user(user_id: str, db: Session = Depends(get_db), user: User = Depends(require_roles("admin"))):
    return _decide_user(user_id, "approve", db, user)


@router.post("/admin/users/{user_id}/reject")
def reject_user(user_id: str, db: Session = Depends(get_db), user: User = Depends(require_roles("admin"))):
    return _decide_user(user_id, "reject", db, user)


@router.post("/admin/reset-demo")
def reset_demo(db: Session = Depends(get_db), user: User = Depends(require_roles("admin"))):
    for model in (
        Notification,
        AuditEvent,
        NavigationTask,
        Investigation,
        Appointment,
        Referral,
        ClinicalReview,
        AiAnalysis,
        ImageRecord,
        Screening,
        Consent,
        IdempotencyRecord,
        Patient,
    ):
        db.query(model).delete()
    db.commit()
    from .seed import seed_if_empty

    seed_if_empty(db)
    audit(db, user.id, "demo.reset", "system")
    db.commit()
    return {"ok": True, "message": "Synthetic demo data reset"}
