# Aarogya Drishti

Synthetic-data oral screening demo for **AAROHAN Hackathon 2026** (ITDA Paderu).
**NOT FOR CLINICAL USE.** AI output is research-only and never a diagnosis.

Bilingual (EN/TE) PWA + FastAPI workflow API + mock AI adapter, image-quality checks, role isolation, audit trail, offline retry, Jitsi video and a district dashboard. Database: **PostgreSQL**.

## Folder structure

```
aarogya-drishti/
├── backend/                FastAPI + SQLAlchemy + PostgreSQL
│   ├── app/
│   │   ├── ai/             image-quality check + mock AI adapter
│   │   ├── main.py  routers.py  models.py  db.py  config.py
│   │   └── security.py  access.py  seed.py
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

Do not commit real credentials or real patient photographs.
