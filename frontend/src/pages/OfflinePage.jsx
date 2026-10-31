import { useEffect, useState, useMemo } from "react";
import { Link, NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, clearSession, currentUser, enqueue, flushQueue, getQueue, getToken, newIdempotencyKey, setSession } from "../api";
import { useI18n, ICONS, Icon, initials, tone, Pill, toUploadable, AI_LABELS, URGENCY_KIND, URGENCY_TEXT, BulletList, AiFeedback, Empty, Loading, toast, Toasts, PageHead, slotLabel, localToSlot, slotToLocalInput, defaultSlotInput, weekdayLabel, isPast, DateTimePick } from "../common";

export default function OfflinePage() {
  const [q, setQ] = useState(getQueue());
  return (
    <>
      <PageHead title="Offline sync" sub="Airplane-mode test: save a patient or screening, reopen, then sync once." />
      <div className="card">
        <button
          onClick={async () => {
            setQ(await flushQueue());
            toast("Sync finished");
          }}
        >
          <Icon n="cloud" s={16} /> Sync now
        </button>
        {q.length === 0 ? <Empty icon="cloud" text="Nothing waiting to sync" /> : (
          <ul className="list" style={{ marginTop: 14 }}>
            {q.map((i) => (
              <li key={i.key}>
                <div className="item-top">
                  <span>{i.path}</span>
                  <Pill>{i.status}</Pill>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

