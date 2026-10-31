# Aarogya Drishti

Synthetic-data oral screening demo for **AAROHAN Hackathon 2026** (ITDA Paderu).
**NOT FOR CLINICAL USE.** AI output is research-only and never a diagnosis.

Bilingual (EN/TE) PWA + FastAPI workflow API + **Ollama Cloud vision analysis** (with an offline mock fallback), image-quality checks, role isolation, audit trail, offline retry, Jitsi video and a district dashboard. Database: **PostgreSQL**.

## Folder structure

```
aarogya-drishti/
├── backend/                FastAPI + SQLAlchemy + PostgreSQL
│   ├── app/
│   │   ├── ai/             image-quality check + Ollama Cloud adapter + mock adapter
│   │   ├── main.py  routers.py  models.py  db.py  config.py
│   │   └── security.py  access.py  seed.py
│   ├── scripts/test_ollama.py   quick Ollama Cloud check from the terminal
│   ├── tests/test_api.py
│   ├── requirements.txt  Dockerfile  init_db.sql  .env.example
├── frontend/               React + Vite PWA
│   ├── src/  public/  index.html  package.json  vite.config.js
│   └── Dockerfile  nginx.conf
├── docs/DEMO_WALKTHROUGH.md
└── docker-compose.yml
```

## Demo accounts (password `Demo@123`)

| Role | Email |
| --- | --- |
| Health worker | `hw@demo.local` |
| Medical Officer | `mo@demo.local` |
| Specialist | `spec@demo.local` |
| Navigator | `nav@demo.local` |
| District admin | `admin@demo.local` |

## Option A: Docker (easiest)

```bash
docker compose up --build
```
- App: http://localhost:8080
- API docs: http://localhost:8000/docs

## Option B: Run locally

1. Install PostgreSQL 14+ and create the databases:
   ```bash
   psql -U postgres -f backend/init_db.sql
   ```
2. Backend (Python 3.11+):
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate        # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   cp .env.example .env             # set your postgres password in DATABASE_URL
   uvicorn app.main:app --reload --port 8000
   ```
   Tables are created and demo users are seeded automatically on first start.
3. Frontend (Node 20+), in a second terminal:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Open http://localhost:5173 (Vite proxies `/api` to port 8000).

## AI image analysis (Ollama Cloud)

The browser never talks to Ollama. The photo is uploaded to the backend, stored privately, and when the health worker taps **Analyse photo with AI** the backend reads the stored image, downsizes it (max 1024 px), and sends it with minimal context to Ollama Cloud with the official `ollama` Python client (`Client(host="https://ollama.com", headers={"Authorization": "Bearer <key>"}).chat(model=..., messages=[{..., "images": [image_bytes]}])`). The model's JSON reply is validated, stored with the analysis, and shown to each person in the form they need:

| Audience | Where | What they get |
| --- | --- | --- |
| Health worker | Patient profile | Photo issues and **how to retake**, what the AI can see, next steps tailored to the view, symptoms, duration and tobacco habits |
| Patient | Patient profile | A short plain-language message in **English or Telugu** (follows the UI language) |
| Reviewing clinician | Review page | Summary of what to examine in person, observations, suggested urgency, limitations |

Setup (in `backend/.env`):

```env
AI_PROVIDER=auto                       # auto | ollama | mock
LOCAL_QUALITY_CHECK=false              # false = the AI judges photo quality
OLLAMA_API_KEY=your_key_from_https://ollama.com/settings/keys
OLLAMA_MODEL=gemma4                    # must be vision-capable
OLLAMA_FALLBACK_MODEL=                 # optional second model, tried if the first errors or is not found
```

- `auto` uses Ollama Cloud when `OLLAMA_API_KEY` is set, otherwise the offline mock adapter, so the demo still works without internet.
- Test your key and model without the web app: `cd backend && python scripts/test_ollama.py photo.jpg` (prints the feedback or the exact error).
- Model ids come from https://ollama.com/api/tags. If you get "model not found", change `OLLAMA_MODEL` to a vision model listed there.
- **Photo quality is judged by the AI, not by a local gate.** `LOCAL_QUALITY_CHECK=false` (default) skips the blur/size/type rejection: every photo is stored as `pending_ai`, and the model's verdict (usable or not, why, how to retake) is shown and written back to the photo's status. Only empty files and files over 8 MB are refused. Set `LOCAL_QUALITY_CHECK=true` to bring back the old local check.
- Existing databases are upgraded automatically on start (one nullable `feedback` column on `ai_analyses`).
- Only age, sex, symptoms, duration, tobacco habits, exam notes and the photographed area are sent. Name, phone, address and village are never sent.
- If Ollama is unreachable, times out or rejects the key, the API returns HTTP 503, the screening moves to `AWAITING_CLINICIAN`, and the clinician reviews manually.
- Results stay advisory: `clinical_use: false`, `requires_clinician_review: true`, and the labels are `suspicious_example`, `no_suspicious_finding_example` or `inconclusive_example`.

`POST /ai/analyze` response (Ollama path):

```json
{
  "analysis_id": "...", "status": "completed", "provider": "ollama", "model_version": "gemma4",
  "research_label": "suspicious_example", "clinical_use": false, "requires_clinician_review": true,
  "feedback": {
    "image_assessment": {"is_oral_photo": true, "usable": true, "issues": []},
    "observations": ["..."], "confidence": "medium", "suggested_urgency": "soon",
    "health_worker_guidance": ["..."], "recapture_tips": [],
    "clinician_summary": "...", "patient_message": {"en": "...", "te": "..."}, "limitations": "..."
  }
}
```

## Tests

Uses a separate database `aarogya_drishti_test` (tables are dropped and recreated). Override with `TEST_DATABASE_URL`.

```bash
cd backend
python -m pytest -q
```

## Frontend UI refresh (changelog)

Only `frontend/src/App.jsx` and `frontend/src/styles.css` were changed. No backend, `.env`, API paths, route paths, state/variable names, i18n keys, localStorage keys or dependencies were touched, so **no new setup steps are required** (`npm install` and `npm run dev` work as before).

What changed visually:
- Sidebar navigation on desktop and a bottom tab bar on mobile, with icons and active-page highlight.
- New split-screen login with one-click demo role chips and a show/hide password toggle.
- Status pills (colour coded), avatars, empty states and loading skeletons across all pages.
- Patient profile shows a Consent, Details, Photo, AI check progress stepper and a vertical case timeline.
- Dashboard KPI cards with progress bars; audit trail as a timeline; toast messages for sync and reset.
- Responsive layout, keyboard focus styles, reduced-motion support, and a clean print view for referral slips.

Icons are inline SVG, and the font stack is system fonts (with Telugu fallbacks), so there are no new packages or external requests.

## Safety rules baked into the product

- AI labels are `suspicious_example` / `no_suspicious_finding_example` with `clinical_use: false`.
- A signed review cannot be silently overwritten (HTTP 409).
- Screening and photos require matching consent.
- Workflow continues if the AI adapter is forced down (`AI_FORCE_FAIL=true`).
- Images are stored in a private folder (`STORAGE_DIR`), not a public URL.

- Photos sent to a cloud model are a privacy trade-off. Use synthetic or consented images only, and keep `OLLAMA_API_KEY` out of version control (`.env` is git-ignored; use `.env.example` as the template).

Do not commit real credentials or real patient photographs.
