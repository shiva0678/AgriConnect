import { api } from "./api";

export async function fetchConversations({ page = 1, limit = 50, signal } = {}) {
  const response = await api.get("/conversations", {
    params: { page, limit },
    signal,
  });
  return response.data;
}

export async function fetchConversationByOrder(orderId, { signal } = {}) {
  const response = await api.get(
    `/orders/${encodeURIComponent(orderId)}/conversation`,
    { signal },
  );
  return response.data;
}

export async function fetchConversationMessages(
  conversationId,
  { limit = 30, before, beforeId, signal } = {},
) {
  const params = { limit };
  if (before && beforeId) {
    params.before = before;
    params.before_id = beforeId;
  }
  const response = await api.get(
    `/conversations/${encodeURIComponent(conversationId)}/messages`,
    { params, signal },
  );
  return response.data;
}

export async function sendConversationMessage({
  conversationId,
  content,
  clientMessageId,
}) {
  const response = await api.post(
    `/conversations/${encodeURIComponent(conversationId)}/messages`,
    { content, client_message_id: clientMessageId },
  );
  return response.data.message;
}

export async function markConversationRead(conversationId) {
  const response = await api.patch(
    `/conversations/${encodeURIComponent(conversationId)}/read`,
  );
  return response.data.read_state;
}

export async function fetchUnreadCount({ signal } = {}) {
  const response = await api.get("/conversations/unread-count", { signal });
  return response.data;
}
