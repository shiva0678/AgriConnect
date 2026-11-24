export const ENTITY_OPTIONS = [
  { value: "users", label: "Users" },
  { value: "crops", label: "Crops" },
  { value: "orders", label: "Orders" },
];

export const USER_ROLE_OPTIONS = ["farmer", "buyer"];
export const USER_STATUS_OPTIONS = ["active", "suspended"];
export const CROP_STATUS_OPTIONS = ["available", "sold_out", "inactive"];
export const CROP_CATEGORY_OPTIONS = ["Vegetables", "Fruits", "Grains", "Spices"];
export const ORDER_STATUS_OPTIONS = [
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
];

export const DATE_RANGE_OPTIONS = [
  { value: "", label: "Any date" },
  { value: "today", label: "Today" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "custom", label: "Custom range" },
];

const SQL_STATEMENT_PATTERN = /[;]|--|\/\*|\*\/|\b(?:select\s+.+\s+from|insert\s+into|update\s+\w+\s+set|delete\s+from|drop\s+(?:table|database)|truncate\s+table|alter\s+table|create\s+table|union\s+select|execute\s+)/i;

function hasControlCharacters(value) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

export function createDefaultManualFilters() {
  return {
    entity: "users",
    metric: "count",
    role: "",
    userStatus: "",
    cropStatus: "",
    category: "",
    orderStatus: "",
    dateRange: "",
    customFrom: "",
    customTo: "",
    state: "",
    district: "",
    comparison: "",
    previousFrom: "",
    previousTo: "",
    currentFrom: "",
    currentTo: "",
  };
}

function rangeError(from, to, label) {
  if (!from || !to) {
    return `Choose both dates for the ${label}.`;
  }
  if (from > to) {
    return `The ${label} start date must be on or before its end date.`;
  }
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  if ((toYear - fromYear) * 12 + toMonth - fromMonth + 1 > 36) {
    return `Keep the ${label} within 36 months.`;
  }
  return null;
}

function readableValue(value) {
  return value.replaceAll("_", " ");
}

function locationPhrase(filters) {
  const state = filters.state.trim();
  const district = filters.district.trim();
  const terms = [];
  if (state) terms.push(`state ${state}`);
  if (district) terms.push(`district ${district}`);
  return terms.length ? `in ${terms.join(", ")}` : "";
}

function entityDescription(filters) {
  if (filters.entity === "users") {
    const role = filters.role ? `${readableValue(filters.role)} ` : "";
    return `${role}user registrations`;
  }
  if (filters.entity === "crops") {
    return "crop listings";
  }
  return "orders";
}

function filterDescriptions(filters) {
  const descriptions = [];
  if (filters.entity === "users") {
    if (filters.role) descriptions.push(`role ${readableValue(filters.role)}`);
    if (filters.userStatus) descriptions.push(`status ${readableValue(filters.userStatus)}`);
  }
  if (filters.entity === "crops") {
    if (filters.cropStatus) descriptions.push(`status ${readableValue(filters.cropStatus)}`);
    if (filters.category) descriptions.push(`category ${filters.category}`);
  }
  if (filters.entity === "orders" && filters.metric !== "gross_value" && filters.orderStatus) {
    descriptions.push(`status ${readableValue(filters.orderStatus)}`);
  }
  return descriptions;
}

function dateLabel(filters) {
  if (filters.dateRange === "custom") {
    return `from ${filters.customFrom} through ${filters.customTo}`;
  }
  const labels = {
    today: "today",
    last_7_days: "in the last 7 days",
    last_30_days: "in the last 30 days",
    this_month: "this month",
    last_month: "last month",
  };
  return labels[filters.dateRange] || "";
}

export function buildManualAdminChatPrompt(filters) {
  if (!ENTITY_OPTIONS.some((option) => option.value === filters.entity)) {
    return { error: "Choose a supported entity." };
  }
  if (
    !DATE_RANGE_OPTIONS.some((option) => option.value === filters.dateRange)
    || (filters.entity !== "orders" && filters.metric !== "count")
  ) {
    return { error: "Choose compatible supported analytics filters." };
  }
  if (filters.entity === "users") {
    if (filters.role && !USER_ROLE_OPTIONS.includes(filters.role)) {
      return { error: "Choose a supported user role." };
    }
    if (filters.userStatus && !USER_STATUS_OPTIONS.includes(filters.userStatus)) {
      return { error: "Choose a supported user status." };
    }
  }
  if (filters.entity === "crops") {
    if (filters.cropStatus && !CROP_STATUS_OPTIONS.includes(filters.cropStatus)) {
      return { error: "Choose a supported crop status." };
    }
    if (filters.category && !CROP_CATEGORY_OPTIONS.includes(filters.category)) {
      return { error: "Choose a supported crop category." };
    }
  }
  if (filters.entity === "orders" && filters.metric !== "count" && filters.metric !== "gross_value") {
    return { error: "Choose a supported order measure." };
  }
  if (filters.entity === "orders" && filters.orderStatus && !ORDER_STATUS_OPTIONS.includes(filters.orderStatus)) {
    return { error: "Choose a supported order status." };
  }
  for (const term of [filters.state, filters.district]) {
    if (
      typeof term !== "string"
      || (term.trim() && (
        term.trim().length > 80
        || hasControlCharacters(term)
        || SQL_STATEMENT_PATTERN.test(term)
      ))
    ) {
      return { error: "Enter a safe location term of at most 80 characters." };
    }
  }

  if (filters.comparison === "custom") {
    const previousError = rangeError(filters.previousFrom, filters.previousTo, "earlier period");
    const currentError = rangeError(filters.currentFrom, filters.currentTo, "later period");
    if (previousError || currentError) {
      return { error: previousError || currentError };
    }
    if (filters.previousTo >= filters.currentFrom) {
      return { error: "Comparison periods must not overlap; the earlier period must end before the later period starts." };
    }
  } else if (filters.dateRange === "custom") {
    const error = rangeError(filters.customFrom, filters.customTo, "date range");
    if (error) return { error };
  }
  if (filters.comparison && filters.comparison !== "month" && filters.comparison !== "custom") {
    return { error: "Choose a supported comparison period." };
  }

  const descriptions = filterDescriptions(filters);
  const location = locationPhrase(filters);
  const filterPhrase = `${descriptions.length ? ` with ${descriptions.join(", ")}` : ""}${location ? ` ${location}` : ""}`;
  let question;
  let periodSummary = "";

  if (filters.comparison) {
    const subject = filters.metric === "gross_value"
      ? "gross delivered order value for delivered orders"
      : entityDescription(filters);
    if (filters.comparison === "month") {
      question = `Compare ${subject}${filterPhrase} for this month versus last month.`;
      periodSummary = "this month vs last month";
    } else {
      question = `Compare ${subject}${filterPhrase} for the earlier period from ${filters.previousFrom} through ${filters.previousTo} versus the later period from ${filters.currentFrom} through ${filters.currentTo}.`;
      periodSummary = `${filters.previousFrom}–${filters.previousTo} vs ${filters.currentFrom}–${filters.currentTo}`;
    }
  } else if (filters.metric === "gross_value") {
    const period = dateLabel(filters);
    question = `What was the gross delivered order value${period ? ` ${period}` : ""}${filterPhrase}?`;
    periodSummary = period;
  } else {
    const subject = entityDescription(filters);
    const period = dateLabel(filters);
    question = `How many ${subject}${filterPhrase}${period ? ` ${period}` : ""}?`;
    periodSummary = period;
  }

  if (filters.dateRange === "custom" && !filters.comparison) {
    periodSummary = `${filters.customFrom}–${filters.customTo}`;
  }
  if (question.length > 1200) {
    return { error: "The generated question is too long. Shorten the location terms and try again." };
  }

  const summaryParts = [filters.metric === "gross_value" ? "Gross delivered order value" : filters.entity];
  if (descriptions.length) summaryParts.push(...descriptions);
  if (location) summaryParts.push(location);
  if (periodSummary) summaryParts.push(periodSummary);
  return { question, summary: summaryParts.join(" · ") };
}
