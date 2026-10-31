import { useEffect, useState, useMemo } from "react";
import { Link, NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, clearSession, currentUser, enqueue, flushQueue, getQueue, getToken, newIdempotencyKey, setSession } from "../api";
import { useI18n, ICONS, Icon, initials, tone, Pill, toUploadable, AI_LABELS, URGENCY_KIND, URGENCY_TEXT, BulletList, AiFeedback, Empty, Loading, toast, Toasts, PageHead, slotLabel, localToSlot, slotToLocalInput, defaultSlotInput, weekdayLabel, isPast, DateTimePick } from "../common";

export default function Register() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [form, setForm] = useState({
    full_name: "",
    age: 46,
    sex: "female",
    phone: "",
    village: "G. Madugula",
    habitation: "",
    gram_panchayat: "G. Madugula",
    mandal: "G. Madugula",
    phc: "PHC G. Madugula",
    tobacco_use: "",
    symptoms: "",
    medical_history: "",
  });
  const [msg, setMsg] = useState("");
  const set = (k, v) => setForm({ ...form, [k]: v });
  async function submit(e) {
    e.preventDefault();
    const key = newIdempotencyKey();
    const payload = { ...form, age: Number(form.age) || null };
    if (!navigator.onLine) {
      enqueue({ path: "/patients", method: "POST", body: payload, key });
      setMsg("Saved offline as pending. Open Offline sync when connected.");
      toast("Saved offline — sync later from Offline sync");
      return;
    }
    try {
      const p = await api("/patients", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Idempotency-Key": key },
      });
      nav(`/patients/${p.id}`);
    } catch (ex) {
      setMsg(ex.message);
    }
  }
  return (
    <>
    <PageHead title={t.register} sub="Add a new patient record. Works offline too." />
    <div className="card">
      <form onSubmit={submit}>
        <label>{t.name}</label>
        <input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} required />
        <div className="grid">
          <div>
            <label>{t.age}</label>
            <input value={form.age} onChange={(e) => set("age", e.target.value)} />
          </div>
          <div>
            <label>{t.sex}</label>
            <input value={form.sex} onChange={(e) => set("sex", e.target.value)} />
          </div>
          <div>
            <label>{t.phone}</label>
            <input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div>
            <label>{t.village}</label>
            <input value={form.village} onChange={(e) => set("village", e.target.value)} />
          </div>
          <div>
            <label>{t.habitation}</label>
            <input value={form.habitation} onChange={(e) => set("habitation", e.target.value)} />
          </div>
          <div>
            <label>{t.gram}</label>
            <input value={form.gram_panchayat} onChange={(e) => set("gram_panchayat", e.target.value)} />
          </div>
          <div>
            <label>{t.mandal}</label>
            <input value={form.mandal} onChange={(e) => set("mandal", e.target.value)} />
          </div>
          <div>
            <label>{t.phc}</label>
            <input value={form.phc} onChange={(e) => set("phc", e.target.value)} />
          </div>
        </div>
        <label>{t.tobacco}</label>
        <input value={form.tobacco_use} onChange={(e) => set("tobacco_use", e.target.value)} />
        <label>{t.symptoms}</label>
        <textarea value={form.symptoms} onChange={(e) => set("symptoms", e.target.value)} />
        <label>{t.history}</label>
        <textarea value={form.medical_history} onChange={(e) => set("medical_history", e.target.value)} />
        <button type="submit">{t.save}</button>
      </form>
      {msg && <p className="warn" style={{ marginTop: 12 }}>{msg}</p>}
    </div>
    </>
  );
}

