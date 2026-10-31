import { useEffect, useState, useMemo } from "react";
import { Link, NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, clearSession, currentUser, enqueue, flushQueue, getQueue, getToken, newIdempotencyKey, setSession } from "../api";
import { useI18n, ICONS, Icon, initials, tone, Pill, toUploadable, AI_LABELS, URGENCY_KIND, URGENCY_TEXT, BulletList, AiFeedback, Empty, Loading, toast, Toasts, PageHead, slotLabel, localToSlot, slotToLocalInput, defaultSlotInput, weekdayLabel, isPast, DateTimePick } from "../common";

export default function Referrals() {
  const { t } = useI18n();
  const user = currentUser();
  const isSpecialist = user?.role === "specialist";
  const [rows, setRows] = useState([]);
  const [slot, setSlot] = useState(defaultSlotInput());
  const [mode, setMode] = useState("schedule"); // "schedule" | "now" (specialist only)
  const [meetUrl, setMeetUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    api("/referrals").then(setRows);
  }, []);

  async function book(id, kind) {
    setErr("");
    setMsg("");
    const startNow = kind === "video" && mode === "now";
    if (kind === "video" && !meetUrl.trim()) {
      setErr("Paste a Google Meet link first (use 'Create a Meet link' to get one).");
      return;
    }
    if (!startNow && (!slot || isPast(slot))) {
      setErr("Pick a date and time that is in the future.");
      return;
    }
    // open the tab inside the click so the browser does not block it
    const tab = startNow ? window.open("", "_blank") : null;
    setBusy(id);
    try {
      const a = await api("/appointments", {
        method: "POST",
        body: JSON.stringify({ referral_id: id, kind, slot: localToSlot(slot), status: "CONFIRMED", meet_url: kind === "video" ? meetUrl.trim() : null, start_now: startNow }),
      });
      if (startNow) {
        if (tab) { tab.opener = null; tab.location.href = meetUrl.trim(); }
        setMsg("Call started. The health worker, medical officer and navigators were notified to join. If the Meet tab did not open, use Appointments → Join call.");
        toast("Call started and team notified");
      } else {
        setMsg(`Booked ${a.kind === "video" ? "Google Meet video consultation" : "hospital slot"} for ${weekdayLabel(slot)} at ${slot.split("T")[1]}. The health worker, medical officer and navigators were notified.`);
        toast("Booked and notified");
      }
    } catch (e) {
      if (tab) tab.close();
      setErr(e.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <PageHead title="Referrals" sub="Schedule a Google Meet consultation or a hospital slot." />
      <div className="card">
        {isSpecialist && (
          <>
            <label>Video consultation timing</label>
            <div className="tabs" role="radiogroup" aria-label="Timing">
              <button type="button" role="radio" aria-checked={mode === "schedule"} className={mode === "schedule" ? "on" : ""} onClick={() => setMode("schedule")}>Schedule for later</button>
              <button type="button" role="radio" aria-checked={mode === "now"} className={mode === "now" ? "on" : ""} onClick={() => setMode("now")}>Start now</button>
            </div>
          </>
        )}
        {mode === "schedule" && <DateTimePick value={slot} onChange={setSlot} label="Exact date and time (your local time)" />}
        {mode === "now" && <p className="okmsg">The call starts immediately when you press Video consult. Only specialists can do this.</p>}

        <label>Google Meet link (for video consults)</label>
        <div className="row" style={{ margin: 0 }}>
          <input value={meetUrl} onChange={(e) => setMeetUrl(e.target.value)} placeholder="https://meet.google.com/abc-defg-hij" inputMode="url" />
          <button type="button" className="secondary" onClick={() => window.open("https://meet.new", "_blank", "noopener")}>Create a Meet link</button>
        </div>
        <p className="small">Create the meeting in Google Meet, copy its link and paste it here. Everyone involved is notified and gets a Join button.</p>

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
                  <button disabled={busy === r.id} onClick={() => book(r.id, "video")}>
                    <Icon n="video" s={16} /> {mode === "now" ? "Start video consult now" : "Schedule video consult"}
                  </button>
                  <button className="secondary" disabled={busy === r.id || mode === "now"} onClick={() => book(r.id, "physical")}>Hospital slot</button>
                  <button className="secondary" onClick={() => window.print()}>{t.printSlip}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {err && <p className="err">{err}</p>}
        {msg && <p className="warn">{msg}</p>}
      </div>
    </>
  );
}
