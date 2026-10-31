import { useEffect, useState } from "react";
import { strings } from "./i18n";

export function useI18n() {
  const [lang, setLang] = useState(localStorage.getItem("lang") || "en");
  const t = strings[lang] || strings.en;
  // every component using useI18n follows a language change immediately (e.g. the AI card switches to its Telugu output)
  useEffect(() => {
    const h = (e) => setLang(e.detail);
    window.addEventListener("lang-changed", h);
    return () => window.removeEventListener("lang-changed", h);
  }, []);
  const switchLang = (value) => {
    localStorage.setItem("lang", value);
    setLang(value);
    window.dispatchEvent(new CustomEvent("lang-changed", { detail: value }));
  };
  return { lang, t, switchLang };
}

/* ---------- small UI helpers (presentation only) ---------- */
export const ICONS = {
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
export function Icon({ n, s = 20 }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[n] || ICONS.file} />
    </svg>
  );
}
export const initials = (name = "?") => name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
export function tone(status = "") {
  const v = String(status).toUpperCase();
  if (/(CONFIRMED|COMPLETED|CLOSED|GOOD|PASS|REVIEWED|RECEIVED|GRANTED|AGREE)/.test(v) && !/DISAGREE/.test(v)) return "ok";
  if (/(MISSED|CANCEL|OVERDUE|FAIL|POOR|BAD|BLUR|REJECT|URGENT|HIGH)/.test(v)) return "bad";
  if (/(PENDING|AWAIT|RESCHEDULED|SCHEDULED|PROGRESS|SUSPICIOUS|WARN)/.test(v)) return "warn";
  return "neutral";
}
export const Pill = ({ children, kind }) => <span className={`pill ${kind || tone(children)}`}>{children}</span>;
// The backend accepts JPEG/PNG/WEBP. Browsers can decode others (AVIF, HEIC on Safari), so convert to JPEG first.
export async function toUploadable(file) {
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

export const AI_LABELS = {
  suspicious_example: { text: "Needs a doctor's attention", kind: "warn" },
  condition_possible_example: { text: "Possible condition", kind: "warn" },
  no_suspicious_finding_example: { text: "No disease detected", kind: "ok" },
  inconclusive_example: { text: "Cannot be assessed", kind: "neutral" },
};
// Headings of the AI card in both languages. The AI's own text comes from its English output or its Telugu output.
const AI_UI = {
  en: {
    labels: null, urgency: null, likelihood: "Likelihood", mostLikely: "Most likely", other: "Other possibilities", assessment: "Assessment",
    clinSummary: "Summary for the reviewing clinician", given: "Health suggestions given", guidanceGiven: "Guidance given to the field worker",
    patientMsg: "Message for the patient", suggestions: "Health suggestions", seeSooner: "See a doctor sooner if", nextSteps: "Next steps for the health worker",
    consult: "Doctor consultation:", cannot: "This photo cannot be assessed – please retake it.", issues: "Photo issues", howRetake: "How to retake the photo",
    disclaimer: "Provisional AI impression – a doctor must confirm any diagnosis.", noTe: "Telugu version is not available for this result; showing English.",
  },
  te: {
    labels: {
      suspicious_example: "డాక్టర్ దృష్టి అవసరం", condition_possible_example: "సమస్య ఉండే అవకాశం",
      no_suspicious_finding_example: "ఎటువంటి వ్యాధి కనుగొనబడలేదు", inconclusive_example: "ఈ ఫోటోతో అంచనా వేయలేము",
    },
    urgency: { urgent: "వెంటనే డాక్టర్‌ను కలవండి", soon: "త్వరలో డాక్టర్‌ను కలవండి", routine: "సాధారణ పరీక్ష" },
    likelihood: "అవకాశం", mostLikely: "అత్యంత అవకాశం ఉన్నది", other: "ఇతర అవకాశాలు", assessment: "అంచనా",
    clinSummary: "సమీక్షించే డాక్టర్ కోసం సారాంశం", given: "ఇచ్చిన ఆరోగ్య సూచనలు", guidanceGiven: "ఆరోగ్య కార్యకర్తకు ఇచ్చిన మార్గదర్శకం",
    patientMsg: "రోగికి సందేశం", suggestions: "ఆరోగ్య సూచనలు", seeSooner: "ఇవి కనిపిస్తే త్వరగా డాక్టర్‌ను కలవండి", nextSteps: "ఆరోగ్య కార్యకర్త తదుపరి చర్యలు",
    consult: "డాక్టర్ సంప్రదింపు:", cannot: "ఈ ఫోటోను అంచనా వేయలేము – దయచేసి మళ్లీ తీయండి.", issues: "ఫోటో సమస్యలు", howRetake: "ఫోటో మళ్లీ ఎలా తీయాలి",
    disclaimer: "తాత్కాలిక AI అంచనా – ఏ నిర్ధారణనైనా డాక్టర్ ధృవీకరించాలి.", noTe: "ఈ ఫలితానికి తెలుగు వెర్షన్ అందుబాటులో లేదు; ఇంగ్లీష్ చూపిస్తున్నాము.",
  },
};

export const URGENCY_KIND = { urgent: "bad", soon: "warn", routine: "ok" };
export const URGENCY_TEXT = { urgent: "See a doctor urgently", soon: "See a doctor soon", routine: "Routine check-up" };

export function BulletList({ title, items }) {
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

// "Junior doctor" assessment returned by the backend after it sent the photo to Ollama Cloud.
// audience: "worker" (field health worker, with a patient-friendly message) or "clinician" (reviewing doctor).
export function AiFeedback({ analysis, audience = "worker" }) {
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
        This photo could not be assessed, so it was not sent to the AI. Please upload a new photo.
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
  const ui = AI_UI[lang] || AI_UI.en;
  const te = lang === "te" ? fb.translations?.te : null; // output 2: the Telugu version from the AI
  const base = AI_LABELS[analysis.research_label] || { text: analysis.research_label || analysis.status, kind: "neutral" };
  const label = { ...base, text: ui.labels?.[analysis.research_label] || base.text };
  const usable = fb.image_assessment?.usable !== false;
  const condEn = fb.predicted_condition || {};
  const cond = { ...condEn, name: te?.predicted_condition?.name || condEn.name, other_possibilities: te?.predicted_condition?.other_possibilities?.length ? te.predicted_condition.other_possibilities : condEn.other_possibilities };
  const pick = (k) => (te && te[k] && (!Array.isArray(te[k]) || te[k].length) ? te[k] : fb[k]);
  const issues = te?.image_assessment?.issues?.length ? te.image_assessment.issues : fb.image_assessment?.issues;
  const patientText = fb.patient_message?.[lang] || fb.patient_message?.en;
  const urgencyText = ui.urgency?.[fb.suggested_urgency] || URGENCY_TEXT[fb.suggested_urgency];
  return (
    <div className="ai-box" lang={lang}>
      <div className="ai-head">
        <Pill kind={label.kind}>{label.text}</Pill>
        {usable && fb.suggested_urgency && <Pill kind={URGENCY_KIND[fb.suggested_urgency]}>{urgencyText}</Pill>}
        {usable && cond.disease_detected && cond.likelihood && <Pill kind="neutral">{ui.likelihood}: {cond.likelihood}</Pill>}
        <span className="small">{analysis.provider} · {analysis.model_version}</span>
      </div>
      {lang === "te" && !te && <p className="small">{ui.noTe}</p>}
      {!usable ? (
        <>
          <div className="ai-retake">
            <b>{ui.cannot}</b>
          </div>
          <BulletList title={ui.issues} items={issues} />
          <BulletList title={ui.howRetake} items={pick("recapture_tips")} />
        </>
      ) : (
        <>
          <div className="ai-condition">
            <span className="small">{ui.mostLikely}</span>
            <h3>{cond.name || "—"}</h3>
            {cond.other_possibilities?.length > 0 && <p className="small">{ui.other}: {cond.other_possibilities.join(", ")}</p>}
          </div>
          {pick("analysis") && (
            <div className="ai-block">
              <h4>{ui.assessment}</h4>
              <p>{pick("analysis")}</p>
            </div>
          )}
          {audience === "clinician" ? (
            <>
              {pick("clinician_summary") && (
                <div className="ai-block">
                  <h4>{ui.clinSummary}</h4>
                  <p>{pick("clinician_summary")}</p>
                </div>
              )}
              <BulletList title={ui.given} items={pick("health_suggestions")} />
              <BulletList title={ui.guidanceGiven} items={pick("health_worker_guidance")} />
            </>
          ) : (
            <>
              {patientText && (
                <div className="ai-block ai-patient">
                  <h4>{ui.patientMsg}</h4>
                  <p>{patientText}</p>
                </div>
              )}
              <BulletList title={ui.suggestions} items={pick("health_suggestions")} />
              <BulletList title={ui.seeSooner} items={pick("warning_signs")} />
              <BulletList title={ui.nextSteps} items={pick("health_worker_guidance")} />
            </>
          )}
          {pick("consult_advice") && (
            <div className="ai-consult">
              <b>{ui.consult}</b> {pick("consult_advice")}
            </div>
          )}
        </>
      )}
      {pick("limitations") && <p className="small">{pick("limitations")}</p>}
      <p className="small ai-disclaimer">{analysis.warning} · {ui.disclaimer}</p>
    </div>
  );
}

export function Empty({ icon = "inbox", text = "Nothing here yet" }) {
  return (
    <div className="empty">
      <Icon n={icon} s={40} />
      <div>{text}</div>
    </div>
  );
}
export function Loading() {
  return (
    <div className="card">
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}
export function toast(text) {
  window.dispatchEvent(new CustomEvent("app-toast", { detail: text }));
}
export const MAX_TOASTS = 3; // never show more than 3 alerts at once
export function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const h = (e) => {
      const id = Math.random();
      // newest alerts stay; anything beyond the limit is dropped from the oldest end
      setItems((x) => [...x.filter((i) => i.text !== e.detail), { id, text: e.detail }].slice(-MAX_TOASTS));
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
export function PageHead({ title, sub, children }) {
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


// Slots are stored as ISO strings (UTC). Older free-text slots are shown as typed.
export function slotLabel(slot) {
  const d = new Date(slot);
  return Number.isNaN(d.getTime()) ? slot : d.toLocaleString([], { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
export function localToSlot(value) {
  // value comes from the date+time pickers (browser local time); keep the local UTC offset so the weekday and hour stay exact
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const p = (n) => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const o = Math.abs(off);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00${sign}${p(Math.floor(o / 60))}:${p(o % 60)}`;
}
export function slotToLocalInput(slot) {
  const d = new Date(slot);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function defaultSlotInput() {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  d.setMinutes(0, 0, 0);
  return slotToLocalInput(d.toISOString());
}

export function weekdayLabel(local) {
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
export function isPast(local) {
  const d = new Date(local);
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now() - 60000;
}

// Exact date + time picker that always shows the day of the week. value/onChange use "YYYY-MM-DDTHH:mm".
export function DateTimePick({ value, onChange, label = "Date and time" }) {
  const [date, time] = (value || "T").split("T");
  const today = slotToLocalInput(new Date().toISOString()).slice(0, 10);
  const set = (d, t) => onChange(d && t ? `${d}T${t}` : d ? `${d}T${t || "09:00"}` : "");
  return (
    <div className="dtpick">
      <label>{label}</label>
      <div className="row" style={{ margin: 0 }}>
        <input type="date" value={date || ""} min={today} onChange={(e) => set(e.target.value, time)} aria-label="Date" required />
        <input type="time" value={time || ""} onChange={(e) => set(date, e.target.value)} aria-label="Time" required />
      </div>
      {value && <p className="day-chip">{weekdayLabel(value)} · {time}</p>}
    </div>
  );
}
