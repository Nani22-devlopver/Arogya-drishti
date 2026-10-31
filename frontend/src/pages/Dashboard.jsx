import { useEffect, useState, useMemo } from "react";
import { Link, NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, clearSession, currentUser, enqueue, flushQueue, getQueue, getToken, newIdempotencyKey, setSession } from "../api";
import { useI18n, ICONS, Icon, initials, tone, Pill, toUploadable, AI_LABELS, URGENCY_KIND, URGENCY_TEXT, BulletList, AiFeedback, Empty, Loading, toast, Toasts, PageHead, slotLabel, localToSlot, slotToLocalInput, defaultSlotInput, weekdayLabel, isPast, DateTimePick } from "../common";

export default function Dashboard() {
  const [d, setD] = useState(null);
  useEffect(() => {
    api("/dashboard/summary").then(setD);
  }, []);
  if (!d) return <Loading />;
  const nums = Object.entries(d).filter(([k, v]) => k !== "note" && typeof v === "number");
  const max = Math.max(1, ...nums.map(([, v]) => v));
  return (
    <>
      <PageHead title="District dashboard" sub={d.note} />
      <div className="kpis">
        {Object.entries(d)
          .filter(([k]) => k !== "note")
          .map(([k, v]) => (
            <div className="kpi" key={k}>
              <i><Icon n="chart" s={18} /></i>
              <b>{v}</b>
              {k.replace(/_/g, " ")}
              {typeof v === "number" && <div className="bar"><span style={{ width: `${Math.round((v / max) * 100)}%` }} /></div>}
            </div>
          ))}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <button
          className="secondary"
          onClick={async () => {
            await api("/admin/reset-demo", { method: "POST" });
            setD(await api("/dashboard/summary"));
            toast("Synthetic demo data reset");
          }}
        >
          Reset synthetic demo data
        </button>
      </div>
    </>
  );
}

