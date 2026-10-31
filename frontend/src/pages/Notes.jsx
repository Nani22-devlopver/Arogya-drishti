import { useEffect, useState, useMemo } from "react";
import { Link, NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, clearSession, currentUser, enqueue, flushQueue, getQueue, getToken, newIdempotencyKey, setSession } from "../api";
import { useI18n, ICONS, Icon, initials, tone, Pill, toUploadable, AI_LABELS, URGENCY_KIND, URGENCY_TEXT, BulletList, AiFeedback, Empty, Loading, toast, Toasts, PageHead, slotLabel, localToSlot, slotToLocalInput, defaultSlotInput, weekdayLabel, isPast, DateTimePick } from "../common";

const APPT = /\s*\[appt:([0-9a-f-]{36})\]/;

export default function Notes() {
  const [rows, setRows] = useState([]);
  const load = () => api("/notifications").then(setRows);
  useEffect(() => { load(); }, []);
  async function markRead(n) {
    if (n.read) return;
    await api(`/notifications/${n.id}`, { method: "PATCH" });
    window.dispatchEvent(new Event("notes-changed"));
    load();
  }
  return (
    <>
      <PageHead title="Notifications" sub="Reminders omit clinical details." />
      <div className="card">
        {rows.length === 0 ? <Empty icon="bell" text="You're all caught up" /> : (
          <ul className="list">
            {rows.map((n) => {
              const m = n.body.match(APPT);
              const isVideo = /video/i.test(n.title);
              return (
                <li key={n.id} className={n.read ? "" : "unread"} onClick={() => markRead(n)}>
                  <div className="item-top">
                    <b>{n.title}</b>
                    <span className="small">{new Date(n.created_at).toLocaleString()}</span>
                  </div>
                  <p className="small">{n.body.replace(APPT, "")}</p>
                  {m && isVideo && !/cancelled/i.test(n.title) && <Link to={`/video/${m[1]}`}><Icon n="video" s={14} /> Join video call</Link>}
                  {m && !isVideo && <Link to="/appointments">View appointment</Link>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
