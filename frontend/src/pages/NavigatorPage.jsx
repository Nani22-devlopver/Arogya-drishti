import { useEffect, useState, useMemo } from "react";
import { Link, NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, clearSession, currentUser, enqueue, flushQueue, getQueue, getToken, newIdempotencyKey, setSession } from "../api";
import { useI18n, ICONS, Icon, initials, tone, Pill, toUploadable, AI_LABELS, URGENCY_KIND, URGENCY_TEXT, BulletList, AiFeedback, Empty, Loading, toast, Toasts, PageHead, slotLabel, localToSlot, slotToLocalInput, defaultSlotInput, weekdayLabel, isPast, DateTimePick } from "../common";

export default function NavigatorPage() {
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

