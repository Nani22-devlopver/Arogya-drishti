const API = "/api";

export function getToken() {
  return localStorage.getItem("token") || "";
}

export function setSession(token, user) {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

export function currentUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text };
  }
  if (!res.ok) {
    const detail = data?.detail;
    const message = typeof detail === "string" ? detail : detail?.message || data?.message || res.statusText;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function newIdempotencyKey() {
  return crypto.randomUUID();
}

const QUEUE_KEY = "offlineQueue";

export function enqueue(item) {
  const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  q.push({ ...item, queuedAt: Date.now(), status: "pending" });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export function getQueue() {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
}

export function saveQueue(q) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export async function flushQueue() {
  const q = getQueue();
  const next = [];
  for (const item of q) {
    if (item.status === "confirmed") {
      next.push(item);
      continue;
    }
    try {
      await api(item.path, {
        method: item.method,
        body: JSON.stringify(item.body),
        headers: { "Idempotency-Key": item.key },
      });
      next.push({ ...item, status: "confirmed" });
    } catch {
      next.push({ ...item, status: "failed" });
    }
  }
  saveQueue(next);
  return next;
}
