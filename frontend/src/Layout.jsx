import { useEffect, useState, useMemo } from "react";
import { Link, NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, clearSession, currentUser, enqueue, flushQueue, getQueue, getToken, newIdempotencyKey, setSession } from "./api";
import { useI18n, ICONS, Icon, initials, tone, Pill, toUploadable, AI_LABELS, URGENCY_KIND, URGENCY_TEXT, BulletList, AiFeedback, Empty, Loading, toast, Toasts, PageHead, slotLabel, localToSlot, slotToLocalInput, defaultSlotInput, weekdayLabel, isPast, DateTimePick } from "./common";

export function Shell({ children }) {
  const user = currentUser();
  const { t, lang, switchLang } = useI18n();
  const nav = useNavigate();
  const [pending, setPending] = useState(0);
  useEffect(() => {
    if (user?.role !== "admin") return undefined;
    const load = () => api("/admin/users?status=pending").then((r) => setPending(r.length)).catch(() => {});
    load();
    window.addEventListener("pending-changed", load);
    const timer = setInterval(load, 30000);
    return () => { window.removeEventListener("pending-changed", load); clearInterval(timer); };
  }, [user?.role]);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!user) return undefined;
    const seen = new Set(JSON.parse(sessionStorage.getItem("seenNotes") || "null") || []);
    const first = !sessionStorage.getItem("seenNotes");
    const load = async () => {
      try {
        const rows = await api("/notifications");
        const fresh = rows.filter((n) => !n.read);
        setUnread(fresh.length);
        fresh.forEach((n) => {
          if (!seen.has(n.id) && !first) toast(`${n.title}: ${n.body.replace(/\s*\[appt:[^\]]+\]/, "")}`);
          seen.add(n.id);
        });
        sessionStorage.setItem("seenNotes", JSON.stringify([...seen]));
      } catch {
        /* offline: keep last badge */
      }
    };
    load();
    window.addEventListener("notes-changed", load);
    const timer = setInterval(load, 20000);
    return () => { window.removeEventListener("notes-changed", load); clearInterval(timer); };
  }, [user?.id]);
  const links = {
    health_worker: [
      ["/patients", t.patients, "users"],
      ["/register", t.register, "plus"],
      ["/offline", t.offline, "cloud"],
      ["/notifications", t.notifications, "bell"],
    ],
    medical_officer: [
      ["/reviews", t.reviews, "check"],
      ["/patients", t.patients, "users"],
      ["/audit", t.audit, "list"],
      ["/notifications", t.notifications, "bell"],
    ],
    specialist: [
      ["/referrals", t.referrals, "file"],
      ["/appointments", t.appointments, "cal"],
      ["/investigations", t.investigations, "flask"],
      ["/notifications", t.notifications, "bell"],
    ],
    navigator: [
      ["/navigator", t.navigator, "compass"],
      ["/referrals", t.referrals, "file"],
      ["/appointments", t.appointments, "cal"],
      ["/notifications", t.notifications, "bell"],
    ],
    admin: [
      ["/dashboard", t.dashboard, "chart"],
      ["/admin/pending", "Pending approvals", "check"],
      ["/admin/users", "Users", "users"],
      ["/audit", t.audit, "list"],
      ["/notifications", t.notifications, "bell"],
    ],
  };
  const doLogout = () => {
    clearSession();
    nav("/login");
  };
  const langSel = (
    <select value={lang} onChange={(e) => switchLang(e.target.value)} aria-label={t.language}>
      <option value="en">English</option>
      <option value="te">తెలుగు</option>
    </select>
  );
  return (
    <>
      <div className="banner">{t.warning}</div>
      <div className="layout">
        <aside className="sidebar">
          <div className="brand">
            <span className="logo"><Icon n="eye" /></span>
            {t.title}
          </div>
          <nav>
            {(links[user?.role] || []).map(([to, label, ic]) => (
              <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "active" : "")}>
                <Icon n={ic} />
                <span>{label}</span>
                {to === "/admin/pending" && pending > 0 && <em className="badge">{pending}</em>}
                {to === "/notifications" && unread > 0 && <em className="badge">{unread}</em>}
              </NavLink>
            ))}
          </nav>
          <div className="side-foot">
            {user && (
              <div className="user-box">
                <span className="avatar">{initials(user.full_name)}</span>
                <div>
                  <b>{user.full_name}</b>
                  <span>{String(user.role).replace("_", " ")}</span>
                </div>
              </div>
            )}
            {langSel}
            <button className="secondary" onClick={doLogout}>
              <Icon n="out" s={16} /> {t.logout}
            </button>
          </div>
        </aside>
        <div className="main">
          <div className="topbar">
            <strong>{t.title}</strong>
            <span className="row" style={{ margin: 0, flexWrap: "nowrap" }}>
              {langSel}
              <button className="secondary" onClick={doLogout}>{t.logout}</button>
            </span>
          </div>
          <div className="wrap">{children}</div>
        </div>
      </div>
      <Toasts />
    </>
  );
}

export function Guard({ roles, children }) {
  const user = currentUser();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Shell>{children}</Shell>;
}

