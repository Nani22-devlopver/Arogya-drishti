import { useEffect, useState, useMemo } from "react";
import { Link, NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, clearSession, currentUser, enqueue, flushQueue, getQueue, getToken, newIdempotencyKey, setSession } from "../api";
import { useI18n, ICONS, Icon, initials, tone, Pill, toUploadable, AI_LABELS, URGENCY_KIND, URGENCY_TEXT, BulletList, AiFeedback, Empty, Loading, toast, Toasts, PageHead, slotLabel, localToSlot, slotToLocalInput, defaultSlotInput, weekdayLabel, isPast, DateTimePick } from "../common";

export default function Reviews() {
  const { t } = useI18n();
  const [rows, setRows] = useState(null);
  const [sel, setSel] = useState(null);
  const [loadingCase, setLoadingCase] = useState(false);
  const [q, setQ] = useState("");
  const [finding, setFinding] = useState("");
  const [outcome, setOutcome] = useState("refer");
  const [agree, setAgree] = useState("deferred");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [a, b] = await Promise.all([api("/screenings?status=AWAITING_CLINICIAN"), api("/screenings?status=SCREENED")]);
      setRows([...a, ...b]);
    } catch (e) {
      setErr(e.message);
      setRows([]);
    }
  }
  useEffect(() => { load(); }, []);

  async function open(id) {
    setMsg("");
    setErr("");
    setLoadingCase(true);
    try {
      const s = await api(`/screenings/${id}`);
      setSel(s);
      setFinding(s.symptoms || s.exam_notes || "");
      setOutcome("refer");
      setAgree("deferred");
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoadingCase(false);
    }
  }

  async function sign() {
    setBusy(true);
    setErr("");
    try {
      const r = await api("/reviews", { method: "POST", body: JSON.stringify({ screening_id: sel.id, finding, outcome, ai_agreement: agree }) });
      if (outcome === "refer") {
        const ref = await api("/referrals", { method: "POST", body: JSON.stringify({ review_id: r.id, reason: finding }) });
        setMsg(`Signed. Referral ${ref.id.slice(0, 8)} created. ${ref.slip.en} / ${ref.slip.te}`);
      } else {
        setMsg("Signed without referral.");
      }
      toast("Review signed");
      setSel(null);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const list = (rows || []).filter((s) => {
    const hay = `${s.id} ${s.symptoms || ""} ${s.exam_notes || ""} ${s.status || ""}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  return (
    <>
      <PageHead title={t.reviews} sub="Pick a record on the left to see its report and sign on the right. AI is advisory only." />
      {msg && <p className="okmsg">{msg}</p>}
      {err && <p className="err">{err}</p>}
      <div className="split">
        <aside className="split-list card">
          <div className="searchbox">
            <Icon n="search" s={16} />
            <input placeholder="Search records" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search records" />
          </div>
          <div className="small" style={{ margin: "10px 2px 6px" }}>{rows ? `${list.length} of ${rows.length} records` : "Loading…"}</div>
          {rows === null ? <Loading /> : list.length === 0 ? <Empty icon="check" text="No cases awaiting review" /> : (
            <ul className="rec-list">
              {list.map((s) => (
                <li key={s.id}>
                  <button type="button" className={`rec ${sel?.id === s.id ? "on" : ""}`} onClick={() => open(s.id)}>
                    <span className="avatar">{initials(s.symptoms || "C")}</span>
                    <span className="rec-body">
                      <b>#{s.id.slice(0, 8)}</b>
                      <span>{(s.symptoms || s.exam_notes || "No notes").slice(0, 60)}</span>
                    </span>
                    {s.status && <Pill>{s.status.replace(/_/g, " ")}</Pill>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="split-detail">
          {loadingCase ? <Loading /> : !sel ? (
            <div className="card"><Empty icon="file" text="Select a record to view the report and signature section" /></div>
          ) : (
            <>
              <div className="card">
                <div className="item-top">
                  <h3 style={{ margin: 0 }}>Report · #{sel.id.slice(0, 8)}</h3>
                  {sel.status && <Pill>{sel.status.replace(/_/g, " ")}</Pill>}
                </div>
                <p className="warn" style={{ marginTop: 10 }}>AI is advisory and nonclinical. Your signed note is independent.</p>
                <dl className="facts">
                  {sel.symptoms && <><dt>Symptoms</dt><dd>{sel.symptoms}</dd></>}
                  {sel.duration && <><dt>Duration</dt><dd>{sel.duration}</dd></>}
                  {sel.tobacco && <><dt>Tobacco</dt><dd>{sel.tobacco}</dd></>}
                  {sel.exam_notes && <><dt>Exam notes</dt><dd>{sel.exam_notes}</dd></>}
                </dl>
                {(sel.images || []).length > 0 && (
                  <div className="row">
                    {sel.images.map((im) => (
                      <img key={im.id} className="photo" alt="" src={`/api/screenings/${sel.id}/images/${im.id}/file?access_token=${getToken()}`} />
                    ))}
                  </div>
                )}
                {(sel.ai_analyses || []).length === 0 ? <p className="small">No AI analysis for this screening.</p> : (
                  sel.ai_analyses.map((a) => <AiFeedback key={a.id} analysis={a} audience="clinician" />)
                )}
              </div>

              <div className="card sign-card">
                <h3>Signature</h3>
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
                <button onClick={sign} disabled={busy || !finding.trim()} style={{ marginTop: 14 }}>{busy ? "…" : t.sign}</button>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
