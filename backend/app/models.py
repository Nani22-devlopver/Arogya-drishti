import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def uid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(160))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(40), index=True)
    assigned_facility: Mapped[str] = mapped_column(String(120), default="PHC G. Madugula")
    status: Mapped[str] = mapped_column(String(20), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    full_name: Mapped[str] = mapped_column(String(160), index=True)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sex: Mapped[str | None] = mapped_column(String(20), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), index=True, nullable=True)
    email: Mapped[str | None] = mapped_column(String(120), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    village: Mapped[str | None] = mapped_column(String(120), nullable=True)
    habitation: Mapped[str | None] = mapped_column(String(120), nullable=True)
    gram_panchayat: Mapped[str | None] = mapped_column(String(120), nullable=True)
    mandal: Mapped[str | None] = mapped_column(String(120), nullable=True)
    phc: Mapped[str | None] = mapped_column(String(120), nullable=True)
    tobacco_use: Mapped[str | None] = mapped_column(String(80), nullable=True)
    symptoms: Mapped[str | None] = mapped_column(Text, nullable=True)
    medical_history: Mapped[str | None] = mapped_column(Text, nullable=True)
    duplicate_hint: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    facility: Mapped[str] = mapped_column(String(120), default="PHC G. Madugula")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Consent(Base):
    __tablename__ = "consents"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id"), index=True)
    purpose: Mapped[str] = mapped_column(String(80))
    language: Mapped[str] = mapped_column(String(20))
    method: Mapped[str] = mapped_column(String(40), default="verbal_plus_checkbox")
    version: Mapped[str] = mapped_column(String(20), default="v1")
    granted: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Screening(Base):
    __tablename__ = "screenings"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id"), index=True)
    examiner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(40), default="DRAFT", index=True)
    symptoms: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration: Mapped[str | None] = mapped_column(String(80), nullable=True)
    tobacco: Mapped[str | None] = mapped_column(String(80), nullable=True)
    exam_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    sync_status: Mapped[str] = mapped_column(String(20), default="confirmed")
    idempotency_key: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ImageRecord(Base):
    __tablename__ = "images"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    screening_id: Mapped[str] = mapped_column(String(36), ForeignKey("screenings.id"), index=True)
    view: Mapped[str] = mapped_column(String(40), default="unspecified")
    checksum: Mapped[str] = mapped_column(String(64))
    storage_key: Mapped[str] = mapped_column(String(255))
    quality_status: Mapped[str] = mapped_column(String(20), default="pending")
    quality_reason: Mapped[str | None] = mapped_column(String(80), nullable=True)
    blur_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AiAnalysis(Base):
    __tablename__ = "ai_analyses"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    image_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("images.id"), nullable=True)
    screening_id: Mapped[str] = mapped_column(String(36), ForeignKey("screenings.id"), index=True)
    model_version: Mapped[str] = mapped_column(String(40))
    provider: Mapped[str] = mapped_column(String(40))
    research_label: Mapped[str | None] = mapped_column(String(80), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="completed")
    warning: Mapped[str] = mapped_column(String(120), default="NOT FOR CLINICAL USE")
    clinical_use: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ClinicalReview(Base):
    __tablename__ = "clinical_reviews"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    screening_id: Mapped[str] = mapped_column(String(36), ForeignKey("screenings.id"), index=True)
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    finding: Mapped[str] = mapped_column(Text)
    outcome: Mapped[str] = mapped_column(String(80))
    ai_agreement: Mapped[str] = mapped_column(String(40), default="deferred")
    signed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    version: Mapped[int] = mapped_column(Integer, default=1)


class Referral(Base):
    __tablename__ = "referrals"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    review_id: Mapped[str] = mapped_column(String(36), ForeignKey("clinical_reviews.id"))
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id"), index=True)
    facility: Mapped[str] = mapped_column(String(160))
    specialty: Mapped[str] = mapped_column(String(80), default="Oral surgery / ENT")
    priority: Mapped[str] = mapped_column(String(20), default="routine")
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="OPEN")
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Appointment(Base):
    __tablename__ = "appointments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    referral_id: Mapped[str] = mapped_column(String(36), ForeignKey("referrals.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20), default="physical")
    slot: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(40), default="REQUESTED")
    video_ref: Mapped[str | None] = mapped_column(String(160), nullable=True)
    attendance_outcome: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Investigation(Base):
    __tablename__ = "investigations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    referral_id: Mapped[str] = mapped_column(String(36), ForeignKey("referrals.id"), index=True)
    kind: Mapped[str] = mapped_column(String(80), default="biopsy")
    state: Mapped[str] = mapped_column(String(40), default="ADVISED")
    report_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    clinician_result: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class NavigationTask(Base):
    __tablename__ = "navigation_tasks"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    referral_id: Mapped[str] = mapped_column(String(36), ForeignKey("referrals.id"), index=True)
    owner_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    due: Mapped[str | None] = mapped_column(String(40), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="OPEN")
    contact_log: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    actor_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    event: Mapped[str] = mapped_column(String(80), index=True)
    resource: Mapped[str] = mapped_column(String(120))
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(String(255))
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_keys"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    resource_type: Mapped[str] = mapped_column(String(40))
    resource_id: Mapped[str] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
