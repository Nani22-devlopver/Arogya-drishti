from fastapi import HTTPException
from sqlalchemy.orm import Session

from .models import Patient, Referral, Screening, User


CLINICAL_ROLES = {"health_worker", "medical_officer", "specialist", "navigator"}


def audit(db: Session, actor_id: str | None, event: str, resource: str, meta: str | None = None):
    from .models import AuditEvent

    db.add(AuditEvent(actor_id=actor_id, event=event, resource=resource, metadata_json=meta))


def notify(db: Session, user_id: str, title: str, body: str):
    from .models import Notification

    db.add(Notification(user_id=user_id, title=title, body=body))


def patient_visible(user: User, patient: Patient) -> bool:
    if user.role == "admin":
        return False
    if user.role == "health_worker":
        return patient.facility == user.assigned_facility
    if user.role == "medical_officer":
        return patient.facility == user.assigned_facility
    if user.role in {"specialist", "navigator"}:
        return True
    return False


def get_patient_or_404(db: Session, patient_id: str) -> Patient:
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    return patient


def assert_patient_access(user: User, patient: Patient, db: Session | None = None):
    if user.role == "admin":
        raise HTTPException(403, "Administrators receive aggregate data only")
    if user.role in {"specialist", "navigator"}:
        linked = (
            db.query(Referral)
            .filter(Referral.patient_id == patient.id)
            .first()
            if db
            else None
        )
        if not linked:
            raise HTTPException(403, "Access is limited to referred cases")
        return
    if not patient_visible(user, patient):
        raise HTTPException(403, "Access denied for this patient record")


def assert_screening_access(db: Session, user: User, screening: Screening):
    patient = get_patient_or_404(db, screening.patient_id)
    assert_patient_access(user, patient, db)
    if user.role == "navigator":
        raise HTTPException(403, "Navigators cannot open screening photographs or exam notes")
