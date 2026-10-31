# Stage 6 – Supabase edition

Database (Postgres) **and** patient photos (Storage bucket) now live in Supabase.
Only the FastAPI server (and the React dev server) run on your machine.

## 1. Create the Supabase project (2 min)
1. supabase.com -> New project (save the DB password).
2. **Project Settings -> API**: copy *Project URL* and the **service_role** key.
3. **Project Settings -> Database -> Connection string**: choose **Session pooler**, copy the URI, replace `[YOUR-PASSWORD]`.

## 2. Configure
```bash
cd backend
# .env already exists as a copy of .env.example – edit it:
#   DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET (+ OLLAMA_API_KEY if used)
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
On startup the server automatically: creates the private bucket `patient-images`, creates all tables, and seeds demo users/cases (including demo photos uploaded to the bucket).

Optional: run `supabase_schema.sql` in the Supabase SQL editor if you prefer creating tables manually (the server does it anyway).

Frontend (unchanged): `cd frontend && npm install && npm run dev` -> http://localhost:5173

Demo logins use password `Demo@123` (see `app/seed.py` for the emails).

## How images are stored
- Bucket: `patient-images` (private). Object key: `<screening_id>/<image_id>.jpg` (extension detected from the file; older uploads ending in .bin can be renamed with `python migrate_local_images.py`).
- DB table `images` keeps `id`, `screening_id`, `checksum`, `storage_key` -> every photo is traceable by its ids in Supabase.
- Browsers never talk to Supabase directly; the backend checks roles/consent, then streams the file. The service_role key stays server-side.

## Migrating old local photos
If you have an existing DB with old `storage/*.bin` files: put them in `backend/storage/` and run `python migrate_local_images.py`. (Old `.bin` files were removed from this zip; fresh demo data is seeded into Supabase instead.)

## Tests
`TEST_DATABASE_URL=<a THROWAWAY postgres url> pytest` – tests drop all tables, so never point it at your real project. Storage is faked in memory.
*(Not executed on my side: no Postgres/Supabase was available in my sandbox, so please run it once.)*

## Free hosting for the backend (low traffic)
Limits change often – verify on each pricing page.
| Provider | Why | Catch |
|---|---|---|
| **Render** (Web Service, Docker or Python) | Easiest; deploy from GitHub | Free instance sleeps after ~15 min idle (cold start ~30-60 s) |
| **Hugging Face Spaces** (Docker) | Generous RAM, no card, stays up reasonably | Public repo/space by default; port 7860 (set `PORT`/CMD accordingly) |
| **Google Cloud Run** | Free monthly quota, scales to zero, fast cold start | Needs billing card; keep max instances = 1 |
| **Koyeb** | Simple Docker/GitHub deploy | Free tier availability/region limits vary |

Deploy settings: root dir `backend`, start command `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, add the same env vars as `.env`, and set `CORS_ORIGINS` to your frontend URL.
Use the Supabase **Session pooler** URL (IPv4-friendly) on all of them.
