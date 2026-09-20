export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const indianPhonePattern = /^(?:\+91|91)?[6-9]\d{9}$/;

export function validateEmail(value) {
  if (!value.trim()) return "Email address is required.";
  if (!emailPattern.test(value.trim())) return "Enter a valid email address.";
  return "";
}

export function validateIndianPhone(value) {
  const normalized = value.replace(/[\s-]/g, "");
  if (!normalized) return "Phone number is required.";
  if (!indianPhonePattern.test(normalized)) {
    return "Enter a valid 10-digit Indian phone number.";
  }
  return "";
}

export function validateRequired(value, label) {
  return value.trim() ? "" : `${label} is required.`;
}

export function validatePositiveNumber(value, label) {
  if (!String(value).trim()) return `${label} is required.`;
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
    return `${label} must be greater than 0.`;
  }
  return "";
}