# Aarogya Drishti

Synthetic-data oral screening demo for **AAROHAN Hackathon 2026** (ITDA Paderu).
**NOT FOR CLINICAL USE.** AI output is research-only and never a diagnosis.

Bilingual (EN/TE) PWA + FastAPI workflow API + **Ollama Cloud vision analysis** (with an offline mock fallback), image-quality checks, role isolation, audit trail, offline retry, Google Meet video consultations and a district dashboard. Database: **PostgreSQL**.

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
│   ├── src/
│   │   ├── App.jsx         routes only
│   │   ├── Layout.jsx      sidebar shell + role guard
│   │   ├── common.jsx      shared helpers (icons, pills, toasts, AI feedback card)
│   │   ├── api.js  i18n.js  styles.css
│   │   └── pages/          one file per page (Login, Reviews, AuditPage, AdminPending, AdminUsers, ...)
│   ├── public/  index.html  package.json  vite.config.js
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

New users can also register from the login page; an admin approves them under **Pending approvals**.

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

The model acts like a **junior doctor**: it does not describe the picture. It names the most likely condition (or says **"No disease detected"**), explains its reasoning using the patient's symptoms and habits, gives health suggestions, and always insists on a doctor's consultation. Patient wording is calm and never alarming.

| Audience | Where | What they get |
| --- | --- | --- |
| Health worker | Patient profile | Most likely condition, assessment, health suggestions, warning signs, doctor-consultation advice, next steps, and (if the photo is unusable) how to retake it |
| Patient | Patient profile | A short, gentle plain-language message in **English or Telugu** (follows the UI language) |
| Reviewing clinician | Review page | Working impression with other possibilities, summary of what to examine or test in person, suggested urgency |

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
- Results stay advisory and provisional: `clinical_use: false`, `requires_clinician_review: true`. The prompt forbids medicine names and doses; suggestions are self-care and lifestyle only.

`POST /ai/analyze` response (Ollama path):

```json
{
  "analysis_id": "...", "status": "completed", "provider": "ollama", "model_version": "gemma4",
  "research_label": "condition_possible_example", "clinical_use": false, "requires_clinician_review": true,
  "feedback": {
    "image_assessment": {"is_oral_photo": true, "usable": true, "issues": []},
    "predicted_condition": {"disease_detected": true, "name": "Oral leukoplakia (most likely)", "likelihood": "medium", "other_possibilities": ["Oral lichen planus"]},
    "analysis": "...", "confidence": "medium", "suggested_urgency": "soon",
    "health_suggestions": ["..."], "warning_signs": ["..."], "consult_advice": "...",
    "health_worker_guidance": ["..."], "recapture_tips": [],
    "clinician_summary": "...", "patient_message": {"en": "...", "te": "..."}, "limitations": "..."
  }
}
```

Labels: `suspicious_example` (possible precancer/cancer, prompt attention), `condition_possible_example`, `no_suspicious_finding_example` ("No disease detected"), `inconclusive_example` (unusable photo). The server enforces consistency, e.g. "no disease" always means label `no_suspicious_finding_example` and routine urgency.

## Tests

Uses a separate database `aarogya_drishti_test` (tables are dropped and recreated). Override with `TEST_DATABASE_URL`.

```bash
cd backend
python -m pytest -q
```

## Latest changes (stage 3 MO UI + accounts)

**Pages are now separate files.** `App.jsx` only holds routes. Each page lives in `frontend/src/pages/<Name>.jsx`; shared pieces are in `common.jsx` and `Layout.jsx`.

**Medical Officer review page (`/reviews`)** is now a two-pane screen. The left pane lists every record awaiting review (with search); clicking one opens its report (symptoms, photos, AI feedback) and the signature form on the right. After signing, the record leaves the list.

**Admin audit page (`/audit`)** is now a dashboard: KPI cards (total events, today, active users, sign-ins), search, category filters, a table with the user's name and role, and a "most frequent events" panel. `GET /audit` now returns `actor_name` and `actor_role` and the latest 500 events.

**Self-registration with admin approval**
- The login page has a **Sign in / Register** switch. Registering asks for name, email, password, **designation** (health worker, navigator, medical officer, specialist) and an optional facility.
- New accounts are saved with `status = pending`. They cannot sign in (login returns 403 with a clear message) until an admin approves them. Declined accounts also cannot sign in.
- Every active admin gets a notification, and the **Pending approvals** page (sidebar badge shows the count) has Approve / Decline buttons. The user gets a notification of the decision.
- Admins can only approve or decline a request once (second attempt returns 409). Demo seed users stay `active`.

**Admin Users page (`/admin/users`)** lists all health workers, navigators, medical officers and specialists (filter by designation, search by name/email). Clicking a user shows profile, status, last activity, role-specific work status and recent activity:

| Designation | Work status shown |
| --- | --- |
| Health worker | patients registered, screenings done, photos uploaded, awaiting clinician |
| Medical officer | reviews signed, referrals created, cases waiting review |
| Navigator | tasks assigned / open / closed, unassigned tasks |
| Specialist | referrals, appointments completed / open, investigations reviewed / pending (programme-wide, since these records are not owned per specialist) |

Only counts are shown, never patient identities, so the admin's aggregate-only rule still holds.

New endpoints: `POST /auth/register`, `GET /admin/users`, `GET /admin/users/{id}`, `POST /admin/users/{id}/approve`, `POST /admin/users/{id}/reject`. No new database columns or packages, so no migration or extra install step is needed. Two new tests cover the approval flow (`python -m pytest -q`).

## Video consultations (Google Meet only)

Google Meet is the only video provider. Jitsi was removed.

- **Create the link:** on **Referrals**, click *Create a Meet link* (opens meet.new), copy the link and paste it in. It is checked to be a real `https://meet.google.com/...` address and stored with the appointment. Meet opens in a new tab (it cannot be embedded), from the **Open Google Meet** button on the join page.
- **Schedule:** pick the exact **date and time**; the page shows the **day of the week** (for example "Monday, 2 November 2026 · 10:00") before you book. Past times are refused. Slots keep your local UTC offset, so the weekday and hour stay exact in notifications.
- **Start now (specialists only):** a specialist can switch to *Start now*. The consult is created for the current moment, the Meet tab opens, and the team is told it is live. Navigators and medical officers can schedule but not start-now (the API returns 403).
- **Notified automatically** (title and time only, never patient names or clinical details): the health worker who screened/registered the patient, the medical officer who signed the review, all navigators, and specialists (whoever made the change is skipped).
  - when a consult is scheduled, confirmed, rescheduled, cancelled, missed or completed
  - "Video consultation is live" when a specialist starts now or opens the call (repeat alerts suppressed for 10 minutes)
  - when the health worker joins first, the specialist/MO are told the patient side is ready
  - a "starting soon" reminder when the slot is within 30 minutes (created when notifications are fetched)
- **Where users see it:** the Notifications link shows an unread count, new alerts pop up as a message (checked every 20 s), and each video alert has a *Join video call* link. The **Appointments** page is sorted by time, shows the weekday, has Join call, status buttons and a Reschedule picker (health workers can view and join, not change status). A video appointment without a link can have one pasted there.
- Automatic Meet link creation would need a Google Cloud OAuth setup (Calendar API `conferenceData`) and is not included, so no Google credentials are required.
- Existing databases upgrade automatically on start; any old appointment is marked Google Meet and needs a link added before it can be joined.

## Latest changes (retake fix, alert cap, DB-first data, Supabase-ready)

- **Retake analyses the new photo.** The profile page now remembers which uploaded photo is current. **Analyse** always sends that photo (the old code preferred the first "acceptable" photo, so an old image was re-sent). **Retake** clears the preview, disables Analyse until a new photo is uploaded, and hides the previous result. The same file name can be picked again. `GET /screenings/{id}` returns `image_id` per analysis, `POST /ai/analyze` returns the `image_id` it used and checks the stored file against its checksum.
- **At most 3 alerts, bottom-right.** Pop-up alerts are capped at 3 on screen, and a fresh login shows the 3 newest unread ones. The sidebar badge still shows the full unread count.
- **MO, specialist and navigator pages read the database directly.** `GET /screenings?awaiting_review=true` returns every screening without a signed review, whatever stage the health worker left it in (with patient name and village). On start, `SEED_DEMO_DATA=true` inserts synthetic cases at each stage (awaiting review, referred, appointment, investigation, closed) once per database, so those pages are never empty.
- **Supabase-ready.** Only `DATABASE_URL` changes. `postgres://` and `postgresql://` URLs are accepted, `sslmode=require` is added for `*.supabase.co` / `*.supabase.com`, and the pool recycles idle connections. Tables are created on start. Uploaded photos are still stored in `STORAGE_DIR` (not in the database).

## Troubleshooting

- **Blank page or "something went wrong" on a role's page:** open the browser console (F12). After updating, run `npm install` once and restart `npm run dev`; hard-refresh (Ctrl+Shift+R) so the old service-worker cache is not served.

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

- AI output is a provisional impression with `clinical_use: false`; every result tells the patient to consult a doctor.
- A signed review cannot be silently overwritten (HTTP 409).
- Screening and photos require matching consent.
- Workflow continues if the AI adapter is forced down (`AI_FORCE_FAIL=true`).
- Images are stored in a private folder (`STORAGE_DIR`), not a public URL.

- Photos sent to a cloud model are a privacy trade-off. Use synthetic or consented images only, and keep `OLLAMA_API_KEY` out of version control (`.env` is git-ignored; use `.env.example` as the template).

Do not commit real credentials or real patient photographs.
