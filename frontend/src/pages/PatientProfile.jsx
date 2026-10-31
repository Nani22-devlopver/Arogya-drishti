import { useEffect, useRef, useState, useMemo } from "react";
import { Link, NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, clearSession, currentUser, enqueue, flushQueue, getQueue, getToken, newIdempotencyKey, setSession } from "../api";
import { useI18n, ICONS, Icon, initials, tone, Pill, toUploadable, AI_LABELS, URGENCY_KIND, URGENCY_TEXT, BulletList, AiFeedback, Empty, Loading, toast, Toasts, PageHead, slotLabel, localToSlot, slotToLocalInput, defaultSlotInput, weekdayLabel, isPast, DateTimePick } from "../common";

export default function PatientProfile() {
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
  // The photo that is currently selected for analysis. Set on every successful upload and cleared on Retake,
  // so "Analyse" can never fall back to an older photo.
  const [activeImageId, setActiveImageId] = useState("");
  const [fileKey, setFileKey] = useState(0); // remounts the <input type=file> so picking the same file name fires onChange again
  const previewUrl = useRef("");
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
  function setPreviewUrl(url) {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = url;
    setPreview(url);
  }
  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);
  function retake() {
    setPreviewUrl("");
    setActiveImageId("");
    setFileKey((k) => k + 1);
    setMsg("Choose or capture a new photo. It will be uploaded and the new photo is the one that gets analysed.");
  }
  async function upload(e) {
    const picked = e.target.files?.[0];
    if (!picked || !sid) return;
    try {
      const file = await toUploadable(picked);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("view", view);
      const r = await api(`/screenings/${sid}/images`, { method: "POST", body: fd });
      // Only after the server accepted it: this upload is now the photo to analyse.
      setActiveImageId(r.id);
      setPreviewUrl(URL.createObjectURL(file));
      setMsg(
        r.quality_status === "pending_ai"
          ? "New photo uploaded. Tap Analyse to send this photo to the AI."
          : `Image quality: ${r.quality_status} ${r.quality_reason || ""}. ${r.warning || ""}`
      );
      setDetail(await api(`/screenings/${sid}`));
    } catch (err) {
      setMsg(err.message || "Upload failed");
    } finally {
      setFileKey((k) => k + 1); // allow re-selecting the same file name
    }
  }
  async function analyze() {
    const imgs = detail?.images || [];
    // Always the photo that was just uploaded (never an older "acceptable" one). Images arrive oldest to newest.
    const target = imgs.find((im) => im.id === activeImageId);
    if (!target) {
      setMsg(imgs.length ? "Upload the new photo first, then tap Analyse." : "Upload a photo first.");
      return;
    }
    setAnalyzing(true);
    setMsg("Sending the photo to the AI service… this can take up to a minute.");
    try {
      const r = await api("/ai/analyze", { method: "POST", body: JSON.stringify({ screening_id: sid, image_id: target.id }) });
      if (r.status === "image_insufficient") {
        setMsg("The AI could not assess this photo. See the feedback below on how to retake it.");
      } else {
        setMsg(`AI assessment ready: ${r.feedback?.predicted_condition?.name || r.research_label}. ${r.warning}`);
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
                <input key={fileKey} type="file" accept="image/*" capture="environment" onChange={upload} />
                {preview && <img className="preview" alt="preview" src={preview} />}
                <div className="row">
                  <button className="secondary" onClick={retake} disabled={analyzing}>{t.retake}</button>
                  <button onClick={analyze} disabled={analyzing || !activeImageId}>{analyzing ? "Analysing photo…" : t.analyze}</button>
                </div>
              </>
            )}
            {detail && (
              <div className="small">
                {(detail.images || []).map((im) => (
                  <p key={im.id}>
                    {im.view}: <Pill>{im.quality_status}</Pill> {im.quality_reason || ""}{im.id === activeImageId ? " (current photo)" : ""}
                  </p>
                ))}
              </div>
            )}
            {detail && (detail.ai_analyses || []).length > 0 && (() => {
              const all = detail.ai_analyses;
              // Show the result for the current photo only; results for earlier photos are kept as one-line history.
              const current = activeImageId ? all.filter((a) => a.image_id === activeImageId).slice(-1)[0] : null;
              const earlier = all.filter((a) => a !== current);
              return (
                <div>
                  {earlier.map((a) => (
                    <p key={a.id} className="small">
                      Earlier run{a.image_id ? ` (photo ${a.image_id.slice(0, 8)})` : ""}: {a.research_label || a.status} · {a.model_version}
                    </p>
                  ))}
                  {current ? <AiFeedback analysis={current} audience="worker" /> : <p className="small">{activeImageId ? "Not analysed yet. Tap Analyse for the new photo." : "Upload a new photo to analyse it."}</p>}
                </div>
              );
            })()}
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

