import { useEffect, useState, useMemo } from "react";
import { Link, NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, clearSession, currentUser, enqueue, flushQueue, getQueue, getToken, newIdempotencyKey, setSession } from "../api";
import { useI18n, ICONS, Icon, initials, tone, Pill, toUploadable, AI_LABELS, URGENCY_KIND, URGENCY_TEXT, BulletList, AiFeedback, Empty, Loading, toast, Toasts, PageHead, slotLabel, localToSlot, slotToLocalInput, defaultSlotInput, weekdayLabel, isPast, DateTimePick } from "../common";

const ROLE_TABS = [
  ["", "All"],
  ["health_worker", "Health workers"],
  ["navigator", "Navigators"],
  ["medical_officer", "Medical officers"],
  ["specialist", "Specialists"],
];
const METRIC_LABEL = {
  patients_registered: "Patients registered",
  screenings_done: "Screenings done",
  photos_uploaded: "Photos uploaded",
  awaiting_clinician: "Awaiting clinician",
  reviews_signed: "Reviews signed",
  referrals_created: "Referrals created",
  cases_waiting_review: "Cases waiting review",
  referrals_in_system: "Referrals in system",
  appointments_completed: "Appointments completed",
  appointments_open: "Appointments open",
  investigations_reviewed: "Investigations reviewed",
  investigations_pending: "Investigations pending",
  tasks_assigned: "Tasks assigned",
  tasks_open: "Tasks open",
  tasks_closed: "Tasks closed",
  unassigned_tasks: "Unassigned tasks",
  audit_events: "Recorded actions",
};
const STATUS_KIND = { active: "ok", pending: "warn", rejected: "bad" };

export default function AdminUsers() {
  const [users, setUsers] = useState(null);
  const [role, setRole] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api("/admin/users").then(setUsers).catch((e) => { setErr(e.message); setUsers([]); });
  }, []);

  async function open(u) {
    setSel(u.id);
    setDetail(null);
    try {
      setDetail(await api(`/admin/users/${u.id}`));
    } catch (e) {
      setErr(e.message);
    }
  }

  const counts = (users || []).reduce((m, u) => ({ ...m, [u.role]: (m[u.role] || 0) + 1 }), {});
  const list = (users || []).filter((u) => (!role || u.role === role) && `${u.full_name} ${u.email}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <PageHead title="Users" sub="All health workers, navigators, medical officers and specialists. Select one to see their work status." />
      {err && <p className="err">{err}</p>}
      <div className="demo-chips" style={{ marginBottom: 12 }}>
        {ROLE_TABS.map(([k, l]) => (
          <button type="button" key={k || "all"} className={`chip ${role === k ? "on" : ""}`} onClick={() => setRole(k)}>
            {l} {users ? `(${k ? counts[k] || 0 : users.length})` : ""}
          </button>
        ))}
      </div>
      <div className="split">
        <aside className="split-list card">
          <div className="searchbox">
            <Icon n="search" s={16} />
            <input placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
          </div>
          {users === null ? <Loading /> : list.length === 0 ? <Empty icon="users" text="No users found" /> : (
            <ul className="rec-list" style={{ marginTop: 10 }}>
              {list.map((u) => (
                <li key={u.id}>
                  <button type="button" className={`rec ${sel === u.id ? "on" : ""}`} onClick={() => open(u)}>
                    <span className="avatar">{initials(u.full_name)}</span>
                    <span className="rec-body"><b>{u.full_name}</b><span>{u.role.replace("_", " ")}</span></span>
                    <Pill kind={STATUS_KIND[u.status]}>{u.status}</Pill>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <section className="split-detail">
          {!sel ? (
            <div className="card"><Empty icon="users" text="Select a user to see their details and work status" /></div>
          ) : !detail ? <Loading /> : (
            <>
              <div className="card">
                <div className="item-top">
                  <div className="item-main">
                    <span className="avatar">{initials(detail.user.full_name)}</span>
                    <div><b style={{ fontSize: "1.1rem" }}>{detail.user.full_name}</b><span>{detail.user.email}</span></div>
                  </div>
                  <Pill kind={STATUS_KIND[detail.user.status]}>{detail.user.status}</Pill>
                </div>
                <dl className="facts">
                  <dt>Designation</dt><dd style={{ textTransform: "capitalize" }}>{detail.user.role.replace("_", " ")}</dd>
                  <dt>Facility</dt><dd>{detail.user.assigned_facility}</dd>
                  <dt>Registered</dt><dd>{detail.user.created_at ? new Date(detail.user.created_at).toLocaleString() : "—"}</dd>
                  <dt>Last activity</dt><dd>{detail.work.last_activity ? new Date(detail.work.last_activity).toLocaleString() : "No activity yet"}</dd>
                </dl>
              </div>
              <div className="card">
                <h3>Work status</h3>
                <div className="kpis">
                  {Object.entries(detail.work.metrics).map(([k, v]) => (
                    <div className="kpi" key={k}><b>{v}</b>{METRIC_LABEL[k] || k.replace(/_/g, " ")}</div>
                  ))}
                </div>
              </div>
              <div className="card">
                <h3>Recent activity</h3>
                {detail.work.recent_activity.length === 0 ? <p className="small">No recorded actions yet.</p> : (
                  <ul className="timeline">
                    {detail.work.recent_activity.map((a, i) => (
                      <li key={i}><b>{a.event}</b><span>{new Date(a.created_at).toLocaleString()}</span>{a.resource}</li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
