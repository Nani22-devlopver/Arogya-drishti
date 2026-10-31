import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { api, clearSession, currentUser, enqueue, flushQueue, getQueue, getToken, newIdempotencyKey, setSession } from "./api";
import { strings } from "./i18n";

function useI18n() {
  const [lang, setLang] = useState(localStorage.getItem("lang") || "en");
  const t = strings[lang] || strings.en;
  const switchLang = (value) => {
    setLang(value);
    localStorage.setItem("lang", value);
  };
  return { lang, t, switchLang };
}

/* ---------- small UI helpers (presentation only) ---------- */
const ICONS = {
  users: "M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21v-1a6 6 0 0116 0v1",
  plus: "M12 5v14M5 12h14",
  cloud: "M7 18a4 4 0 010-8 5.5 5.5 0 0110.7 1.3A3.4 3.4 0 0117 18H7z",
  bell: "M18 16v-5a6 6 0 10-12 0v5l-2 2h16l-2-2zM10 21h4",
  check: "M5 13l4 4L19 7",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z",
  cal: "M4 7h16v13H4zM4 11h16M8 3v4M16 3v4",
  flask: "M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3",
  compass: "M12 21a9 9 0 100-18 9 9 0 000 18zM15 9l-2 6-4 0 2-6z",
  chart: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  search: "M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z",
  file: "M6 3h9l4 4v14H6zM14 3v5h5",
  video: "M3 7h12v10H3zM15 11l6-3v8l-6-3",
  out: "M9 4H5v16h4M16 8l4 4-4 4M20 12H9",
  inbox: "M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5",
};
function Icon({ n, s = 20 }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[n] || ICONS.file} />
    </svg>
  );
}
const initials = (name = "?") => name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
function tone(status = "") {
  const v = String(status).toUpperCase();
  if (/(CONFIRMED|COMPLETED|CLOSED|GOOD|PASS|REVIEWED|RECEIVED|GRANTED|AGREE)/.test(v) && !/DISAGREE/.test(v)) return "ok";
  if (/(MISSED|CANCEL|OVERDUE|FAIL|POOR|BAD|BLUR|REJECT|URGENT|HIGH)/.test(v)) return "bad";
  if (/(PENDING|AWAIT|RESCHEDULED|SCHEDULED|PROGRESS|SUSPICIOUS|WARN)/.test(v)) return "warn";
  return "neutral";
}
const Pill = ({ children, kind }) => <span className={`pill ${kind || tone(children)}`}>{children}</span>;
// The backend accepts JPEG/PNG/WEBP. Browsers can decode others (AVIF, HEIC on Safari), so convert to JPEG first.
async function toUploadable(file) {
  if (/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) return file;
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) throw new Error("This image format could not be converted. Please use a JPG or PNG photo.");
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}

const AI_LABELS = {
  suspicious_example: { text: "Needs clinician attention", kind: "warn" },
  no_suspicious_finding_example: { text: "Nothing notable visible", kind: "ok" },
  inconclusive_example: { text: "Inconclusive", kind: "neutral" },
};
const URGENCY_KIND = { urgent: "bad", soon: "warn", routine: "ok" };

function BulletList({ title, items }) {
  if (!items?.length) return null;
  return (
    <div className="ai-block">
      <h4>{title}</h4>
      <ul>
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

// Structured feedback returned by the backend after it sent the photo to Ollama Cloud.
// audience: "worker" (field health worker) or "clinician" (reviewing doctor).
function AiFeedback({ analysis, audience = "worker" }) {
  const { lang } = useI18n();
  if (!analysis) return null;
  const fb = analysis.feedback;
  if (analysis.status === "failed") {
    return (
      <p className="warn">
        AI analysis failed{fb?.error ? `: ${fb.error}` : ""}. The case is preserved for manual clinician review.
      </p>
    );
  }
  if (analysis.status === "image_insufficient" && !fb) {
    return (
      <p className="warn">
        This photo did not pass the quality check, so it was not sent to the AI. See the photo status above (for example
        unsupported_type, blurry, too_small, underexposed) and upload a new photo.
      </p>
    );
  }
  if (!fb) {
    return (
      <p className="warn">
        {analysis.research_label || analysis.status} · {analysis.model_version} · {analysis.warning}
      </p>
    );
  }
  const label = AI_LABELS[analysis.research_label] || { text: analysis.research_label || analysis.status, kind: "neutral" };
  const usable = fb.image_assessment?.usable !== false;
  const patientText = fb.patient_message?.[lang] || fb.patient_message?.en;
  return (
    <div className="ai-box">
      <div className="ai-head">
        <Pill kind={label.kind}>{label.text}</Pill>
        {usable && fb.suggested_urgency && <Pill kind={URGENCY_KIND[fb.suggested_urgency]}>Suggested: {fb.suggested_urgency}</Pill>}
        {fb.confidence && <Pill kind="neutral">Confidence: {fb.confidence}</Pill>}
        <span className="small">{analysis.provider} · {analysis.model_version}</span>
      </div>
      {!usable && (
        <div className="ai-retake">
          <b>Photo cannot be assessed – please retake.</b>
        </div>
      )}
      <BulletList title="Photo issues" items={fb.image_assessment?.issues} />
      <BulletList title="How to retake the photo" items={fb.recapture_tips} />
      <BulletList title="What the AI can see" items={fb.observations} />
      {audience === "clinician" ? (
        <>
          {fb.clinician_summary && (
            <div className="ai-block">
              <h4>Summary for the reviewing clinician</h4>
              <p>{fb.clinician_summary}</p>
            </div>
          )}
          <BulletList title="Field-worker guidance given" items={fb.health_worker_guidance} />
        </>
      ) : (
        <>
          <BulletList title="Next steps for the health worker" items={fb.health_worker_guidance} />
          {patientText && (
            <div className="ai-block">
              <h4>Message for the patient</h4>
              <p>{patientText}</p>
            </div>
          )}
        </>
      )}
      {fb.limitations && <p className="small">{fb.limitations}</p>}
      <p className="small ai-disclaimer">{analysis.warning} · Advisory only – a clinician makes the decision.</p>
    </div>
  );
}
function Empty({ icon = "inbox", text = "Nothing here yet" }) {
  return (
    <div className="empty">
      <Icon n={icon} s={40} />
      <div>{text}</div>
    </div>
  );
}
function Loading() {
  return (
    <div className="card">
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}
function toast(text) {
  window.dispatchEvent(new CustomEvent("app-toast", { detail: text }));
}
function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const h = (e) => {
      const id = Math.random();
      setItems((x) => [...x, { id, text: e.detail }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 6000);
    };
    window.addEventListener("app-toast", h);
    return () => window.removeEventListener("app-toast", h);
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((i) => (
        <div className="toast" key={i.id}>
          <span>{i.text}</span>
          <button aria-label="Dismiss" onClick={() => setItems((x) => x.filter((n) => n.id !== i.id))}>×</button>
        </div>
      ))}
    </div>
  );
}
function PageHead({ title, sub, children }) {
  return (
    <div className="page-head">
      <div>
        <h2 style={{ margin: 0 }}>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function Shell({ children }) {
  const user = currentUser();
  const { t, lang, switchLang } = useI18n();
  const nav = useNavigate();
  const links = {
    health_worker: [
      ["/patients", t.patients, "users"],
      ["/register", t.register, "plus"],
      ["/offline", t.offline, "cloud"],
      ["/notifications", t.notifications, "bell"],
    ],
    medical_officer: [
      ["/reviews", t.reviews, "check"],
      ["/patients", t.patients, "users"],
      ["/audit", t.audit, "list"],
      ["/notifications", t.notifications, "bell"],
    ],
    specialist: [
      ["/referrals", t.referrals, "file"],
      ["/appointments", t.appointments, "cal"],
      ["/investigations", t.investigations, "flask"],
      ["/notifications", t.notifications, "bell"],
    ],
    navigator: [
      ["/navigator", t.navigator, "compass"],
      ["/referrals", t.referrals, "file"],
      ["/appointments", t.appointments, "cal"],
      ["/notifications", t.notifications, "bell"],
    ],
    admin: [
      ["/dashboard", t.dashboard, "chart"],
      ["/audit", t.audit, "list"],
    ],
  };
  const doLogout = () => {
    clearSession();
    nav("/login");
  };
  const langSel = (
    <select value={lang} onChange={(e) => switchLang(e.target.value)} aria-label={t.language}>
      <option value="en">English</option>
      <option value="te">తెలుగు</option>
    </select>
  );
  return (
    <>
      <div className="banner">{t.warning}</div>
      <div className="layout">
        <aside className="sidebar">
          <div className="brand">
            <span className="logo"><Icon n="eye" /></span>
            {t.title}
          </div>
          <nav>
            {(links[user?.role] || []).map(([to, label, ic]) => (
              <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "active" : "")}>
                <Icon n={ic} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="side-foot">
            {user && (
              <div className="user-box">
                <span className="avatar">{initials(user.full_name)}</span>
                <div>
                  <b>{user.full_name}</b>
                  <span>{String(user.role).replace("_", " ")}</span>
                </div>
              </div>
            )}
            {langSel}
            <button className="secondary" onClick={doLogout}>
              <Icon n="out" s={16} /> {t.logout}
            </button>
          </div>
        </aside>
        <div className="main">
          <div className="topbar">
            <strong>{t.title}</strong>
            <span className="row" style={{ margin: 0, flexWrap: "nowrap" }}>
              {langSel}
              <button className="secondary" onClick={doLogout}>{t.logout}</button>
            </span>
          </div>
          <div className="wrap">{children}</div>
        </div>
      </div>
      <Toasts />
    </>
  );
}

function Guard({ roles, children }) {
  const user = currentUser();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Shell>{children}</Shell>;
}

function Login() {
  const { t, lang, switchLang } = useI18n();
  const nav = useNavigate();
  const [email, setEmail] = useState("hw@demo.local");
  const [password, setPassword] = useState("Demo@123");
  const [err, setErr] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const demos = [["hw", "Health worker"], ["mo", "Medical officer"], ["spec", "Specialist"], ["nav", "Navigator"], ["admin", "Admin"]];
  async function submit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const data = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      setSession(data.token, data.user);
      nav("/");
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="banner">{t.warning}</div>
      <div className="login-page">
        <section className="hero">
          <span className="logo" style={{ width: 52, height: 52, background: "rgba(255,255,255,.2)" }}><Icon n="eye" s={28} /></span>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
          <ul>
            <li><i><Icon n="eye" s={18} /></i> Photo-assisted oral screening in villages</li>
            <li><i><Icon n="check" s={18} /></i> Medical officer review before any referral</li>
            <li><i><Icon n="shield" s={18} /></i> Consent, privacy and audit trail built in</li>
            <li><i><Icon n="cloud" s={18} /></i> Works offline and syncs when connected</li>
          </ul>
        </section>
        <section className="login-side">
          <div className="card login-box">
            <h2>{t.login}</h2>
            <p className="small">Choose a demo role or enter credentials.</p>
            <div className="demo-chips">
              {demos.map(([k, label]) => (
                <button type="button" key={k} className={`chip ${email === `${k}@demo.local` ? "on" : ""}`} onClick={() => { setEmail(`${k}@demo.local`); setPassword("Demo@123"); }}>
                  {label}
                </button>
              ))}
            </div>
            <form onSubmit={submit}>
              <label>{t.email}</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
              <label>{t.password}</label>
              <div className="pw">
                <input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
                <button type="button" onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button>
              </div>
              {err && <p className="err" style={{ marginTop: 12 }}>{err}</p>}
              <button type="submit" style={{ width: "100%" }} disabled={busy}>{busy ? "…" : t.login}</button>
            </form>
            <label>{t.language}</label>
            <select value={lang} onChange={(e) => switchLang(e.target.value)}>
              <option value="en">English</option>
              <option value="te">తెలుగు</option>
            </select>
            <p className="small" style={{ marginTop: 12 }}>Demo: hw / mo / spec / nav / admin @demo.local — password Demo@123</p>
          </div>
        </section>
      </div>
    </>
  );
}

function Home() {
  const user = currentUser();
  const dest = {
    health_worker: "/patients",
    medical_officer: "/reviews",
    specialist: "/referrals",
    navigator: "/navigator",
    admin: "/dashboard",
  }[user?.role];
  return <Navigate to={dest || "/login"} replace />;
}

function Patients() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  async function load() {
    try {
      setRows(await api(`/patients${q ? `?q=${encodeURIComponent(q)}` : ""}`));
    } catch (ex) {
      setErr(ex.message);
      setRows([]);
    }
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <PageHead title={t.patients} sub={rows ? `${rows.length} records` : ""}>
        {currentUser()?.role === "health_worker" && (
          <Link to="/register"><button><Icon n="plus" s={16} /> {t.register}</button></Link>
        )}
      </PageHead>
      <div className="card">
        <form className="row" onSubmit={(e) => { e.preventDefault(); load(); }}>
          <div className="searchbox">
            <Icon n="search" s={18} />
            <input placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button type="submit">{t.search}</button>
        </form>
        {err && <p className="err">{err}</p>}
        {!rows ? (
          <><div className="skeleton" /><div className="skeleton" /></>
        ) : rows.length === 0 ? (
          <Empty icon="users" text="No patients found" />
        ) : (
          <ul className="list">
            {rows.map((p) => (
              <li key={p.id}>
                <Link to={`/patients/${p.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                  <div className="item-top">
                    <div className="item-main">
                      <span className="avatar">{initials(p.full_name)}</span>
                      <div>
                        <b>{p.full_name}</b>
                        <span>{p.village || ""} {p.phone ? `· ${p.phone}` : ""}</span>
                      </div>
                    </div>
                    <span style={{ color: "var(--teal)" }}>View →</span>
                  </div>
                </Link>
                {p.duplicate_hint && <div className="warn" style={{ marginTop: 8 }}>{p.duplicate_hint}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Register() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [form, setForm] = useState({
    full_name: "",
    age: 46,
    sex: "female",
    phone: "",
    village: "G. Madugula",
    habitation: "",
    gram_panchayat: "G. Madugula",
    mandal: "G. Madugula",
    phc: "PHC G. Madugula",
    tobacco_use: "",
    symptoms: "",
    medical_history: "",
  });
  const [msg, setMsg] = useState("");
  const set = (k, v) => setForm({ ...form, [k]: v });
  async function submit(e) {
    e.preventDefault();
    const key = newIdempotencyKey();
    const payload = { ...form, age: Number(form.age) || null };
    if (!navigator.onLine) {
      enqueue({ path: "/patients", method: "POST", body: payload, key });
      setMsg("Saved offline as pending. Open Offline sync when connected.");
      toast("Saved offline — sync later from Offline sync");
      return;
    }
    try {
      const p = await api("/patients", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Idempotency-Key": key },
      });
      nav(`/patients/${p.id}`);
    } catch (ex) {
      setMsg(ex.message);
    }
  }
  return (
    <>
    <PageHead title={t.register} sub="Add a new patient record. Works offline too." />
    <div className="card">
      <form onSubmit={submit}>
        <label>{t.name}</label>
        <input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} required />
        <div className="grid">
          <div>
            <label>{t.age}</label>
            <input value={form.age} onChange={(e) => set("age", e.target.value)} />
          </div>
          <div>
            <label>{t.sex}</label>
            <input value={form.sex} onChange={(e) => set("sex", e.target.value)} />
          </div>
          <div>
            <label>{t.phone}</label>
            <input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div>
            <label>{t.village}</label>
            <input value={form.village} onChange={(e) => set("village", e.target.value)} />
          </div>
          <div>
            <label>{t.habitation}</label>
            <input value={form.habitation} onChange={(e) => set("habitation", e.target.value)} />
          </div>
          <div>
            <label>{t.gram}</label>
            <input value={form.gram_panchayat} onChange={(e) => set("gram_panchayat", e.target.value)} />
          </div>
          <div>
            <label>{t.mandal}</label>
            <input value={form.mandal} onChange={(e) => set("mandal", e.target.value)} />
          </div>
          <div>
            <label>{t.phc}</label>
            <input value={form.phc} onChange={(e) => set("phc", e.target.value)} />
          </div>
        </div>
        <label>{t.tobacco}</label>
        <input value={form.tobacco_use} onChange={(e) => set("tobacco_use", e.target.value)} />
        <label>{t.symptoms}</label>
        <textarea value={form.symptoms} onChange={(e) => set("symptoms", e.target.value)} />
        <label>{t.history}</label>
        <textarea value={form.medical_history} onChange={(e) => set("medical_history", e.target.value)} />
        <button type="submit">{t.save}</button>
      </form>
      {msg && <p className="warn" style={{ marginTop: 12 }}>{msg}</p>}
    </div>
    </>
  );
}

function PatientProfile() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const user = currentUser();
  const [p, setP] = useState(null);
  const [consents, setConsents] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [purpose, setPurpose] = useState("examination");
  const [screen, setScreen] = useState({ exam_notes: "", tobacco: "", symptoms: "", duration: "" });
  const [sid, setSid] = useState("");
  const [detail, setDetail] = useState(null);
  const [msg, setMsg] = useState("");
  const [preview, setPreview] = useState("");
  const [view, setView] = useState("cheek");
  const [analyzing, setAnalyzing] = useState(false);
  const consentCopy = {
    examination: t.consentExam,
    imaging: t.consentImage,
    teleconsultation: t.consentTele,
    data_processing: t.consentData,
  };
  async function load() {
    setP(await api(`/patients/${id}`));
    setConsents(await api(`/patients/${id}/consents`));
    const tl = await api(`/patients/${id}/timeline`);
    setTimeline(tl.events || []);
  }
  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, [id]);
  async function addConsent() {
    await api(`/patients/${id}/consents`, {
      method: "POST",
      body: JSON.stringify({ purpose, language: lang, granted: true }),
    });
    load();
  }
  async function startScreening() {
    const key = newIdempotencyKey();
    const body = { patient_id: id, ...screen };
    if (!navigator.onLine) {
      enqueue({ path: "/screenings", method: "POST", body, key });
      setMsg("Screening draft queued offline.");
      return;
    }
    const s = await api("/screenings", { method: "POST", body: JSON.stringify(body), headers: { "Idempotency-Key": key } });
    setSid(s.id);
    setDetail(await api(`/screenings/${s.id}`));
  }
  async function upload(e) {
    const picked = e.target.files?.[0];
    if (!picked || !sid) return;
    try {
      const file = await toUploadable(picked);
      setPreview(URL.createObjectURL(file));
      const fd = new FormData();
      fd.append("file", file);
      fd.append("view", view);
      const r = await api(`/screenings/${sid}/images`, { method: "POST", body: fd });
      setMsg(
        r.quality_status === "pending_ai"
          ? "Photo uploaded. The AI will check the photo quality when you analyse it."
          : `Image quality: ${r.quality_status} ${r.quality_reason || ""}. ${r.warning || ""}`
      );
      setDetail(await api(`/screenings/${sid}`));
    } catch (err) {
      setMsg(err.message || "Upload failed");
    }
  }
  async function analyze() {
    const imgs = detail?.images || [];
    if (!imgs.length) {
      setMsg("Upload a photo first.");
      return;
    }
    const target = [...imgs].reverse().find((im) => im.quality_status === "acceptable") || imgs[imgs.length - 1];
    setAnalyzing(true);
    setMsg("Sending the photo to the AI service… this can take up to a minute.");
    try {
      const r = await api("/ai/analyze", { method: "POST", body: JSON.stringify({ screening_id: sid, image_id: target.id }) });
      if (r.status === "image_insufficient") {
        setMsg("The AI could not assess this photo. See the feedback below on how to retake it.");
      } else {
        setMsg(`AI feedback ready (${r.provider}, research only). ${r.warning}`);
      }
      setDetail(await api(`/screenings/${sid}`));
    } catch (e) {
      setMsg(e.message);
      setDetail(await api(`/screenings/${sid}`).catch(() => detail));
    } finally {
      setAnalyzing(false);
    }
  }
  if (!p) return msg ? <div className="card err">{msg}</div> : <Loading />;
  const stepNo = !sid ? (consents.length ? 2 : 1) : detail?.ai_analyses?.length ? 5 : detail?.images?.length ? 4 : 3;
  const stepList = ["Consent", "Details", "Photo", "AI check"];
  return (
    <div>
      <div className="card">
        <div className="profile-head">
          <span className="avatar">{initials(p.full_name)}</span>
          <div>
            <h2 style={{ margin: 0 }}>{p.full_name}</h2>
            <div className="facts">
              <Pill kind="neutral">{p.age} / {p.sex}</Pill>
              {p.village && <Pill kind="neutral">{p.village}</Pill>}
              {p.phone && <Pill kind="neutral">{p.phone}</Pill>}
            </div>
          </div>
        </div>
        {p.symptoms && <p style={{ marginTop: 12 }}><b>{t.symptoms}:</b> {p.symptoms}</p>}
        {p.duplicate_hint && <p className="warn">{p.duplicate_hint}</p>}
      </div>
      {user.role === "health_worker" && (
        <>
          <div className="card">
            <div className="steps">
              {stepList.map((n, i) => (
                <div key={n} className={`step ${stepNo > i + 1 ? "done" : stepNo === i + 1 ? "cur" : ""}`}>
                  <i>{stepNo > i + 1 ? "✓" : i + 1}</i>
                  {n}
                </div>
              ))}
            </div>
            <h3>{t.consent}</h3>
            <p className="consent-box">{consentCopy[purpose]}</p>
            <div className="row">
              <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
                <option value="examination">examination</option>
                <option value="imaging">imaging</option>
                <option value="teleconsultation">teleconsultation</option>
                <option value="data_processing">data_processing</option>
              </select>
              <button onClick={addConsent}>{t.save}</button>
            </div>
            <ul className="list">
              {consents.map((c) => (
                <li key={c.id}>
                  <div className="item-top">
                    <span>{c.purpose} · {c.language}</span>
                    <Pill kind={c.granted ? "ok" : "bad"}>{c.granted ? "granted" : "no"}</Pill>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h3>{t.screening}</h3>
            <textarea placeholder={t.symptoms} value={screen.symptoms} onChange={(e) => setScreen({ ...screen, symptoms: e.target.value })} />
            <div className="grid">
              <input placeholder={t.duration} value={screen.duration} onChange={(e) => setScreen({ ...screen, duration: e.target.value })} />
              <input placeholder={t.tobacco} value={screen.tobacco} onChange={(e) => setScreen({ ...screen, tobacco: e.target.value })} />
            </div>
            <textarea placeholder="Exam notes" style={{ marginTop: 10 }} value={screen.exam_notes} onChange={(e) => setScreen({ ...screen, exam_notes: e.target.value })} />
            <button onClick={startScreening} style={{ marginTop: 10 }}>{t.save}</button>
            {sid && (
              <>
                <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "18px 0" }} />
                <p className="small">Screening {sid}</p>
                <label>{t.view}</label>
                <select value={view} onChange={(e) => setView(e.target.value)}>
                  <option value="cheek">cheek</option>
                  <option value="tongue">tongue</option>
                  <option value="palate">palate</option>
                  <option value="gums">gums</option>
                  <option value="floor">floor of mouth</option>
                </select>
                <label>{t.capture}</label>
                <input type="file" accept="image/*" capture="environment" onChange={upload} />
                {preview && <img className="preview" alt="preview" src={preview} />}
                <div className="row">
                  <button className="secondary" onClick={() => { setPreview(""); }}>{t.retake}</button>
                  <button onClick={analyze} disabled={analyzing || !detail?.images?.length}>{analyzing ? "Analysing photo…" : t.analyze}</button>
                </div>
              </>
            )}
            {detail && (
              <div className="small">
                {(detail.images || []).map((im) => (
                  <p key={im.id}>
                    {im.view}: <Pill>{im.quality_status}</Pill> {im.quality_reason || ""}
                  </p>
                ))}
              </div>
            )}
            {detail && (detail.ai_analyses || []).length > 0 && (
              <div>
                {detail.ai_analyses.slice(0, -1).map((a) => (
                  <p key={a.id} className="small">
                    Earlier run: {a.research_label || a.status} · {a.model_version}
                  </p>
                ))}
                <AiFeedback analysis={detail.ai_analyses[detail.ai_analyses.length - 1]} audience="worker" />
              </div>
            )}
          </div>
        </>
      )}
      <div className="card">
        <h3>Case timeline</h3>
        {timeline.length === 0 ? <Empty icon="list" text="No events yet" /> : (
          <ul className="timeline">
            {timeline.map((e, i) => (
              <li key={i}>
                <b>{e.type}</b>
                <span>{e.at}</span>
                {e.summary}
              </li>
            ))}
          </ul>
        )}
      </div>
      {msg && <p className="warn">{msg}</p>}
    </div>
  );
}

function Reviews() {
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [sel, setSel] = useState(null);
  const [finding, setFinding] = useState("Independent clinical suspicion on inner cheek (synthetic).");
  const [outcome, setOutcome] = useState("refer");
  const [agree, setAgree] = useState("disagree");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    Promise.all([
      api("/screenings?status=AWAITING_CLINICIAN"),
      api("/screenings?status=SCREENED"),
    ])
      .then(([a, b]) => setRows([...a, ...b]))
      .catch((e) => setMsg(e.message));
  }, []);
  async function open(id) {
    setSel(await api(`/screenings/${id}`));
  }
  async function sign() {
    const r = await api("/reviews", {
      method: "POST",
      body: JSON.stringify({ screening_id: sel.id, finding, outcome, ai_agreement: agree }),
    });
    if (outcome === "refer") {
      const ref = await api("/referrals", { method: "POST", body: JSON.stringify({ review_id: r.id, reason: finding }) });
      setMsg(`Signed. Referral ${ref.id}. ${ref.slip.en} / ${ref.slip.te}`);
    } else {
      setMsg("Signed without referral.");
    }
  }
  return (
    <>
      <PageHead title={t.reviews} sub="Independent clinical review. AI is advisory only." />
      <div className="card">
        {rows.length === 0 ? <Empty icon="check" text="No cases awaiting review" /> : (
          <ul className="list">
            {rows.map((s) => (
              <li key={s.id} className={`click ${sel?.id === s.id ? "selected" : ""}`} onClick={() => open(s.id)}>
                <div className="item-top">
                  <span><b>#{s.id.slice(0, 8)}</b> · {s.symptoms || s.exam_notes}</span>
                  {s.status && <Pill>{s.status}</Pill>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {sel && (
        <div className="card">
          <p className="warn">AI is advisory and nonclinical. Your signed note is independent.</p>
          {(sel.ai_analyses || []).length === 0 ? <p className="small">No AI analysis for this screening.</p> : (
            sel.ai_analyses.map((a) => <AiFeedback key={a.id} analysis={a} audience="clinician" />)
          )}
          <div className="row">
            {sel.images.map((im) => (
              <img key={im.id} className="photo" alt="" src={`/api/screenings/${sel.id}/images/${im.id}/file?access_token=${getToken()}`} />
            ))}
          </div>
          <label>Clinical finding</label>
          <textarea value={finding} onChange={(e) => setFinding(e.target.value)} />
          <div className="grid">
            <div>
              <label>Outcome</label>
              <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                <option value="refer">refer</option>
                <option value="follow_up">follow_up</option>
                <option value="recapture">request recapture</option>
              </select>
            </div>
            <div>
              <label>AI agreement</label>
              <select value={agree} onChange={(e) => setAgree(e.target.value)}>
                <option value="agree">agree with AI (still independent)</option>
                <option value="disagree">disagree with AI</option>
                <option value="deferred">deferred</option>
              </select>
            </div>
          </div>
          <button onClick={sign} style={{ marginTop: 14 }}>{t.sign}</button>
        </div>
      )}
      {msg && <p className="warn">{msg}</p>}
    </>
  );
}

function Referrals() {
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [slot, setSlot] = useState("2026-11-02 10:00");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api("/referrals").then(setRows);
  }, []);
  async function book(id, kind) {
    const a = await api("/appointments", { method: "POST", body: JSON.stringify({ referral_id: id, kind, slot, status: "CONFIRMED" }) });
    setMsg(`Booked ${a.kind} ${a.id}`);
    if (kind === "video") window.location.href = `/video/${a.id}`;
  }
  return (
    <>
      <PageHead title="Referrals" sub="Book a video consult or hospital slot." />
      <div className="card">
        <label>Appointment slot</label>
        <input value={slot} onChange={(e) => setSlot(e.target.value)} />
        {rows.length === 0 ? <Empty icon="file" text="No referrals yet" /> : (
          <ul className="list" style={{ marginTop: 14 }}>
            {rows.map((r) => (
              <li key={r.id}>
                <div className="item-top">
                  <div className="item-main">
                    <span className="avatar">{initials(r.patient_name || "R")}</span>
                    <div>
                      <b><Link to={`/patients/${r.patient_id}`}>{r.patient_name || r.id.slice(0, 8)}</Link></b>
                      <span>{r.village} · {r.facility}</span>
                    </div>
                  </div>
                  <Pill>{r.priority}</Pill>
                </div>
                <p className="small">{r.slip?.en}</p>
                <p className="small">{r.slip?.te}</p>
                <div className="row">
                  <button onClick={() => book(r.id, "video")}><Icon n="video" s={16} /> Video consult</button>
                  <button className="secondary" onClick={() => book(r.id, "physical")}>Hospital slot</button>
                  <button className="secondary" onClick={() => window.print()}>{t.printSlip}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {msg && <p className="warn">{msg}</p>}
      </div>
    </>
  );
}

function Appointments() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api("/appointments").then(setRows);
  }, []);
  async function patch(id, status) {
    await api(`/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    setRows(await api("/appointments"));
  }
  return (
    <>
      <PageHead title="Appointments" />
      <div className="card">
        {rows.length === 0 ? <Empty icon="cal" text="No appointments" /> : (
          <ul className="list">
            {rows.map((a) => (
              <li key={a.id}>
                <div className="item-top">
                  <span><b>{a.kind}</b> · {a.slot}</span>
                  <span>
                    <Pill>{a.status}</Pill>
                    {a.kind === "video" && <Link to={`/video/${a.id}`} style={{ marginLeft: 10 }}>Join call</Link>}
                  </span>
                </div>
                <div className="row">
                  {["CONFIRMED", "COMPLETED", "MISSED", "CANCELLED", "RESCHEDULED"].map((s) => (
                    <button key={s} className="secondary sm" onClick={() => patch(a.id, s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Video() {
  const { id } = useParams();
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api(`/appointments/${id}/video`)
      .then(setInfo)
      .catch((e) => setErr(e.message));
  }, [id]);
  if (err) return <div className="card err">{err}</div>;
  if (!info) return <Loading />;
  return (
    <div className="card">
      <h2>Teleconsultation (demo)</h2>
      <p className="warn">{info.warning} Recording is off by default.</p>
      <p className="small">Join the same room from a second demo account to show two-party video.</p>
      <iframe className="video" allow="camera; microphone; fullscreen; display-capture" src={info.url} title="video" />
    </div>
  );
}

function Investigations() {
  const [refs, setRefs] = useState([]);
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api("/referrals").then(setRefs);
    api("/investigations").then(setRows);
  }, []);
  async function order(referral_id) {
    await api("/investigations", { method: "POST", body: JSON.stringify({ referral_id, kind: "biopsy" }) });
    setRows(await api("/investigations"));
  }
  async function advance(id, state) {
    await api(`/investigations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        state,
        report_note: state === "REPORT_RECEIVED" ? "Synthetic histopathology: dysplasia example. NOT CLINICAL." : undefined,
        clinician_result: state === "CLINICIAN_REVIEWED" ? "Clinician-entered simulated result; treatment linkage pending." : undefined,
      }),
    });
    setRows(await api("/investigations"));
  }
  return (
    <>
      <PageHead title="Investigations" sub="Order and track biopsies and reports." />
      <div className="card">
        <div className="row">
          {refs.map((r) => (
            <button key={r.id} onClick={() => order(r.id)}>
              <Icon n="flask" s={16} /> Order biopsy for {r.id.slice(0, 8)}
            </button>
          ))}
        </div>
        {rows.length === 0 ? <Empty icon="flask" text="No investigations" /> : (
          <ul className="list">
            {rows.map((i) => (
              <li key={i.id}>
                <div className="item-top">
                  <b>{i.kind}</b>
                  <Pill>{i.state}</Pill>
                </div>
                <div className="row">
                  {["SCHEDULED", "SAMPLE_COLLECTED", "REPORT_PENDING", "REPORT_RECEIVED", "CLINICIAN_REVIEWED"].map((s) => (
                    <button key={s} className="secondary sm" onClick={() => advance(i.id, s)}>
                      {s}
                    </button>
                  ))}
                </div>
                {i.report_note && <p className="small">{i.report_note}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function NavigatorPage() {
  const [rows, setRows] = useState([]);
  const [note, setNote] = useState("Contacted family; transport arranged (synthetic).");
  useEffect(() => {
    api("/navigation").then(setRows);
  }, []);
  async function update(id, status) {
    await api(`/navigation/${id}`, { method: "PATCH", body: JSON.stringify({ status, contact_log: note }) });
    setRows(await api("/navigation"));
  }
  return (
    <>
      <PageHead title="Patient navigation" sub="Follow up until the patient reaches care." />
      <div className="card">
        <label>Contact log note</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        {rows.length === 0 ? <Empty icon="compass" text="No tasks" /> : (
          <ul className="list" style={{ marginTop: 14 }}>
            {rows.map((t) => (
              <li key={t.id}>
                <div className="item-top">
                  <div className="item-main">
                    <span className="avatar">{initials(t.patient_name || "N")}</span>
                    <div>
                      <b>{t.patient_name || t.id.slice(0, 8)}</b>
                      <span>{t.village} · due {t.due}</span>
                    </div>
                  </div>
                  <Pill>{t.status}</Pill>
                </div>
                {t.contact_log && <pre className="small">{t.contact_log}</pre>}
                <div className="row">
                  <button className="sm" onClick={() => update(t.id, "IN_PROGRESS")}>Accept</button>
                  <button className="secondary sm" onClick={() => update(t.id, "OVERDUE")}>Escalate</button>
                  <button className="secondary sm" onClick={() => update(t.id, "CLOSED")}>Close after linkage</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Dashboard() {
  const [d, setD] = useState(null);
  useEffect(() => {
    api("/dashboard/summary").then(setD);
  }, []);
  if (!d) return <Loading />;
  const nums = Object.entries(d).filter(([k, v]) => k !== "note" && typeof v === "number");
  const max = Math.max(1, ...nums.map(([, v]) => v));
  return (
    <>
      <PageHead title="District dashboard" sub={d.note} />
      <div className="kpis">
        {Object.entries(d)
          .filter(([k]) => k !== "note")
          .map(([k, v]) => (
            <div className="kpi" key={k}>
              <i><Icon n="chart" s={18} /></i>
              <b>{v}</b>
              {k.replace(/_/g, " ")}
              {typeof v === "number" && <div className="bar"><span style={{ width: `${Math.round((v / max) * 100)}%` }} /></div>}
            </div>
          ))}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <button
          className="secondary"
          onClick={async () => {
            await api("/admin/reset-demo", { method: "POST" });
            setD(await api("/dashboard/summary"));
            toast("Synthetic demo data reset");
          }}
        >
          Reset synthetic demo data
        </button>
      </div>
    </>
  );
}

function AuditPage() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api("/audit").then(setRows);
  }, []);
  return (
    <>
      <PageHead title="Audit trail" sub="Every access and change is recorded." />
      <div className="card">
        {rows.length === 0 ? <Empty icon="list" text="No audit events" /> : (
          <ul className="timeline">
            {rows.map((a) => (
              <li key={a.id}>
                <b>{a.event}</b>
                <span>{a.created_at}</span>
                {a.resource}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Notes() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api("/notifications").then(setRows);
  }, []);
  return (
    <>
      <PageHead title="Notifications" sub="Reminders omit clinical details." />
      <div className="card">
        {rows.length === 0 ? <Empty icon="bell" text="You're all caught up" /> : (
          <ul className="list">
            {rows.map((n) => (
              <li key={n.id}>
                <b>{n.title}</b>
                <p className="small">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function OfflinePage() {
  const [q, setQ] = useState(getQueue());
  return (
    <>
      <PageHead title="Offline sync" sub="Airplane-mode test: save a patient or screening, reopen, then sync once." />
      <div className="card">
        <button
          onClick={async () => {
            setQ(await flushQueue());
            toast("Sync finished");
          }}
        >
          <Icon n="cloud" s={16} /> Sync now
        </button>
        {q.length === 0 ? <Empty icon="cloud" text="Nothing waiting to sync" /> : (
          <ul className="list" style={{ marginTop: 14 }}>
            {q.map((i) => (
              <li key={i.key}>
                <div className="item-top">
                  <span>{i.path}</span>
                  <Pill>{i.status}</Pill>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export default function App() {
  const user = currentUser();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Guard><Home /></Guard>} />
      <Route path="/patients" element={<Guard roles={["health_worker", "medical_officer", "specialist"]}><Patients /></Guard>} />
      <Route path="/patients/:id" element={<Guard roles={["health_worker", "medical_officer", "specialist"]}><PatientProfile /></Guard>} />
      <Route path="/register" element={<Guard roles={["health_worker"]}><Register /></Guard>} />
      <Route path="/reviews" element={<Guard roles={["medical_officer"]}><Reviews /></Guard>} />
      <Route path="/referrals" element={<Guard roles={["specialist", "medical_officer", "navigator"]}><Referrals /></Guard>} />
      <Route path="/appointments" element={<Guard roles={["specialist", "navigator", "medical_officer", "health_worker"]}><Appointments /></Guard>} />
      <Route path="/video/:id" element={<Guard roles={["specialist", "health_worker", "medical_officer"]}><Video /></Guard>} />
      <Route path="/investigations" element={<Guard roles={["specialist", "medical_officer"]}><Investigations /></Guard>} />
      <Route path="/navigator" element={<Guard roles={["navigator"]}><NavigatorPage /></Guard>} />
      <Route path="/dashboard" element={<Guard roles={["admin", "medical_officer"]}><Dashboard /></Guard>} />
      <Route path="/audit" element={<Guard roles={["admin", "medical_officer"]}><AuditPage /></Guard>} />
      <Route path="/notifications" element={<Guard><Notes /></Guard>} />
      <Route path="/offline" element={<Guard roles={["health_worker"]}><OfflinePage /></Guard>} />
      <Route path="*" element={<Navigate to={user ? "/" : "/login"} />} />
    </Routes>
  );
}
