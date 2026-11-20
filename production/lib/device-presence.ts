// Heartbeat is evidence of recent contact, not proof of camera health or power state.
export function devicePresence(
  last: string | null,
  revoked = false,
  now = Date.now(),
) {
  if (revoked) return "Revoked";
  if (!last) return "Pending";
  const age = now - Date.parse(last);
  if (!Number.isFinite(age) || age < -5000) return "Unknown";
  if (age < 25000) return "Online";
  if (age < 45000) return "Stale";
  return "Offline";
}
