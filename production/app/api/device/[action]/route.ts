import { devicePermit } from "../../../../lib/device-permit";
import { cloudPreviewWanted, putCloudPreview, useCloudCameraPreview } from "../../../../lib/server/cloud-camera-preview";
import {pendingCard,captureCard} from '../../../../lib/server/card-enrollment';
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { adminDb } from "../../../../lib/server/supabase";
import {
  ApiError,
  body,
  checked,
  failure,
  hash,
  limit,
  ok,
  secretEqual,
} from "../../../../lib/server/http";
import { jpeg } from "../../../../lib/server/camera-jpeg";
import QRCode from "qrcode";
import {
  credentialHash,
  decideAccess,
  issueQr,
  normalizeCredential,
} from "../../../../lib/server/access";
import {
  previewWanted,
  putPreview,
} from "../../../../lib/server/camera-preview";
export const runtime = "nodejs";
const id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);
async function device(req: Request) {
  const device_id = id.parse(req.headers.get("x-device-id"));
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (token.length !== 64)
    throw new ApiError("เครื่องยังไม่ได้ยืนยันตัวตน", 401);
  const db = adminDb();
  const secret = checked(
    await db
      .from("gp_device_secrets")
      .select("token_hash")
      .eq("device_id", device_id)
      .maybeSingle(),
  );
  if (!secret?.token_hash || !secretEqual(hash(token), secret.token_hash))
    throw new ApiError("credential เครื่องไม่ถูกต้อง", 401);
  const d = checked(
    await db.from("gp_devices").select("*").eq("id", device_id).single(),
  );
  if (d.revoked) throw new ApiError("เครื่องถูกเพิกถอน", 403);
  return d;
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    const { action } = await params;
    if (action === "face") throw new ApiError("ยกเลิกการยืนยันตัวตนด้วยใบหน้าแล้ว", 410);
    const db = adminDb();
    if (action === "enroll") {
      const v = z
        .object({ device_id: id, enrollment_code: z.string().length(48) })
        .strict()
        .parse(await body(req));
      limit(`enroll:${v.device_id}`, 6);
      const token = randomBytes(32).toString("hex");
      const redeemed = checked(
        await db.rpc("gp_enroll_device", {
          p_device: v.device_id,
          p_code_hash: hash(v.enrollment_code),
          p_token_hash: hash(token),
        }),
      );
      if (!redeemed)
        throw new ApiError("รหัสลงทะเบียนไม่ถูกต้อง หมดอายุ หรือใช้แล้ว", 403);
      return ok({ device_id: v.device_id, device_token: token });
    }
    const d = await device(req);
    const cloud = useCloudCameraPreview();
    const wanted = () => cloud ? cloudPreviewWanted(d.id) : Promise.resolve(previewWanted(d.id));
    if (action === "preview") {
      limit(`preview:${d.id}`, 45);
      if (!(await wanted())) return ok({ preview_enabled: false });
      const frame = await jpeg(req);
      if (cloud) await putCloudPreview(d.id, frame);
      else putPreview(d.id, frame);
      return ok({ preview_enabled: await wanted() });
    }
    // Poll only this authenticated device's own QR session. No employee identity
    // or token is returned. Polls have a separate budget from physical taps.
    if (action === "qr-status") {
      limit(`qr-status:${d.id}`, 25);
      const v = z.object({token: z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(await body(req));
      const session = checked(await db.from("gp_qr_sessions")
        .select("request_id,expires_at,consumed_at")
        .eq("device_id", d.id).eq("token_hash", hash(v.token)).maybeSingle());
      if (!session) throw new ApiError("ไม่พบ QR ของเครื่องนี้", 404);
      if (Date.parse(session.expires_at) <= Date.now()) throw new ApiError("QR หมดอายุ", 410);
      if (!session.consumed_at) return ok({status: "pending", allowed: false, actuation_enabled: false});
      const event = checked(await db.from("gp_events")
        .select("request_id,status,created_at")
        .eq("device_id", d.id).eq("request_id", session.request_id).eq("method", "qr").maybeSingle());
      if (!event) return ok({status: "pending", allowed: false, actuation_enabled: false});
      return ok(devicePermit(event, d.firmware, process.env.GATEPASS_R1_ACTUATION_ENABLED === "true"));
    }
    limit(`device:${d.id}`, 40);
    if(action==='card-capture'){
      const v=z.object({session:z.uuid(),uid:z.string().max(80)}).strict().parse(await body(req));
      return ok(await captureCard(v.session,d.id,v.uid));
    }
    if (action === "heartbeat") {
      const v = z
        .object({
          firmware: z.string().max(60).optional(),
          rssi: z.number().int().min(-130).max(0).optional(),
          door_open: z.boolean().optional(),
          tamper: z.boolean().optional(),
          camera_ready: z.boolean().optional(),
          card_reader_ready: z.boolean().optional(),
        })
        .strict()
        .parse(await body(req));
      checked(
        await db
          .from("gp_devices")
          .update({
            ...v,
            last_seen: new Date().toISOString(),
            ...(v.door_open === undefined
              ? {}
              : {
                  door_open_since: v.door_open
                    ? d.door_open_since || new Date().toISOString()
                    : null,
                }),
            ...(v.tamper === undefined
              ? {}
              : {
                  tamper_since: v.tamper
                    ? d.tamper_since || new Date().toISOString()
                    : null,
                }),
          })
          .eq("id", d.id),
      );
      return ok({
        ok: true,
        card_enrollment: await pendingCard(d.id),
        preview_enabled: await wanted(),
        preview_interval_ms: 2000,
        face: false,
        card: true,
        nfc: true,
        qr: true,
        actuation_enabled: false,
      });
    }
    if (action === "qr-session") {
      limit("qr-device:" + d.id, 20);
      const qr = await issueQr(d.id, req);
      return ok({
        ...qr,
        ...(new URL(req.url).searchParams.get("format") === "text" ? {} : {
          image: await QRCode.toDataURL(qr.url, { width: 320, margin: 2 }),
        }),
      });
    }
    if (action === "card" || action === "nfc") {
      const requestId = z.uuid().parse(req.headers.get("x-request-id"));
      const input =
        action === "card"
          ? z
              .object({ uid: z.string().max(80) })
              .strict()
              .parse(await body(req))
          : z
              .object({ credential: z.string().length(64) })
              .strict()
              .parse(await body(req));
      const value = normalizeCredential(
        action,
        "uid" in input ? input.uid : input.credential,
      );
      const fingerprint = credentialHash(action, value);
      const credential = checked(
        await db
          .from("gp_credentials")
          .select("employee_id,revoked")
          .eq("method", action)
          .eq("credential_hash", fingerprint)
          .eq("revoked", false)
          .maybeSingle(),
      );
      const result = await decideAccess(
        d, credential && !credential.revoked ? credential.employee_id : null,
        action, requestId, fingerprint,
      );
      // Use the persisted event's time: retrying an old request cannot renew a pulse.
      const event = checked(await db.from("gp_events")
        .select("request_id,status,created_at")
        .eq("device_id", d.id).eq("request_id", requestId).eq("method", action).single());
      if (!event) throw new ApiError("ไม่พบผลตรวจสิทธิ์ที่บันทึกไว้", 409);
      return ok({...result, ...devicePermit(event, d.firmware,
        process.env.GATEPASS_R1_ACTUATION_ENABLED === "true")});
    }
    throw new ApiError("ไม่พบเส้นทาง", 404);
  } catch (e) {
    return failure(e);
  }
}
