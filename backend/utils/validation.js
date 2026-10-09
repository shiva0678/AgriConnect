const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[6-9]\d{9}$/;
const VALID_ROLES = new Set(['farmer', 'buyer']);

function parseDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export function validateCropInput(payload = {}) {
  const name = String(payload.name ?? '').trim();
  const category = String(payload.category ?? '').trim();
  const unit = String(payload.unit ?? '').trim();
  const location = String(payload.location ?? '').trim();
  const price = Number(payload.price);
  const quantity = Number(payload.quantity);

  if (!name || name.length > 120) {
    return 'Crop name is required and must be 120 characters or fewer.';
  }

  if (!category || category.length > 40) {
    return 'Crop category is required and must be 40 characters or fewer.';
  }

  if (payload.price === undefined || payload.price === null || Number.isNaN(price)) {
    return 'Crop price is required.';
  }

  if (price < 0) {
    return 'Crop price must be non-negative.';
  }

  if (!unit || unit.length > 20) {
    return 'Crop unit is required and must be 20 characters or fewer.';
  }

  if (payload.quantity === undefined || payload.quantity === null || Number.isNaN(quantity)) {
    return 'Crop quantity is required.';
  }

  if (quantity < 0) {
    return 'Crop quantity must be non-negative.';
  }

  if (!location || location.length > 160) {
    return 'Crop location is required and must be 160 characters or fewer.';
  }

  if (!payload.harvest_date) {
    return 'Harvest date is required.';
  }

  const harvestDate = parseDateOnly(payload.harvest_date);
  if (!harvestDate) {
    return 'Harvest date must be a valid YYYY-MM-DD date.';
  }

  if (payload.expiry_date) {
    const expiryDate = parseDateOnly(payload.expiry_date);
    if (!expiryDate) {
      return 'Expiry date must be a valid YYYY-MM-DD date.';
    }

    if (expiryDate < harvestDate) {
      return 'Expiry date cannot be earlier than harvest date.';
    }
  }

  return null;
}

export function validateCropUpdateInput(payload = {}) {
  if (!payload || Object.keys(payload).length === 0) {
    return 'At least one crop field is required for update.';
  }

  return validateCropInput(payload);
}

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
