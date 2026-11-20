import "server-only";
import { evaluateAccess } from "../access-policy.mjs";
import { randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
import { adminDb } from "./supabase";
import { ApiError, checked, hash } from "./http";
import { z } from "zod";
export function normalizeCredential(method: "card" | "nfc", value: string) {
  if (method === "card") {
    const uid = value.replace(/[ :\-]/g, "").toUpperCase();
    if (!/^(?:[0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/.test(uid))
      throw new ApiError("UID บัตรต้องเป็นเลขฐานสิบหก 4, 7 หรือ 10 ไบต์");
    return uid;
  }
  return z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(value);
}
export const credentialHash = (method: string, value: string) =>
  hash(`${method}:${value}`);
export async function issueQr(deviceId: string, req: Request) {
  const db = adminDb(),
    d = checked(
      await db
        .from("gp_devices")
        .select("id,revoked")
        .eq("id", deviceId)
        .single(),
    );
  if (!d || d.revoked)
    throw new ApiError("เครื่องถูกเพิกถอนหรือไม่พบเครื่อง", 403);
  await db
    .from("gp_qr_sessions")
    .delete()
    .lt("expires_at", new Date(Date.now() - 86400000).toISOString());
  const token = randomBytes(32).toString("hex"),
    expires_at = new Date(Date.now() + 60000).toISOString();
  checked(
    await db
      .from("gp_qr_sessions")
      .insert({ token_hash: hash(token), device_id: deviceId, expires_at }),
  );
  const url = new URL(req.url);
  if (["localhost", "127.0.0.1"].includes(url.hostname)) {
    const nets = networkInterfaces();
    const ips = [
      ...(nets.en0 || []),
      ...Object.values(nets).flatMap((x) => x || []),
    ];
    const lan = ips.find(
      (x) =>
        x.family === "IPv4" &&
        !x.internal &&
        /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(x.address),
    );
    if (lan) url.hostname = lan.address;
  }
  url.pathname = "/";
  url.search = "";
  url.searchParams.set("qr", token);
  return { url: url.toString(), expires_at, device_id: deviceId };
}
export async function decideAccess(
  d: { id: string; door_id: string; direction?: string },
  employeeId: string | null,
  method: "card" | "nfc" | "qr",
  requestId: string,
  payloadHash: string,
) {
  const db = adminDb();
  const old = checked(
    await db
      .from("gp_events")
      .select("*")
      .eq("device_id", d.id)
      .eq("request_id", requestId)
      .maybeSingle(),
  );
  if (old) {
    if (old.image_hash !== payloadHash || old.method !== method)
      throw new ApiError("request_id ซ้ำแต่ข้อมูลต่างกัน", 409);
    return response(old);
  }
  let allowed = false,
    reason = "ไม่พบข้อมูลยืนยันตัวตน";
  if (employeeId) {
    const person = checked(
      await db
        .from("gp_employees")
        .select("active")
        .eq("id", employeeId)
        .maybeSingle(),
    );
    const grant = checked(
      await db
        .from("gp_methods")
        .select("enabled")
        .eq("employee_id", employeeId)
        .eq("method", method)
        .maybeSingle(),
    );
    const permission = checked(
      await db
        .from("gp_permissions")
        .select("*")
        .eq("employee_id", employeeId)
        .eq("door_id", d.door_id)
        .maybeSingle(),
    );
    ({ allowed, reason } = evaluateAccess({
      employeeId,
      employeeActive: person?.active,
      methodEnabled: grant?.enabled,
      permission,
    }));
  }
  const values = {
    device_id: d.id,
    door_id: d.door_id,
    direction: d.direction || "unspecified",
    employee_id: employeeId,
    request_id: requestId,
    method,
    status: allowed ? "allowed" : "denied",
    reason,
    image_hash: payloadHash,
  };
  const inserted = await db
    .from("gp_events")
    .insert(values)
    .select("*")
    .single();
  if (inserted.error?.code === "23505") {
    const prior = checked(
      await db
        .from("gp_events")
        .select("*")
        .eq("device_id", d.id)
        .eq("request_id", requestId)
        .single(),
    );
    if (prior.image_hash !== payloadHash || prior.method !== method)
      throw new ApiError("request_id ซ้ำแต่ข้อมูลต่างกัน", 409);
    return response(prior);
  }
  return response(checked(inserted));
}
function response(e: {
  request_id: string;
  status: string;
  reason: string;
  employee_id: string | null;
}) {
  return {
    request_id: e.request_id,
    status: e.status,
    allowed: e.status === "allowed",
    reason: e.reason,
    employee_id: e.employee_id,
    actuation_enabled: false,
    liveness_verified: false,
  };
}
