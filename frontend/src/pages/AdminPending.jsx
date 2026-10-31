import { useEffect, useState, useMemo } from "react";
import { Link, NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, clearSession, currentUser, enqueue, flushQueue, getQueue, getToken, newIdempotencyKey, setSession } from "../api";
import { useI18n, ICONS, Icon, initials, tone, Pill, toUploadable, AI_LABELS, URGENCY_KIND, URGENCY_TEXT, BulletList, AiFeedback, Empty, Loading, toast, Toasts, PageHead, slotLabel, localToSlot, slotToLocalInput, defaultSlotInput, weekdayLabel, isPast, DateTimePick } from "../common";

export default function AdminPending() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load() {
    try {
      setRows(await api("/admin/users?status=pending"));
    } catch (e) {
      setErr(e.message);
      setRows([]);
    }
  }
  useEffect(() => { load(); }, []);

  async function decide(u, action) {
    setBusyId(u.id);
    setErr("");
    try {
      await api(`/admin/users/${u.id}/${action}`, { method: "POST" });
      toast(`${u.full_name} ${action === "approve" ? "approved" : "declined"}`);
      window.dispatchEvent(new Event("pending-changed"));
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <>
      <PageHead title="Pending approvals" sub="New registrations can sign in only after you approve them." />
      {err && <p className="err">{err}</p>}
      <div className="card">
        {rows === null ? <Loading /> : rows.length === 0 ? <Empty icon="check" text="No registrations waiting" /> : (
          <ul className="list">
            {rows.map((u) => (
              <li key={u.id}>
                <div className="item-top">
                  <div className="item-main">
                    <span className="avatar">{initials(u.full_name)}</span>
                    <div>
                      <b>{u.full_name}</b>
                      <span>{u.email} · {u.assigned_facility}</span>
                    </div>
                  </div>
                  <span className="role-chip">{u.role.replace("_", " ")}</span>
                  <div className="row" style={{ margin: 0 }}>
                    <button className="sm" disabled={busyId === u.id} onClick={() => decide(u, "approve")}>Approve</button>
                    <button className="sm secondary" disabled={busyId === u.id} onClick={() => decide(u, "reject")}>Decline</button>
                  </div>
                </div>
                <div className="small" style={{ marginTop: 6 }}>Applied {u.created_at ? new Date(u.created_at).toLocaleString() : ""}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
