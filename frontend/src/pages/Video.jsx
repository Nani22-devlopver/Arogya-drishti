import { useEffect, useState, useMemo } from "react";
import { Link, NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, clearSession, currentUser, enqueue, flushQueue, getQueue, getToken, newIdempotencyKey, setSession } from "../api";
import { useI18n, ICONS, Icon, initials, tone, Pill, toUploadable, AI_LABELS, URGENCY_KIND, URGENCY_TEXT, BulletList, AiFeedback, Empty, Loading, toast, Toasts, PageHead, slotLabel, localToSlot, slotToLocalInput, defaultSlotInput, weekdayLabel, isPast, DateTimePick } from "../common";

export default function Video() {
  const { id } = useParams();
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api(`/appointments/${id}/video`)
      .then(setInfo)
      .catch((e) => setErr(e.message));
  }, [id]);
  if (err) return <div className="card err">{err}</div>;
  if (!info) return <Loading />;
  return (
    <div className="card">
      <h2>Teleconsultation · Google Meet</h2>
      <p className="warn">{info.warning} Recording is off by default.</p>
      <p className="small">Google Meet opens in a new tab. Allow camera and microphone when asked.</p>
      <div className="row">
        <a href={info.url} target="_blank" rel="noopener noreferrer"><button type="button"><Icon n="video" s={16} /> Open Google Meet</button></a>
        <button type="button" className="secondary" onClick={() => navigator.clipboard?.writeText(info.url).then(() => toast("Link copied"))}>Copy link</button>
      </div>
      <p className="small mono">{info.url}</p>
    </div>
  );
}
