export const ORDER_STATUSES = new Set([
  'pending',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
]);

const allowedTransitions = new Map([
  ['pending', new Set(['confirmed', 'cancelled'])],
  ['confirmed', new Set(['shipped', 'cancelled'])],
  ['shipped', new Set(['delivered'])],
  ['delivered', new Set()],
  ['cancelled', new Set()],
]);

export function isOrderStatusTransitionAllowed(currentStatus, nextStatus) {
  return allowedTransitions.get(currentStatus)?.has(nextStatus) ?? false;
}
