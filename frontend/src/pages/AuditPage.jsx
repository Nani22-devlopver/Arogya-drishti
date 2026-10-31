import { useEffect, useState, useMemo } from "react";
import { Link, NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, clearSession, currentUser, enqueue, flushQueue, getQueue, getToken, newIdempotencyKey, setSession } from "../api";
import { useI18n, ICONS, Icon, initials, tone, Pill, toUploadable, AI_LABELS, URGENCY_KIND, URGENCY_TEXT, BulletList, AiFeedback, Empty, Loading, toast, Toasts, PageHead, slotLabel, localToSlot, slotToLocalInput, defaultSlotInput, weekdayLabel, isPast, DateTimePick } from "../common";

const CATS = [
  ["all", "All"],
  ["auth", "Sign-in & registration"],
  ["access", "Record access"],
  ["clinical", "Clinical actions"],
  ["admin", "Admin"],
];

function category(ev = "") {
  if (/^(login|user\.register)/.test(ev)) return "auth";
  if (/^admin\.|^demo\.|^dashboard/.test(ev)) return "admin";
  if (/(view|read|download|open|list)/.test(ev)) return "access";
  return "clinical";
}
const CAT_KIND = { auth: "info", access: "neutral", clinical: "ok", admin: "warn" };
const fmt = (iso) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export default function AuditPage() {
  const [rows, setRows] = useState(null);
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    api("/audit").then(setRows).catch((e) => { setErr(e.message); setRows([]); });
  }, []);

  const stats = useMemo(() => {
    const r = rows || [];
    const today = new Date().toDateString();
    const counts = {};
    r.forEach((a) => { counts[a.event] = (counts[a.event] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      total: r.length,
      today: r.filter((a) => new Date(a.created_at).toDateString() === today).length,
      actors: new Set(r.map((a) => a.actor_id).filter(Boolean)).size,
      logins: r.filter((a) => a.event === "login").length,
      top,
      topMax: top[0]?.[1] || 1,
    };
  }, [rows]);

  const shown = (rows || []).filter((a) => {
    if (cat !== "all" && category(a.event) !== cat) return false;
    const hay = `${a.event} ${a.resource} ${a.actor_name || ""} ${a.actor_role || ""}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  if (rows === null) return <><PageHead title="Audit trail" sub="Every access and change is recorded." /><Loading /></>;

  return (
    <>
      <PageHead title="Audit trail" sub="Every access and change is recorded. Latest 500 events." />
      {err && <p className="err">{err}</p>}
      <div className="kpis">
        <div className="kpi"><i><Icon n="list" s={18} /></i><b>{stats.total}</b>Total events</div>
        <div className="kpi"><i><Icon n="cal" s={18} /></i><b>{stats.today}</b>Events today</div>
        <div className="kpi"><i><Icon n="users" s={18} /></i><b>{stats.actors}</b>Active users</div>
        <div className="kpi"><i><Icon n="shield" s={18} /></i><b>{stats.logins}</b>Sign-ins</div>
      </div>

      <div className="audit-grid">
        <div className="card audit-main">
          <div className="row" style={{ marginTop: 0 }}>
            <div className="searchbox">
              <Icon n="search" s={16} />
              <input placeholder="Search by user, event or resource" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search audit events" />
            </div>
          </div>
          <div className="demo-chips" style={{ marginBottom: 12 }}>
            {CATS.map(([k, l]) => (
              <button type="button" key={k} className={`chip ${cat === k ? "on" : ""}`} onClick={() => setCat(k)}>{l}</button>
            ))}
          </div>
          {shown.length === 0 ? <Empty icon="list" text="No audit events match" /> : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>When</th><th>User</th><th>Event</th><th>Resource</th></tr></thead>
                <tbody>
                  {shown.map((a) => (
                    <tr key={a.id}>
                      <td className="nowrap">{fmt(a.created_at)}</td>
                      <td>
                        {a.actor_name ? <><b>{a.actor_name}</b><div className="small">{(a.actor_role || "").replace("_", " ")}</div></> : <span className="small">system</span>}
                      </td>
                      <td><Pill kind={CAT_KIND[category(a.event)]}>{a.event}</Pill></td>
                      <td className="mono">{a.resource}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="card audit-side">
          <h3>Most frequent events</h3>
          {stats.top.length === 0 ? <p className="small">Nothing recorded yet.</p> : stats.top.map(([ev, n]) => (
            <div className="bar-row" key={ev}>
              <div className="bar-top"><span>{ev}</span><b>{n}</b></div>
              <div className="bar"><span style={{ width: `${Math.round((n / stats.topMax) * 100)}%` }} /></div>
            </div>
          ))}
        </aside>
      </div>
    </>
  );
}
