from sqlalchemy.orm import Session

from .models import Patient, User
from .security import hash_password

DEMO_PASSWORD = "Demo@123"

USERS = [
    ("hw@demo.local", "Lakshmi Health Worker", "health_worker"),
    ("mo@demo.local", "Dr. Rao Medical Officer", "medical_officer"),
    ("spec@demo.local", "Dr. Padma Specialist", "specialist"),
    ("nav@demo.local", "Ravi Navigator", "navigator"),
    ("admin@demo.local", "District Admin", "admin"),
]


def seed_if_empty(db: Session) -> None:
    if not db.query(User).first():
        for email, name, role in USERS:
            db.add(
                User(
                    email=email,
                    full_name=name,
                    password_hash=hash_password(DEMO_PASSWORD),
                    role=role,
                    assigned_facility="PHC G. Madugula",
                )
            )
        db.flush()
    if db.query(Patient).first():
        db.commit()
        return
    hw = db.query(User).filter(User.email == "hw@demo.local").first()
    db.add(
        Patient(
            full_name="Synthetic Demo Patient — G. Madugula",
            age=46,
            sex="female",
            phone="9000000001",
            village="G. Madugula",
            habitation="Demo habitation",
            gram_panchayat="G. Madugula",
            mandal="G. Madugula",
            phc="PHC G. Madugula",
            tobacco_use="gutkha daily",
            symptoms="white patch inner cheek, 3 weeks",
            medical_history="No prior oral screening on record (synthetic)",
            facility="PHC G. Madugula",
            created_by=hw.id if hw else None,
            duplicate_hint=None,
        )
    )
    db.commit()
