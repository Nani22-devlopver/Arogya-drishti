import { useEffect, useState, useMemo } from "react";
import { Link, NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, clearSession, currentUser, enqueue, flushQueue, getQueue, getToken, newIdempotencyKey, setSession } from "../api";
import { useI18n, ICONS, Icon, initials, tone, Pill, toUploadable, AI_LABELS, URGENCY_KIND, URGENCY_TEXT, BulletList, AiFeedback, Empty, Loading, toast, Toasts, PageHead, slotLabel, localToSlot, slotToLocalInput, defaultSlotInput, weekdayLabel, isPast, DateTimePick } from "../common";

const DESIGNATIONS = [
  ["health_worker", "Health worker"],
  ["navigator", "Navigator"],
  ["medical_officer", "Medical officer"],
  ["specialist", "Specialist"],
];

export default function Login() {
  const { t, lang, switchLang } = useI18n();
  const nav = useNavigate();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("hw@demo.local");
  const [password, setPassword] = useState("Demo@123");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reg, setReg] = useState({ full_name: "", email: "", password: "", role: "health_worker", assigned_facility: "" });
  const demos = [["hw", "Health worker"], ["mo", "Medical officer"], ["spec", "Specialist"], ["nav", "Navigator"], ["admin", "Admin"]];

  function switchMode(m) {
    setMode(m);
    setErr("");
    setOk("");
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setOk("");
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

  async function register(e) {
    e.preventDefault();
    setErr("");
    setOk("");
    setBusy(true);
    try {
      const res = await api("/auth/register", { method: "POST", body: JSON.stringify(reg) });
      setOk(res.message);
      setEmail(reg.email);
      setPassword("");
      setReg({ full_name: "", email: "", password: "", role: "health_worker", assigned_facility: "" });
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  const setR = (k) => (e) => setReg({ ...reg, [k]: e.target.value });

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
            <div className="tabs" role="tablist">
              <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "on" : ""} onClick={() => switchMode("login")}>{t.login}</button>
              <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "on" : ""} onClick={() => switchMode("register")}>Register</button>
            </div>

            {mode === "login" ? (
              <>
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
                  {ok && <p className="okmsg" style={{ marginTop: 12 }}>{ok}</p>}
                  {err && <p className="err" style={{ marginTop: 12 }}>{err}</p>}
                  <button type="submit" style={{ width: "100%" }} disabled={busy}>{busy ? "…" : t.login}</button>
                </form>
                <p className="small" style={{ marginTop: 12 }}>Demo: hw / mo / spec / nav / admin @demo.local — password Demo@123</p>
              </>
            ) : (
              <>
                <p className="small">Create an account. An admin must approve it before you can sign in.</p>
                <form onSubmit={register}>
                  <label>Full name</label>
                  <input value={reg.full_name} onChange={setR("full_name")} required minLength={2} autoComplete="name" />
                  <label>{t.email}</label>
                  <input type="email" value={reg.email} onChange={setR("email")} required autoComplete="email" />
                  <label>{t.password} (min 8 characters)</label>
                  <input type="password" value={reg.password} onChange={setR("password")} required minLength={8} autoComplete="new-password" />
                  <label>Designation you are applying for</label>
                  <select value={reg.role} onChange={setR("role")}>
                    {DESIGNATIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <label>Facility (optional)</label>
                  <input value={reg.assigned_facility} onChange={setR("assigned_facility")} placeholder="PHC G. Madugula" />
                  {ok && <p className="okmsg" style={{ marginTop: 12 }}>{ok}</p>}
                  {err && <p className="err" style={{ marginTop: 12 }}>{err}</p>}
                  <button type="submit" style={{ width: "100%" }} disabled={busy}>{busy ? "…" : "Submit for approval"}</button>
                </form>
              </>
            )}
            <label>{t.language}</label>
            <select value={lang} onChange={(e) => switchLang(e.target.value)}>
              <option value="en">English</option>
              <option value="te">తెలుగు</option>
            </select>
          </div>
        </section>
      </div>
    </>
  );
}
