export const ADMIN_USER_PAGE_SIZE = 25;

export function buildAdminUserListParams({
  search = "",
  role = "all",
  status = "all",
  cursor = null,
  limit = ADMIN_USER_PAGE_SIZE,
} = {}) {
  const params = { limit };
  const normalizedSearch = typeof search === "string" ? search.trim() : "";
  if (normalizedSearch) params.q = normalizedSearch;
  if (role === "farmer" || role === "buyer") params.role = role;
  if (status === "active" || status === "suspended") params.status = status;
  if (cursor?.before && cursor?.beforeId) {
    params.before = cursor.before;
    params.beforeId = cursor.beforeId;
  }
  return params;
}

export function validateSuspendReason(value) {
  if (typeof value !== "string") {
    return { valid: false, reason: "", message: "Enter a suspension reason." };
  }

  const reason = value.trim();
  const length = Array.from(reason).length;
  if (length < 3 || length > 500) {
    return {
      valid: false,
      reason,
      message: "The reason must contain 3 to 500 characters.",
    };
  }
  return { valid: true, reason, message: "" };
}

export function getAdminUserErrorMessage(error, action = "load") {
  const status = error?.response?.status;
  if (status === 400) {
    return action === "suspend"
      ? "The suspension reason or user ID is invalid. Check the form and try again."
      : "The request is invalid. Refresh the page and try again.";
  }
  if (status === 401) return "Your session has expired. Sign in again.";
  if (status === 403) return "You are not authorized to manage platform users.";
  if (status === 404) return "This user could not be found.";
  if (status === 409) {
    return action === "suspend"
      ? "This account is already suspended. Refresh to see its current status."
      : "This account is already active. Refresh to see its current status.";
  }
  if (status === 503) return "The server could not complete this request. Try again shortly.";
  if (error?.request) return "Unable to reach the server. Check your connection and try again.";
  return "Unable to load user management data. Try again.";
}

export function getAdminUserActivityLabel(type) {
  const labels = {
    crop_created: "Crop listed",
    order_placed: "Order placed",
    conversation_created: "Conversation started",
    message_sent: "Message sent",
  };
  return labels[type] || "Activity";
}
