import { useEffect, useState, useMemo } from "react";
import { Link, NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, clearSession, currentUser, enqueue, flushQueue, getQueue, getToken, newIdempotencyKey, setSession } from "../api";
import { useI18n, ICONS, Icon, initials, tone, Pill, toUploadable, AI_LABELS, URGENCY_KIND, URGENCY_TEXT, BulletList, AiFeedback, Empty, Loading, toast, Toasts, PageHead, slotLabel, localToSlot, slotToLocalInput, defaultSlotInput, weekdayLabel, isPast, DateTimePick } from "../common";

export default function Appointments() {
  const user = currentUser();
  const canManage = user?.role !== "health_worker";
  const [rows, setRows] = useState([]);
  const [resched, setResched] = useState({});
  const [err, setErr] = useState("");
  const [links, setLinks] = useState({});
  const load = () => api("/appointments").then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function patch(id, status, slot) {
    setErr("");
    try {
      await api(`/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status, slot }) });
      toast(`Marked ${status.toLowerCase()}. Others were notified.`);
      setResched((x) => ({ ...x, [id]: undefined }));
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function saveLink(id) {
    setErr("");
    try {
      await api(`/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status: rows.find((r) => r.id === id).status, meet_url: links[id] }) });
      toast("Google Meet link saved");
      setLinks((x) => ({ ...x, [id]: "" }));
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  const upcoming = [...rows].sort((a, b) => String(a.slot).localeCompare(String(b.slot)));
  return (
    <>
      <PageHead title="Appointments" sub="Scheduled video consultations and hospital visits. Everyone involved is notified of changes." />
      {err && <p className="err">{err}</p>}
      <div className="card">
        {rows.length === 0 ? <Empty icon="cal" text="No appointments" /> : (
          <ul className="list">
            {upcoming.map((a) => (
              <li key={a.id}>
                <div className="item-top">
                  <span>
                    <b>{a.kind === "video" ? "Video consultation" : "Hospital visit"}</b> · {slotLabel(a.slot)}
                    {a.kind === "video" && <> · <span className="role-chip">Google Meet</span></>}
                  </span>
                  <span>
                    <Pill>{a.status}</Pill>
                    {a.kind === "video" && a.has_meet_link && a.status !== "CANCELLED" && (
                      <Link to={`/video/${a.id}`} style={{ marginLeft: 10 }}>Join call</Link>
                    )}
                  </span>
                </div>
                {canManage && a.kind === "video" && !a.has_meet_link && (
                  <div className="row">
                    <input placeholder="Paste the Google Meet link" value={links[a.id] || ""} onChange={(e) => setLinks({ ...links, [a.id]: e.target.value })} />
                    <button className="sm" disabled={!links[a.id]} onClick={() => saveLink(a.id)}>Save link</button>
                  </div>
                )}
                {canManage && (
                  <>
                    <div className="row">
                      {["CONFIRMED", "COMPLETED", "MISSED", "CANCELLED"].map((s) => (
                        <button key={s} className="secondary sm" onClick={() => patch(a.id, s)}>{s}</button>
                      ))}
                    </div>
                    <div className="row">
                      <DateTimePick label="Reschedule to" value={resched[a.id] ?? slotToLocalInput(a.slot)} onChange={(v) => setResched({ ...resched, [a.id]: v })} />
                      <button className="sm" disabled={!resched[a.id] || isPast(resched[a.id])} onClick={() => patch(a.id, "RESCHEDULED", localToSlot(resched[a.id]))}>Reschedule</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
