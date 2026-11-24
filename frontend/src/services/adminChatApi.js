import { api } from "./api";

export const ADMIN_CHAT_PAGE_SIZE = 50;

export async function fetchAdminChatSessions({ cursor, signal } = {}) {
  const params = { limit: ADMIN_CHAT_PAGE_SIZE };
  if (cursor?.before && cursor?.beforeId) {
    params.before = cursor.before;
    params.beforeId = cursor.beforeId;
  }
  const response = await api.get("/admin/chat/sessions", { params, signal });
  return response.data;
}

export async function createAdminChatSession(title = null) {
  const response = await api.post(
    "/admin/chat/sessions",
    title ? { title } : {},
  );
  return response.data;
}

export async function fetchAdminChatSession(sessionId, { cursor, signal } = {}) {
  const params = { limit: ADMIN_CHAT_PAGE_SIZE };
  if (cursor?.before && cursor?.beforeId) {
    params.before = cursor.before;
    params.beforeId = cursor.beforeId;
  }
  const response = await api.get(
    `/admin/chat/sessions/${encodeURIComponent(sessionId)}`,
    { params, signal },
  );
  return response.data;
}

export async function sendAdminChatMessage({
  sessionId,
  message,
  idempotencyKey,
}) {
  const response = await api.post(
    `/admin/chat/sessions/${encodeURIComponent(sessionId)}/messages`,
    { message },
    { headers: { "Idempotency-Key": idempotencyKey } },
  );
  return response.data;
}

export function createUuid() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Secure random UUID generation is not available in this browser.");
  }

  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
