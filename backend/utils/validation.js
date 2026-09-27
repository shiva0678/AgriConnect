const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[6-9]\d{9}$/;
const VALID_ROLES = new Set(['farmer', 'buyer']);

export function validateRegistrationInput(payload) {
  const { name, email, phone, password, role } = payload ?? {};

  if (!name || !String(name).trim()) {
    return 'Name is required.';
  }

  if (!email || !String(email).trim()) {
    return 'Email is required.';
  }

  if (!phone || !String(phone).trim()) {
    return 'Phone number is required.';
  }

  if (!password || !String(password).trim()) {
    return 'Password is required.';
  }

  if (!role || !String(role).trim()) {
    return 'Role is required.';
  }

  const normalizedEmail = String(email).trim();
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return 'Valid email format is required.';
  }

  const normalizedPhone = String(phone).trim();
  if (!PHONE_REGEX.test(normalizedPhone)) {
    return 'Valid phone number is required.';
  }

  if (String(password).length < 8) {
    return 'Password must be at least 8 characters long.';
  }

  const normalizedRole = String(role).trim().toLowerCase();
  if (!VALID_ROLES.has(normalizedRole)) {
    return 'Role must be either farmer or buyer.';
  }

  return null;
}

export function validateProfileUpdateInput(payload, role) {
  const { name, email, phone, farm, company, location } = payload ?? {};

  if (!name || !String(name).trim() || String(name).trim().length > 120) {
    return 'Name is required and must be 120 characters or fewer.';
  }

  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalizedEmail) || normalizedEmail.length > 255) {
    return 'A valid email address of 255 characters or fewer is required.';
  }

  const normalizedPhone = String(phone ?? '').replace(/[\s-]/g, '');
  if (/^(?:\+91|91)?[6-9]\d{9}$/.test(normalizedPhone) === false) {
    return 'A valid 10-digit Indian phone number is required.';
  }

  const businessName = role === 'farmer' ? farm : company;
  if (!businessName || !String(businessName).trim() || String(businessName).trim().length > 160) {
    return `${role === 'farmer' ? 'Farm' : 'Company'} name is required and must be 160 characters or fewer.`;
  }

  if (!location || !String(location).trim() || String(location).trim().length > 160) {
    return 'Location is required and must be 160 characters or fewer.';
  }

  return null;
}
