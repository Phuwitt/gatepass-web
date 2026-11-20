import { z } from "zod";
import { adminDb } from "../../../../lib/server/supabase";
import {
  identity,
  ApiError,
  body,
  checked,
  checkOrigin,
  audit,
  failure,
  hash,
  limit,
  ok,
} from "../../../../lib/server/http";
import { decideAccess } from "../../../../lib/server/access";
export const runtime = "nodejs";
async function employee(req: Request) {
  const who = await identity(req);
  if (who.role !== "Employee" || !who.employee_id)
    throw new ApiError("เฉพาะบัญชีพนักงาน", 403);
  return who;
}
export async function GET(
  req: Request,
  { params }: { params: Promise<{ resource: string }> },
) {
  try {
    const who = await employee(req),
      { resource } = await params,
      db = adminDb();
    if (resource !== "workspace") throw new ApiError("ไม่พบเส้นทาง", 404);
    const person = checked(
      await db
        .from("gp_employees")
        .select("id,name,department,job_title,work_start,work_end")
        .eq("id", who.employee_id)
        .single(),
    );
    const [events, permissions, methods, leaves, adjustments, credentials] =
      await Promise.all([
        db
          .from("gp_events")
          .select("id,created_at,method,status,reason,direction")
          .eq("employee_id", who.employee_id)
          .order("created_at", { ascending: false })
          .limit(200),
        db
          .from("gp_permissions")
          .select("door_id,starts,ends,gp_doors(name)")
          .eq("employee_id", who.employee_id),
        db
          .from("gp_methods")
          .select("method,enabled")
          .eq("employee_id", who.employee_id),
        db
          .from("gp_leaves")
          .select("*")
          .eq("employee_id", who.employee_id)
          .order("created_at", { ascending: false })
          .limit(100),
        db
          .from("gp_adjustments")
          .select("*")
          .eq("employee_id", who.employee_id)
          .order("created_at", { ascending: false })
          .limit(100),
        db.from("gp_credentials")
          .select("id,method,label,last_four,revoked,created_at")
          .eq("employee_id", who.employee_id),
      ]);
    return ok({
      person,
      capabilities: { hce_ready: false, actuation_enabled: false },
      credentials: checked(credentials),
      events: checked(events),
      permissions: checked(permissions),
      methods: checked(methods),
      leaves: checked(leaves),
      adjustments: checked(adjustments),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ resource: string }> },
) {
  try {
    if (!req.headers.has("authorization")) checkOrigin(req);
    const who = await employee(req),
      { resource } = await params,
      db = adminDb(),
      input = await body(req);
    if (resource === "revoke-credential") {
      const v = z.object({ id: z.uuid() }).strict().parse(input);
      const own = checked(await db.from("gp_credentials").select("id,revoked").eq("id", v.id).eq("employee_id", who.employee_id).maybeSingle());
      if (!own) throw new ApiError("ไม่พบบัตรของคุณ", 404);
      checked(await db.from("gp_credentials").update({ revoked: true }).eq("id", own.id).eq("employee_id", who.employee_id));
      await audit(who.id, "พนักงานระงับบัตรของตนเอง", { credential_id: own.id });
      return ok({ ok: true });
    }
    if (resource === "leave") {
      const v = z
        .object({
          starts: z.iso.date(),
          ends: z.iso.date(),
          kind: z.enum(["sick", "personal", "annual"]),
          reason: z.string().trim().min(3).max(1000),
        })
        .strict()
        .parse(input);
      if (v.starts > v.ends) throw new ApiError("ช่วงวันที่ไม่ถูกต้อง");
      checked(
        await db
          .from("gp_leaves")
          .insert({
            ...v,
            employee_id: who.employee_id,
            status: "pending",
            actor: who.id,
          }),
      );
      return ok({ ok: true });
    }
    if (resource === "adjustment") {
      const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
      const v = z
        .object({
          day: z.iso.date(),
          requested_in: hm,
          requested_out: hm,
          reason: z.string().trim().min(3).max(1000),
        })
        .strict()
        .parse(input);
      if (v.requested_in >= v.requested_out)
        throw new ApiError("เวลาเข้าต้องก่อนเวลาออก ยังไม่รองรับกะข้ามวัน");
      checked(
        await db
          .from("gp_adjustments")
          .insert({
            ...v,
            employee_id: who.employee_id,
            status: "pending",
            actor: who.id,
          }),
      );
      return ok({ ok: true });
    }
    if (resource !== "qr") throw new ApiError("ไม่พบเส้นทาง", 404);
    limit("qr-employee:" + who.id, 12);
    const v = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict()
      .parse(input);
    const found = checked(
      await db
        .from("gp_qr_sessions")
        .select("*")
        .eq("token_hash", hash(v.token))
        .maybeSingle(),
    );
    if (!found) throw new ApiError("QR ไม่ถูกต้องหรือหมดอายุ", 410);
    const device = checked(
      await db
        .from("gp_devices")
        .select("*")
        .eq("id", found.device_id)
        .single(),
    );
    if (device.revoked) throw new ApiError("เครื่องถูกเพิกถอน", 403);
    if (found.consumed_by === who.id) {
      const previous = checked(
        await db
          .from("gp_events")
          .select("request_id")
          .eq("device_id", device.id)
          .eq("request_id", found.request_id)
          .maybeSingle(),
      );
      if (!previous) throw new ApiError("คำขอนี้กำลังประมวลผล", 409);
      return ok(
        await decideAccess(
          device,
          who.employee_id!,
          "qr",
          found.request_id,
          hash("qr:" + v.token),
        ),
      );
    }
    const consumed = checked(
      await db.rpc("gp_consume_qr", { p_hash: hash(v.token), p_user: who.id }),
    );
    if (!consumed?.length)
      throw new ApiError("QR หมดอายุหรือถูกใช้แล้ว กรุณาสแกนรหัสใหม่", 410);
    return ok(
      await decideAccess(
        device,
        who.employee_id!,
        "qr",
        consumed[0].request_id,
        hash("qr:" + v.token),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
