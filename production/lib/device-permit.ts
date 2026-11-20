// Shared contract for authenticated R1 devices, never a substitute for access policy.
export type RecordedDecision = {
  request_id: string;
  status: string;
  created_at: string;
};
export function devicePermit(
  event: RecordedDecision,
  firmware: string | null | undefined,
  enabled: boolean,
  now = Date.now(),
) {
  const created = Date.parse(event.created_at);
  const fresh = Number.isFinite(created) && created <= now && now - created < 10000;
  const allowed = event.status === "allowed";
  const actuate = enabled && firmware === "gatepass-r1-1.0.0" && allowed && fresh;
  return {
    request_id: event.request_id,
    status: event.status,
    allowed,
    actuation_enabled: actuate,
    unlock_ms: actuate ? 3000 : 0,
    decision_expires_at: Number.isFinite(created)
      ? new Date(created + 10000).toISOString()
      : null,
  };
}
