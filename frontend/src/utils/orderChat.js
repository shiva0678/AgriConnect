const CHAT_ELIGIBLE_ORDER_STATUSES = new Set([
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
]);

export function isOrderChatAvailable(status) {
  return typeof status === "string"
    && CHAT_ELIGIBLE_ORDER_STATUSES.has(status.toLowerCase());
}
