import { useEffect, useState, useMemo } from "react";
import { Link, NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, clearSession, currentUser, enqueue, flushQueue, getQueue, getToken, newIdempotencyKey, setSession } from "../api";
import { useI18n, ICONS, Icon, initials, tone, Pill, toUploadable, AI_LABELS, URGENCY_KIND, URGENCY_TEXT, BulletList, AiFeedback, Empty, Loading, toast, Toasts, PageHead, slotLabel, localToSlot, slotToLocalInput, defaultSlotInput, weekdayLabel, isPast, DateTimePick } from "../common";

export default function Investigations() {
  const [refs, setRefs] = useState([]);
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api("/referrals").then(setRefs);
    api("/investigations").then(setRows);
  }, []);
  async function order(referral_id) {
    await api("/investigations", { method: "POST", body: JSON.stringify({ referral_id, kind: "biopsy" }) });
    setRows(await api("/investigations"));
  }
  async function advance(id, state) {
    await api(`/investigations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        state,
        report_note: state === "REPORT_RECEIVED" ? "Synthetic histopathology: dysplasia example. NOT CLINICAL." : undefined,
        clinician_result: state === "CLINICIAN_REVIEWED" ? "Clinician-entered simulated result; treatment linkage pending." : undefined,
      }),
    });
    setRows(await api("/investigations"));
  }
  return (
    <>
      <PageHead title="Investigations" sub="Order and track biopsies and reports." />
      <div className="card">
        <div className="row">
          {refs.map((r) => (
            <button key={r.id} onClick={() => order(r.id)}>
              <Icon n="flask" s={16} /> Order biopsy for {r.id.slice(0, 8)}
            </button>
          ))}
        </div>
        {rows.length === 0 ? <Empty icon="flask" text="No investigations" /> : (
          <ul className="list">
            {rows.map((i) => (
              <li key={i.id}>
                <div className="item-top">
                  <b>{i.kind}</b>
                  <Pill>{i.state}</Pill>
                </div>
                <div className="row">
                  {["SCHEDULED", "SAMPLE_COLLECTED", "REPORT_PENDING", "REPORT_RECEIVED", "CLINICIAN_REVIEWED"].map((s) => (
                    <button key={s} className="secondary sm" onClick={() => advance(i.id, s)}>
                      {s}
                    </button>
                  ))}
                </div>
                {i.report_note && <p className="small">{i.report_note}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

