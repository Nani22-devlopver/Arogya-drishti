import { useEffect, useState, useMemo } from "react";
import { Link, NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, clearSession, currentUser, enqueue, flushQueue, getQueue, getToken, newIdempotencyKey, setSession } from "../api";
import { useI18n, ICONS, Icon, initials, tone, Pill, toUploadable, AI_LABELS, URGENCY_KIND, URGENCY_TEXT, BulletList, AiFeedback, Empty, Loading, toast, Toasts, PageHead, slotLabel, localToSlot, slotToLocalInput, defaultSlotInput, weekdayLabel, isPast, DateTimePick } from "../common";

export default function Home() {
  const user = currentUser();
  const dest = {
    health_worker: "/patients",
    medical_officer: "/reviews",
    specialist: "/referrals",
    navigator: "/navigator",
    admin: "/dashboard",
  }[user?.role];
  return <Navigate to={dest || "/login"} replace />;
}

