import { z } from "zod";
import { randomBytes } from "node:crypto";
import { adminDb } from "../../../../lib/server/supabase";
import {
  actor,
  ApiError,
  audit,
  body,
  checkOrigin,
  checked,
  failure,
  hash,
  ok,
} from "../../../../lib/server/http";
export const runtime = "nodejs";
const text = z.string().trim().min(1).max(120),
  id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  uuid = z.uuid();
export async function GET(
  req: Request,
  { params }: { params: Promise<{ resource: string }> },
) {
  try {
    const who = await actor();
    const { resource } = await params;
    if (resource !== "workspace") throw new ApiError("ไม่พบเส้นทาง", 404);
    const db = adminDb();
    const tables = [
      "gp_employees",
      "gp_zones",
      "gp_doors",
      "gp_devices",
      "gp_permissions",
      "gp_events",
      "gp_audit",
    ] as const;
    const results = await Promise.all(
      tables.map((t) =>
        t === "gp_events" || t === "gp_audit"
          ? db
              .from(t)
              .select("*")
              .order("created_at", { ascending: false })
              .limit(200)
          : db.from(t).select("*"),
      ),
    );
    const data = Object.fromEntries(
      tables.map((t, i) => [t.replace("gp_", ""), checked(results[i])]),
    );
    return ok({
      user: who,
      server_now: new Date().toISOString(),
      ...data,
      capabilities: { face: false, card: true, nfc: true, qr: true, actuation: false },
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
    const { resource } = await params;
    if (resource === "face" || resource === "face-revoke")
      throw new ApiError("ยกเลิกการจัดการใบหน้าแล้ว", 410);
    checkOrigin(req);
    const who = await actor(), db = adminDb();
    const input = await body(req);
    if (resource === "employees") {
      const v = z
        .object({
          id,
          name: text,
          email: z.union([z.literal(""), z.email()]).default(""),
          department: z.string().trim().max(120).default(""),
          job_title: z.string().trim().max(120).default(""),
          active: z.boolean().default(true),
          face_enabled: z.boolean().optional(),
        })
        .strict()
        .parse(input);
      checked(await db.from("gp_employees").insert({ ...v, face_enabled: false }));
      await audit(who.id, "เพิ่มพนักงาน", { employee: v.id });
    } else if (resource === "employee-status") {
      const v = z
        .object({ id, active: z.boolean(), face_enabled: z.boolean().optional() })
        .strict()
        .parse(input);
      checked(
        await db
          .from("gp_employees")
          .update({ active: v.active, face_enabled: false })
          .eq("id", v.id)
          .select("id")
          .single(),
      );
      await audit(who.id, "เปลี่ยนสิทธิ์พนักงาน", {
        employee: v.id,
        active: v.active,
        face_enabled: false,
      });
    } else if (resource === "employee-edit") {
      const v = z
        .object({
          id,
          name: text,
          email: z.union([z.literal(""), z.email()]),
          department: z.string().trim().max(120),
          job_title: z.string().trim().max(120).optional(),
        })
        .strict()
        .parse(input);
      checked(
        await db
          .from("gp_employees")
          .update({ name: v.name, email: v.email, department: v.department, ...(v.job_title===undefined?{}:{job_title:v.job_title}) })
          .eq("id", v.id)
          .select("id")
          .single(),
      );
      await audit(who.id, "แก้ไขพนักงาน", { employee: v.id });
    } else if (resource === "zones") {
      const v = z.object({ name: text }).strict().parse(input);
      checked(await db.from("gp_zones").insert(v));
      await audit(who.id, "เพิ่มโซน", v);
    } else if (resource === "doors") {
      const v = z.object({ name: text, zone_id: uuid }).strict().parse(input);
      checked(await db.from("gp_doors").insert(v));
      await audit(who.id, "เพิ่มประตู", { name: v.name });
    } else if (resource === "devices") {
      const v = z
        .object({ id, name: text, door_id: uuid })
        .strict()
        .parse(input);
      const code = randomBytes(24).toString("hex");
      checked(await db.from("gp_devices").insert(v));
      const r = await db.from("gp_device_secrets").insert({
        device_id: v.id,
        enrollment_hash: hash(code),
        enrollment_expires: new Date(Date.now() + 30 * 60000).toISOString(),
      });
      if (r.error) {
        await db.from("gp_devices").delete().eq("id", v.id);
        throw new Error("Create enrollment failed");
      }
      await audit(who.id, "เพิ่มเครื่อง", { device: v.id });
      return ok({
        ok: true,
        device_id: v.id,
        enrollment_code: code,
        expires_in_minutes: 30,
      });
    } else if (resource === "device-revoke") {
      const v = z.object({ id }).strict().parse(input);
      checked(
        await db
          .from("gp_devices")
          .update({ revoked: true })
          .eq("id", v.id)
          .select("id")
          .single(),
      );
      checked(
        await db
          .from("gp_device_secrets")
          .update({ token_hash: null, enrollment_hash: null })
          .eq("device_id", v.id),
      );
      await audit(who.id, "เพิกถอนเครื่อง", { device: v.id });
    } else if (resource === "device-code") {
      const v = z.object({ id }).strict().parse(input);
      const d = checked(
        await db.from("gp_devices").select("revoked").eq("id", v.id).single(),
      );
      if (!d || d.revoked) throw new ApiError("เครื่องถูกเพิกถอน");
      const code = randomBytes(24).toString("hex");
      checked(
        await db
          .from("gp_device_secrets")
          .update({
            token_hash: null,
            enrollment_hash: hash(code),
            enrollment_expires: new Date(Date.now() + 1800000).toISOString(),
          })
          .eq("device_id", v.id),
      );
      await audit(who.id, "ออก enrollment ใหม่และยกเลิก credential เดิม", {
        device: v.id,
      });
      return ok({
        ok: true,
        device_id: v.id,
        enrollment_code: code,
        expires_in_minutes: 30,
      });
    } else if (resource === "permissions") {
      const v = z
        .object({
          employee_id: id,
          door_id: uuid,
          starts: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          ends: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        })
        .strict()
        .parse(input);
      if (v.starts >= v.ends)
        throw new ApiError("เวลาเริ่มต้องก่อนเวลาสิ้นสุด");
      checked(await db.from("gp_permissions").upsert(v));
      await audit(who.id, "กำหนดสิทธิ์ประตู", v);
    } else if (resource === "permission-revoke") {
      const v = z
        .object({ employee_id: id, door_id: uuid })
        .strict()
        .parse(input);
      checked(await db.from("gp_permissions").delete().match(v));
      await audit(who.id, "ยกเลิกสิทธิ์ประตู", v);
    } else if (resource === "accounts") {
      if (who.role !== "Admin") throw new ApiError("เฉพาะ Admin", 403);
      const v = z
        .object({
          email: z.email(),
          password: z.string().min(12).max(128),
          role: z.enum(["Admin", "HR"]),
        })
        .strict()
        .parse(input);
      const { data, error } = await db.auth.admin.createUser({
        email: v.email,
        password: v.password,
        email_confirm: true,
      });
      if (error || !data.user) throw new ApiError("สร้างบัญชีไม่ได้");
      const saved = await db
        .from("gp_profiles")
        .insert({ id: data.user.id, role: v.role });
      if (saved.error) {
        await db.auth.admin.deleteUser(data.user.id);
        throw new Error("Save role failed");
      }
      await audit(who.id, "เพิ่มบัญชีผู้ดูแล", {
        email: v.email,
        role: v.role,
      });
    } else throw new ApiError("ไม่พบการทำงาน", 404);
    return ok({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
