# Aarogya Drishti

**An AI-assisted oral cancer early-detection, telemedicine and patient-care platform for remote tribal communities.**

Built for the **AAROHAN Inter-Centre Hackathon 2026**, organised by ITDA Paderu, Alluri Sitharama Raju District, Andhra Pradesh.

> **⚠️ NOT FOR CLINICAL USE.**
> This project is a hackathon demonstration that uses **synthetic data only**. Any AI output is an advisory research demonstration. It must never be used to diagnose, reassure or make decisions about real patients. Real-world use would require health-department approval, qualified clinical supervision, an independent security assessment, and any required medical-device and research permissions.

---

## Table of Contents

1. [Overview](#1-overview)
2. [The Problem](#2-the-problem)
3. [Our Solution](#3-our-solution)
4. [Key Features](#4-key-features)
5. [End-to-End Patient Workflow](#5-end-to-end-patient-workflow)
6. [User Roles and Permissions](#6-user-roles-and-permissions)
7. [System Architecture](#7-system-architecture)
8. [Tech Stack](#8-tech-stack)
9. [Repository Structure](#9-repository-structure)
10. [Data Model](#10-data-model)
11. [Case State Machine](#11-case-state-machine)
12. [API Overview](#12-api-overview)
13. [AI Module](#13-ai-module)
14. [Image Capture and Quality Control](#14-image-capture-and-quality-control)
15. [Telugu, Low-Literacy and Offline-First Design](#15-telugu-low-literacy-and-offline-first-design)
16. [Telemedicine and Appointments](#16-telemedicine-and-appointments)
17. [Security and Privacy](#17-security-and-privacy)
18. [Testing](#18-testing)
19. [Getting Started](#19-getting-started)
20. [Environment Variables](#20-environment-variables)
21. [Deployment](#21-deployment)
22. [Demo Accounts and Synthetic Data](#22-demo-accounts-and-synthetic-data)
23. [Live Demo Script](#23-live-demo-script)
24. [Documentation Index](#24-documentation-index)
25. [Project Timeline](#25-project-timeline)
26. [Known Limitations](#26-known-limitations)
27. [Team and Contributions](#27-team-and-contributions)
28. [AI Tools and Third-Party Disclosure](#28-ai-tools-and-third-party-disclosure)
29. [License](#29-license)
30. [Acknowledgements](#30-acknowledgements)

---

## 1. Overview

**Aarogya Drishti** ("Vision for Health") is a complete, secure, deployable digital platform that connects every step of the oral-cancer care pathway, from a village-level oral examination to timely specialist diagnosis and treatment follow-up.

It brings together patients, village health workers, medical officers, specialists, patient navigators, diagnostic facilities and district administrators in **one continuous healthcare workflow**.

| Item | Detail |
|---|---|
| Event | AAROHAN Inter-Centre Hackathon 2026 |
| Organiser | ITDA Paderu, Alluri Sitharama Raju District, Andhra Pradesh |
| Dates | 27 October – 4 November 2026 |
| Theme | AI for Public Health · Technology for Tribal Communities · From Screening to Treatment |
| Team size | Maximum 5 students |
| Data policy | Synthetic or authorised demonstration data only |

## 2. The Problem

Oral cancer is a significant public-health concern. Early detection is difficult in remote tribal areas because access to specialists is limited. Suspicious lesions are often noticed late, referrals are not always completed, and patients are lost between screening and treatment.

**Challenge statement:** *Can we build a technology platform that helps detect suspicious oral lesions early and ensures that patients in remote tribal villages receive timely medical care?*

## 3. Our Solution

Aarogya Drishti is not a collection of design screens. It is a working product that:

- Lets a health worker **register a patient with consent** and capture oral photographs on an Android phone, even **offline**.
- Runs an **image-quality check** and a clearly labelled **mock/research AI pipeline** that returns structured, advisory-only output.
- Requires an **independent Medical Officer review**, so AI can never bypass a clinician.
- Supports **specialist referral, appointment booking and secure video consultation**.
- Tracks **biopsy/pathology (simulated), diagnosis entered by a clinician, treatment and follow-up**.
- Gives district administrators an **aggregate monitoring dashboard**.
- Works in **Telugu and English**, with strong security and an audit trail.

Inspiration: the oral-cancer screening work of **IISc TANUH** and **Aarogya Aarohan**, which use smartphone images and AI-assisted assessment. This project builds on those concepts as a student hackathon demonstration and is not affiliated with or endorsed by them.

## 4. Key Features

| # | Module | Description |
|---|---|---|
| 1 | **Health Worker Mobile App** | PWA for registration, consent, clinical checklist, guided photo capture, offline drafts and sync |
| 2 | **AI Screening Module** | OpenCV image-quality checks plus a versioned, pluggable mock/research AI adapter |
| 3 | **Medical Officer and Specialist Portal** | Role-scoped work queue, case review, signed clinical notes, referral actions |
| 4 | **Telemedicine / Video Consultation** | Two-party secure video with authenticated, time-limited meeting tokens |
| 5 | **Referral and Appointment System** | Referral creation, hospital linkage, appointment status tracking and reminders |
| 6 | **Diagnostic and Treatment Tracking** | Simulated biopsy/pathology reports, clinician-entered diagnosis, treatment progress |
| 7 | **Patient Record Management** | Unified, secure longitudinal patient record with patient-level access control |
| 8 | **District Monitoring Dashboard** | Aggregate screening, referral and follow-up metrics (no identifiable data by default) |
| 9 | **Telugu and English Interface** | Stable translation dictionary, large touch targets, minimal typing |
| 10 | **Offline Functionality** | Encrypted/protected local drafts, idempotent retry queue, safe sync |
| 11 | **Security and Privacy** | Deny-by-default authorisation, private image storage, append-only audit log |
| 12 | **Easy-to-Use Design** | Plain-language instructions, clear progress steps, visible save confirmation |

## 5. End-to-End Patient Workflow

```
Patient visits health camp / PHC
        │
        ▼
1. Register patient & consent ──► 2. Capture oral photos (guided, retake allowed)
        │
        ▼
3. Image quality check ──► 4. Experimental AI analysis (advisory only)
        │
        ▼
5. Medical Officer review (independent of AI) ──► clinical decision
        │
        ├── Routine follow-up
        ├── Need more information / images / tests
        └── Refer to specialist
                │
                ▼
6. Video consultation / referral & appointment
        │
        ▼
7. Diagnostics (simulated biopsy / histopathology if needed)
        │
        ▼
8. Treatment tracking & follow-up (patient navigator)
        │
        ▼
9. District dashboard (aggregate monitoring)
```

> **Safety rule:** AI output is advisory only. A clinician must always review, and only clinician-authorised events can mark a case as a confirmed diagnosis in the simulated workflow.

## 6. User Roles and Permissions

| Role | Allowed actions | Restricted actions |
|---|---|---|
| **Patient** | View own records, get appointments, join video consultation, give consent | No access to other patients' data |
| **Village Health Worker (ASHA/ANM)** | Register patients, take consent, intake, capture images, track assigned follow-up | Cannot confirm cancer; cannot view unrelated cases |
| **PHC Medical Officer** | Review AI results and images, record clinical findings, create referrals, view patient history | Cannot silently rewrite another signed review |
| **Specialist (ENT/Oncology)** | View referred cases, conduct video consultations, advise treatment, order diagnostics | Cannot browse all district patients |
| **Patient Navigator** | Appointments, contacts, transport, missed-visit workflow, reminders | Cannot access unnecessary images or change diagnosis |
| **Laboratory / Diagnostic Facility** | View test orders, upload reports, update status | No access beyond assigned orders |
| **District Administrator** | Aggregate screening and referral trends, reports | No default access to identifiable patient records or images |
| **System Administrator** | Manage users and roles, configure system, view audit logs | Privileged actions require MFA and are audited |

Authorisation is enforced on the **backend**, checking both role **and** patient/facility-level access on every query. Default policy is **deny**.

## 7. System Architecture

```
┌──────────────────────────── Client Applications ────────────────────────────┐
│ Health Worker PWA │ Patient Portal │ Medical Officer │ Specialist │ Admin    │
│ (Telugu/English)  │ (Web/Mobile)   │ Portal (Web)    │ (Web)      │ (Web)    │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    ▼
                         API Gateway (REST APIs)
                                    │
┌───────────────────────── Backend Services (FastAPI) ─────────────────────────┐
│ Auth & RBAC · Patient & Consent · Screening & AI · Referral & Appointment     │
│ Clinical Records · Diagnostics · Patient Navigation · Notification · Audit    │
└──────┬───────────────────────────┬──────────────────────────┬────────────────┘
       ▼                           ▼                          ▼
  Data Layer                  AI Services               External Services
  PostgreSQL                  Image quality (OpenCV)    Video consultation (WebRTC)
  Private object storage      Mock / research adapter   SMS / email gateway
  Audit log store
```

**Core data flow:**
Health worker → signed-in PWA → authenticated FastAPI → database + private images → AI adapter (research only) → stored AI observation → Medical Officer → video or physical specialist → diagnostics → navigator → aggregate dashboard.

**Resilience principle:** the clinical workflow **must continue if the AI service is unavailable**.

## 8. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite, PWA |
| Backend | FastAPI (Python 3.11+) |
| Database | PostgreSQL, SQLAlchemy, Alembic migrations |
| Image / AI | OpenCV (quality checks), pluggable adapter, optional research model (PyTorch EfficientNet-B0) |
| Storage | Private object storage with short-lived signed access |
| Video | Approved demo video SDK (two-party, token-based) |
| Deployment | Docker, Docker Compose, cloud hosting |
| Testing | Unit, API integration, browser/mobile E2E, authorisation and security tests |

> Alternatives may be used if functionality and security are demonstrated. Update this table to match what the team actually ships.

## 9. Repository Structure

```
aarogya-drishti/
├── apps/
│   └── web/              # React + TypeScript PWA (health worker, clinician, admin UI)
├── services/
│   ├── api/              # FastAPI: authorisation, clinical workflow, database access
│   └── ai/               # Image-quality checker + mock/research AI adapters
├── infra/                # Docker and deployment manifests
├── docs/                 # Architecture, permissions, API, threat model, test report
├── tests/                # Integration, E2E and security tests
├── .env.example          # Placeholders ONLY, never real secrets
└── README.md
```

## 10. Data Model

| Entity | Key fields | Controls |
|---|---|---|
| `users` | id, role, assigned_facility, status, auth_id | Unique identity, active status |
| `patients` | id, demographics, residence, contact, duplicate_hint | PII limited to authorised users |
| `consents` | id, patient_id, purpose, language, timestamp, version | Immutable consent history |
| `screenings` | id, patient_id, examiner_id, date, symptoms, tobacco, exam | Clinician findings kept distinct from AI |
| `images` | id, screening_id, private_key, checksum, view, quality | Private blob, per-record authorisation |
| `ai_analyses` | id, image_id, model_version, research_label, status | Always non-clinical |
| `clinical_reviews` | id, screening_id, doctor_id, finding, signed_at | Only a clinician can finalise |
| `referrals` | id, review_id, facility, specialty, priority, status | Explicit clinical decision |
| `appointments` | id, referral_id, slot, status, video_ref | Status history, no public meeting links |
| `investigations` | id, referral_id, kind, state, report_key | Pathology is distinct from image label |
| `navigation_tasks` | id, referral_id, owner, due, status | Overdue escalation and closure |
| `audit_events` | actor, event, resource, time, metadata | Append-only, no PHI in logs |

**Integrity rules:** UUIDs, foreign-key constraints, validation at the API boundary, explicit status-transition rules, soft-delete where policy requires retention. Cross-patient linkage and silent overwrites are rejected.

## 11. Case State Machine

```
DRAFT → CONSENTED → SCREENED → AWAITING_CLINICIAN → REVIEWED → REFERRAL_PLANNED
      → APPOINTED → ASSESSED → DIAGNOSTICS_PENDING → RESULT_REVIEWED
      → CARE_LINKED  or  CLOSED
```

Tracked exceptions: `RESCHEDULED`, `MISSED`, `DECLINED`, `LOST_CONTACT`.

An AI result can **never** bypass clinician review.

## 12. API Overview

All endpoints authenticate every request and authorise access to the specific patient/facility record, not just the role. Requests and responses are validated, paginated where relevant, and retryable writes are idempotent.

| Method + Route | Purpose | Who may use |
|---|---|---|
| `POST /auth/login` | Create authenticated session | Permitted users |
| `POST /patients` | Register synthetic patient | Health worker |
| `POST /patients/{id}/consents` | Record purpose-specific consent | Health worker |
| `POST /screenings` | Create screening and history | Health worker |
| `POST /screenings/{id}/images` | Upload protected oral photo | Assigned health worker |
| `POST /ai/analyze` | Queue non-clinical image analysis | Authorised screening user |
| `POST /reviews` | Save clinician observations | Medical Officer |
| `POST /referrals` | Create specialist referral | Medical Officer |
| `POST /appointments` | Book or request appointment | Clinician / navigator |
| `POST /investigations` | Record biopsy/pathology simulation | Authorised clinician |
| `PATCH /navigation/{id}` | Track contact and attendance | Navigator |
| `GET /dashboard/summary` | Aggregate reporting only | District administrator |
| `GET /healthz` | Health check | Public (no data) |

Interactive API documentation is served at `/docs` (OpenAPI/Swagger) when the API is running.

## 13. AI Module

The AI component is **strictly a research demonstration**.

**Sample response:**

```json
{
  "analysis_id": "DEMO-AI-009",
  "screening_id": "DEMO-CASE-001",
  "image_quality": "acceptable",
  "provider": "mock",
  "model_version": "mock-v1",
  "research_label": "suspicious_example",
  "score": null,
  "clinical_use": false,
  "requires_clinician_review": true,
  "warning": "NOT FOR CLINICAL USE"
}
```

**Design principles**

- **Pluggable and replaceable:** a versioned adapter interface lets a mock, a research model or a future approved service be swapped in without touching the rest of the app.
- **Safe by default:** an image-quality checker plus a simulated or distinctly research-labelled classifier.
- **No overclaiming:** no bounding boxes or heatmaps implying medical localisation, no probability-of-cancer language, no "all clear" messaging.
- **Fails gracefully:** if the AI service is down, the case remains intact and manual clinical review is available.

**Optional research model (if trained)**

- Dataset: publicly available oral-lesion research dataset (verify licence and label definitions yourself).
- Model: torchvision EfficientNet-B0 with a two-class research head.
- Workflow: write `DATASET_CARD.md`, remove corrupt files, split by source/patient **before** augmentation, never tune on the test set.
- Reporting: sensitivity, specificity, precision, F1, confusion matrix, uncertainty and actual test sample sizes.
- Artefacts saved: weights, transforms, label map, dataset card, performance report, code revision, model version.
- Limitations: a model trained on lesion photographs is not automatically valid for healthy mouths, precancer, or images from other cameras and communities.

See `docs/MODEL_CARD.md` and `docs/DATASET_CARD.md` (to be added).

## 14. Image Capture and Quality Control

- Guided oral views: cheek lining, tongue, palate, gums and floor of mouth, as clinically indicated, with plain-language instructions and easy recapture.
- Validate file extension **and** decoded format; restrict size and dimensions; normalise orientation; strip unnecessary metadata; compute a checksum.
- OpenCV flags blurry, under-exposed, over-exposed or glare-heavy images. It **cannot** confirm that a lesion is absent.
- Images are stored in **private storage**, accessed through short-lived signed URLs authorised by the backend. Raw object-store keys are never embedded in the PWA.
- Images are stored only **after consent**, linked to the correct screening ID, and reassignment across patients must fail.

## 15. Telugu, Low-Literacy and Offline-First Design

**Language and accessibility**

- Stable translation dictionary (`key → English / Telugu`), with no hardcoded English in components.
- Telugu rendering tested on real Android devices and in PDF output.
- Touch targets of 44px or larger, clear progress steps, minimal typing, visible save confirmation.

**Offline behaviour**

- Offline drafts are kept in a protected device store (the limits of browser PWA storage are documented, and we do not claim device encryption automatically protects app caches).
- Writes are queued with **idempotency keys** and a sync status: `pending → uploading → confirmed → failed`.
- A case is never marked synced before **server acknowledgement**.
- Conflicts (same case edited on two devices) show a resolution state, and clinician notes are never silently discarded.
- A PWA does not guarantee background sync on every Android/browser combination, so we test on real devices.

**Offline demo sequence:** airplane mode → create synthetic patient and save draft → close and reopen app → draft persists → reconnect → sync once → force a retry → exactly one server record with correct timestamps.

## 16. Telemedicine and Appointments

- Two-party secure video between two test accounts using a demo video SDK, with authenticated appointment access and time-limited meeting tokens.
- No consultation recording by default; no public meeting links.
- Teleconsultation does **not** replace specialist examination or biopsy when clinically needed.
- Appointment statuses: `REQUESTED`, `CONFIRMED`, `COMPLETED`, `MISSED`, `CANCELLED`, `RESCHEDULED`.
- Clinician outcome is stored **separately** from attendance.
- A missed appointment automatically creates a follow-up task for the navigator.
- Follow-up rules are configurable under a clinical protocol rather than invented by the software.

## 17. Security and Privacy

| Area | Measures |
|---|---|
| Authentication | Modern password hashing, session expiry, secure cookies or safely handled bearer tokens, MFA for privileged users |
| Authorisation | Role **and** patient/facility checks in backend queries, deny-by-default |
| Transport and storage | HTTPS, encrypted database and backups, private object storage, minimum-permission service accounts, credential rotation |
| Uploads | Decode and inspect formats, size limits, safe filenames, private access, malware scanning where supported |
| Audit | Every image view/export, clinical edit, diagnosis entry and permission change is logged without copying sensitive content |
| Environments | Separate dev / demo / prod, no real patient data, published demo data reset script |
| Hygiene | No hardcoded secrets, no public buckets, no tracking pixels, no sensitive details in notifications |

**Threat model covers:** stolen phone, lost token, wrong-record access, insecure direct object references, leaked AI service key, malicious uploads, video link sharing, database backup leak. See `docs/THREAT_MODEL.md`.

## 18. Testing

Required evidence: unit tests, API integration tests, browser/mobile E2E tests, authorisation tests, offline demonstrations, and a known-issues list.

| Test | Input | Expected behaviour |
|---|---|---|
| Normal journey | Consent → screening → photo → review → video → biopsy demo | Single correct longitudinal record |
| Blurred photo | Defocused image | Recapture warning, no reliability claim |
| Invalid content | Random PDF renamed `.jpg` | Rejected after decoding |
| Missing consent | Image upload before consent | Rejected with recorded explanation |
| Wrong patient ID | Clinician requests an unrelated case | 403 / access denied |
| AI down | Stop the inference container | Case intact, manual review available |
| Network lost | Disconnect during image upload | Retryable state, no duplicate image |
| Double submit | Same POST twice with the same key | Single durable record |
| False-negative AI | Model says low concern, clinician suspicious | Referral action still available |
| False-positive AI | Model says suspicious, clinician disagrees | Clinician can document discrepancy |
| Missed appointment | Mark appointment missed | Follow-up task created |
| Broken video link | Expired or wrong meeting token | Join denied, reschedule allowed |
| Long Telugu strings | Switch language, PDF and mobile view | Readable, no overflow |
| Concurrent edits | Two users update the same review | Conflict or explicit version handling |
| Dashboard totals | Seed 12 cases, 4 referrals | Exact aggregate counts |
| Audit trail | Change pathology status | Actor, time and action preserved |

**Run the tests**

```bash
# Backend
cd services/api
pytest

# Frontend
cd apps/web
npm test

# End-to-end (against a running stack)
npm run test:e2e
```

> Update these commands to match the actual tooling. A test is only reported as passed after it has been executed.

## 19. Getting Started

### Prerequisites

- Git
- Node.js (LTS)
- Python 3.11+
- Docker Desktop / Engine with Compose
- Android device with Chrome (for real-device testing)
- Code editor (VS Code, Antigravity, etc.)

### Clone and set up

```bash
git clone <your-repository-url> aarogya-drishti
cd aarogya-drishti
cp .env.example .env     # then fill in local placeholder values
```

### Run with Docker (recommended)

```bash
docker compose up --build -d
# Run migrations and seed synthetic demo data
docker compose exec api alembic upgrade head
docker compose exec api python -m app.seed
# Verify the API
curl http://localhost:8000/healthz
```

### Run without Docker

**Backend**

```bash
cd services/api
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

**Frontend**

```bash
cd apps/web
npm install
npm run dev
```

### Reset demo data

```bash
./scripts/reset-demo-data.sh
```

## 20. Environment Variables

Copy `.env.example` to `.env`. **Never commit real secrets.**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Token signing secret |
| `JWT_EXPIRY_MINUTES` | Session lifetime |
| `OBJECT_STORAGE_ENDPOINT` | Private object storage endpoint |
| `OBJECT_STORAGE_ACCESS_KEY` | Storage service account key |
| `OBJECT_STORAGE_SECRET_KEY` | Storage service account secret |
| `AI_PROVIDER` | `mock` or `research` |
| `VIDEO_SDK_KEY` / `VIDEO_SDK_SECRET` | Video SDK credentials |
| `ALLOWED_ORIGINS` | CORS allow-list |

## 21. Deployment

| Layer | Option | Must verify |
|---|---|---|
| PWA | HTTPS static hosting or web container | Mobile camera, reload, offline |
| API | Managed container / VM | TLS, secrets, health endpoint |
| PostgreSQL | Managed DB or locked-down instance | Migrations, backup / restore |
| Images | Private object storage | No public listing or download |
| AI | Optional mock/research container | App keeps working if it fails |
| Video | SDK under a demo account | Secure links, two-device call |
| Monitoring | Structured logs and uptime checks | No PHI or secrets in logs |

**Deployment checklist**

```text
- docker compose up --build -d
- Run Alembic migrations and seed synthetic data
- GET /healthz returns 200
- Open the frontend over HTTPS on an Android phone
- Confirm the database survives an API restart
- Confirm object storage is private and tokens expire
- Run automated tests against the deployed staging URL
- After the event: disable test users and rotate secrets
```

Free-tier hosts may sleep, change quotas or lose files on restart. A **second reproducible local setup route** is provided in case live hosting fails.

**Live demo URL:** `<add deployed URL>`
**Android / PWA install:** open the URL in Chrome → menu → *Add to Home screen*.

## 22. Demo Accounts and Synthetic Data

> Use only synthetic data. Never enter real patient records or identifiable photographs.

| Role | Username | Password |
|---|---|---|
| Health Worker | `<add>` | `<add>` |
| Medical Officer | `<add>` | `<add>` |
| Specialist | `<add>` | `<add>` |
| Navigator | `<add>` | `<add>` |
| District Admin | `<add>` | `<add>` |
| System Admin | `<add>` | `<add>` |

Demo accounts are for the hackathon only and will be disabled afterwards.

## 23. Live Demo Script

1. Open the deployed app in **Telugu** on a phone.
2. Register a synthetic 46-year-old resident of G. Madugula.
3. Record tobacco history, consent and a sample abnormal oral finding.
4. Photograph or upload licensed demo media, then repeat with a blurry image.
5. Run the non-clinical AI adapter, then deliberately stop it and show graceful recovery.
6. Log in as Medical Officer, review the case, disagree with the AI if relevant and record a clinical decision.
7. Book a video consultation and connect with a second test account.
8. Generate a physical referral, mark attendance and upload a simulated pathology report.
9. Update navigation and show correct dashboard counts.
10. Try unauthorised access and offline synchronisation.
11. Explain limitations, data safety and what would be required before any real-world patient use.

## 24. Documentation Index

| Document | Location |
|---|---|
| Product requirements (PRD) | `docs/PRD.md` |
| Architecture and data flow | `docs/ARCHITECTURE.md` |
| ER diagram | `docs/ER_DIAGRAM.md` |
| Role-access matrix | `docs/PERMISSIONS.md` |
| API documentation (OpenAPI) | `/docs` endpoint, `docs/API.md` |
| Threat model | `docs/THREAT_MODEL.md` |
| AI model card and dataset card | `docs/MODEL_CARD.md`, `docs/DATASET_CARD.md` |
| Test report | `docs/TEST_REPORT.md` |
| Deployment, backup and rollback | `docs/DEPLOYMENT.md` |
| Known issues | `docs/KNOWN_ISSUES.md` |

UML diagrams (use case, activity, sequence, class and component) should be stored in `docs/diagrams/`.

## 25. Project Timeline

| Date | Milestone |
|---|---|
| 27 Oct | Launch, team registration, clinical workflow study, planning |
| 28 Oct | Scaffold app, API and database; login and authorisation |
| 29 Oct | Registration, consent, Telugu strings, mobile module |
| 30 Oct | Image capture, quality checks, AI integration |
| 31 Oct | Doctor portal and review; **minimum complete system demonstrable** |
| 1 Nov | Video consultation and appointments |
| 2 Nov | Diagnostics, tracking, Telugu, security, district dashboard |
| 3 Nov | Testing, deployment, semifinal review |
| 4 Nov | Final demonstration, jury evaluation and awards |

## 26. Known Limitations

- Hackathon demonstration only. **Not a medical device. Not for clinical use.**
- AI output is a mock or research label and is not clinically validated.
- OpenCV quality checks cannot rule out the presence of a lesion.
- Browser PWA storage and background sync vary by Android/browser version.
- Teleconsultation is not a substitute for physical examination or biopsy.
- Free-tier hosting may sleep or lose data.
- Add further limitations here as they are discovered.

## 27. Team and Contributions

| Name | Role | Responsibilities | GitHub |
|---|---|---|---|
| `<name>` | Engineering lead / backend | Git, FastAPI, database, schema, integration | `<handle>` |
| `<name>` | Mobile / frontend engineer | PWA, camera, offline, bilingual forms | `<handle>` |
| `<name>` | AI / integration engineer | OpenCV quality, AI adapter, optional research model | `<handle>` |
| `<name>` | Clinical workflow / frontend | Doctor portal, referral, video, dashboard | `<handle>` |
| `<name>` | QA / security / DevOps | Tests, authorisation, deployment, monitoring | `<handle>` |

Teams with fewer than five members combine roles. A detailed contribution record is kept in `docs/CONTRIBUTIONS.md`.

## 28. AI Tools and Third-Party Disclosure

In line with the open-book policy, we disclose the following:

- **AI coding assistants used:** `<for example, Google Antigravity, ChatGPT, Gemini, Copilot>`
- **Third-party templates / libraries:** `<list with licences>`
- **Datasets:** `<name, source, licence>`
- **External assistance:** `<mentors, tutorials, if any>`

All team members can explain and demonstrate the code they submit.

## 29. License

`<Choose a licence, for example MIT, and add a LICENSE file. Confirm that any dataset or model licences are compatible.>`

## 30. Acknowledgements

- **ITDA Paderu**, Alluri Sitharama Raju District, Andhra Pradesh, for organising AAROHAN Inter-Centre Hackathon 2026.
- **AAROHAN**, AI and Software Skills for a Brighter Tomorrow.
- **IISc TANUH** and **Aarogya Aarohan**, for the oral-cancer screening concepts that inspired this challenge.
- The open-source communities behind React, Vite, FastAPI, PostgreSQL, OpenCV and PyTorch.

---

*Healthier Tribal Communities · Brighter Tomorrow. Build software that works. Protect patient data. Create technology that can save lives.*
