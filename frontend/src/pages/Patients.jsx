import { useEffect, useState, useMemo } from "react";
import { Link, NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, clearSession, currentUser, enqueue, flushQueue, getQueue, getToken, newIdempotencyKey, setSession } from "../api";
import { useI18n, ICONS, Icon, initials, tone, Pill, toUploadable, AI_LABELS, URGENCY_KIND, URGENCY_TEXT, BulletList, AiFeedback, Empty, Loading, toast, Toasts, PageHead, slotLabel, localToSlot, slotToLocalInput, defaultSlotInput, weekdayLabel, isPast, DateTimePick } from "../common";

export default function Patients() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  async function load() {
    try {
      setRows(await api(`/patients${q ? `?q=${encodeURIComponent(q)}` : ""}`));
    } catch (ex) {
      setErr(ex.message);
      setRows([]);
    }
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <PageHead title={t.patients} sub={rows ? `${rows.length} records` : ""}>
        {currentUser()?.role === "health_worker" && (
          <Link to="/register"><button><Icon n="plus" s={16} /> {t.register}</button></Link>
        )}
      </PageHead>
      <div className="card">
        <form className="row" onSubmit={(e) => { e.preventDefault(); load(); }}>
          <div className="searchbox">
            <Icon n="search" s={18} />
            <input placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button type="submit">{t.search}</button>
        </form>
        {err && <p className="err">{err}</p>}
        {!rows ? (
          <><div className="skeleton" /><div className="skeleton" /></>
        ) : rows.length === 0 ? (
          <Empty icon="users" text="No patients found" />
        ) : (
          <ul className="list">
            {rows.map((p) => (
              <li key={p.id}>
                <Link to={`/patients/${p.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                  <div className="item-top">
                    <div className="item-main">
                      <span className="avatar">{initials(p.full_name)}</span>
                      <div>
                        <b>{p.full_name}</b>
                        <span>{p.village || ""} {p.phone ? `· ${p.phone}` : ""}</span>
                      </div>
                    </div>
                    <span style={{ color: "var(--teal)" }}>View →</span>
                  </div>
                </Link>
                {p.duplicate_hint && <div className="warn" style={{ marginTop: 8 }}>{p.duplicate_hint}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

