import { z } from "zod";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { adminDb } from "../../../../lib/server/supabase";
import {
  actor,
  ApiError,
  audit,
  body,
  checked,
  checkOrigin,
  failure,
  ok,
  limit,
} from "../../../../lib/server/http";
import {
  credentialHash,
  issueQr,
  normalizeCredential,
} from "../../../../lib/server/access";
import { thaiDay } from "../../../../lib/hr";
export const runtime = "nodejs";
const id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  uuid = z.uuid(),
  hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export async function GET(
  req: Request,
  { params }: { params: Promise<{ resource: string }> },
) {
  try {
    const { resource } = await params;
    if (resource === "photo") throw new ApiError("ยกเลิกการดูภาพลงทะเบียนแล้ว", 410);
    await actor();
    const db = adminDb();
    if (resource !== "workspace") throw new ApiError("ไม่พบเส้นทาง", 404);
    const month = z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .parse(
        new URL(req.url).searchParams.get("month") ||
          thaiDay(Date.now()).slice(0, 7),
      );
    const next = new Date(month + "-01T00:00:00Z");
    next.setUTCMonth(next.getUTCMonth() + 1);
    const last = next.toISOString().slice(0, 10),
      start = month + "-01";
    const [events, methods, credentials, leaves, reviews, adjustments] =
      await Promise.all([
        db
          .from("gp_events")
          .select("*", { count: "exact" })
          .gte("created_at", start + "T00:00:00+07:00")
          .lt("created_at", last + "T00:00:00+07:00")
          .order("created_at", { ascending: false })
          .order("id")
          .range(0, 999),
        db.from("gp_methods").select("*"),
        db
          .from("gp_credentials")
          .select("id,employee_id,method,label,last_four,revoked,created_at"),
        db
          .from("gp_leaves")
          .select("*")
          .lt("starts", last)
          .gte("ends", start)
          .order("created_at", { ascending: false }),
        db
          .from("gp_reviews")
          .select("source_key,event_id,decision,note,created_at")
          .order("created_at", { ascending: false })
          .limit(2000),
        db
          .from("gp_adjustments")
          .select("*")
          .gte("day", start)
          .lt("day", last)
          .order("created_at", { ascending: false }),
      ]);
    const rows = checked(events) || [];
    const total = events.count || 0;
    const pages = await Promise.all(
      Array.from(
        { length: Math.max(0, Math.ceil(Math.min(total, 10000) / 1000) - 1) },
        (_, i) =>
          db
            .from("gp_events")
            .select("*")
            .gte("created_at", start + "T00:00:00+07:00")
            .lt("created_at", last + "T00:00:00+07:00")
            .order("created_at", { ascending: false })
            .order("id")
            .range((i + 1) * 1000, (i + 2) * 1000 - 1),
      ),
    );
    for (const page of pages) rows.push(...(checked(page) || []));
    return ok({
      month,
      events: rows,
      truncated: total > 10000,
      methods: checked(methods),
      credentials: checked(credentials),
      leaves: checked(leaves),
      reviews: checked(reviews),
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
    checkOrigin(req);
    const who = await actor(),
      db = adminDb(),
      { resource } = await params,
      input = await body(req);
    if (resource === "profile") {
      const v = z
        .object({
          id,
          name: z.string().trim().min(1).max(120).optional(),
          email: z.union([z.email(), z.literal("")]).optional(),
          department: z.string().trim().max(120).optional(),
          job_title: z.string().trim().max(120).optional(),
          phone: z.string().trim().max(30),
          hired_on: z.union([z.iso.date(), z.literal("")]),
          work_start: hm,
          work_end: hm,
          grace_minutes: z.number().int().min(0).max(120),
        })
        .strict()
        .parse(input);
      if (v.work_start >= v.work_end)
        throw new ApiError(
          "เวลาเริ่มงานต้องก่อนเวลาเลิกงาน รอบนี้ยังไม่รองรับกะข้ามวัน",
        );
      const { id: employee, ...fields } = v;
      checked(
        await db
          .from("gp_employees")
          .update({ ...fields, hired_on: fields.hired_on || null })
          .eq("id", employee)
          .select("id")
          .single(),
      );
      await audit(who.id, "แก้ไขเวลางานพนักงาน", { employee });
    } else if (resource === "method") {
      const v = z
        .object({
          employee_id: id,
          method: z.enum(["card", "nfc", "qr"]),
          enabled: z.boolean(),
        })
        .strict()
        .parse(input);
      checked(await db.from("gp_methods").upsert(v));
      await audit(who.id, "เปลี่ยนวิธียืนยันตัวตน", v);
    } else if (resource === "credential") {
      const v = z
        .object({
          employee_id: id,
          method: z.enum(["card", "nfc"]),
          label: z.string().trim().min(1).max(80),
          uid: z.string().max(80).optional(),
        })
        .strict()
        .parse(input);
      const value =
        v.method === "nfc"
          ? randomBytes(32).toString("hex")
          : normalizeCredential("card", v.uid || "");
      const registration = await db
          .from("gp_credentials")
          .insert({
            employee_id: v.employee_id,
            method: v.method,
            label: v.label,
            credential_hash: credentialHash(v.method, value),
            last_four: value.slice(-4),
          });
      if (registration.error?.code === "23505") {
        throw new ApiError("บัตรนี้ยังใช้งานอยู่ กรุณาตรวจเจ้าของบัตรและเพิกถอนรายการเดิมก่อนลงทะเบียนใหม่", 409);
      }
      checked(registration);
      await audit(who.id, "ลงทะเบียนข้อมูลยืนยันตัวตน", {
        employee: v.employee_id,
        method: v.method,
      });
      return ok({
        ok: true,
        ...(v.method === "nfc" ? { nfc_credential: value } : {}),
      });
    } else if (resource === "credential-revoke") {
      const v = z.object({ id: uuid }).strict().parse(input);
      checked(
        await db
          .from("gp_credentials")
          .update({ revoked: true })
          .eq("id", v.id)
          .select("id")
          .single(),
      );
      await audit(who.id, "เพิกถอนข้อมูลยืนยันตัวตน", v);
    } else if (resource === "direction") {
      const v = z
        .object({ id, direction: z.enum(["in", "out", "unspecified"]) })
        .strict()
        .parse(input);
      checked(
        await db
          .from("gp_devices")
          .update({ direction: v.direction })
          .eq("id", v.id)
          .select("id")
          .single(),
      );
      await audit(who.id, "เปลี่ยนทิศทางเครื่อง", v);
    } else if (resource === "leave") {
      const v = z
        .object({
          employee_id: id,
          starts: z.iso.date(),
          ends: z.iso.date(),
          kind: z.enum(["sick", "personal", "annual"]),
          reason: z.string().trim().min(3).max(1000),
          status: z.enum(["pending", "approved", "rejected"]),
        })
        .strict()
        .parse(input);
      if (v.starts > v.ends)
        throw new ApiError("วันที่เริ่มต้องไม่เกินวันสิ้นสุด");
      checked(await db.from("gp_leaves").insert({ ...v, actor: who.id }));
      await audit(who.id, "บันทึกการลา", {
        employee: v.employee_id,
        status: v.status,
      });
    } else if (resource === "leave-status") {
      const v = z
        .object({ id: uuid, status: z.enum(["approved", "rejected"]) })
        .strict()
        .parse(input);
      checked(
        await db
          .from("gp_leaves")
          .update({ status: v.status, actor: who.id })
          .eq("id", v.id)
          .select("id")
          .single(),
      );
      await audit(who.id, "พิจารณาการลา", v);
    } else if (resource === "adjustment-status") {
      const v = z
        .object({ id: uuid, status: z.enum(["approved", "rejected"]) })
        .strict()
        .parse(input);
      checked(
        await db
          .from("gp_adjustments")
          .update({ status: v.status, actor: who.id })
          .eq("id", v.id)
          .select("id")
          .single(),
      );
      await audit(who.id, "พิจารณาคำขอแก้เวลา", v);
    } else if (resource === "review") {
      const v = z
        .object({
          source_key: z.string().min(1).max(300),
          event_id: uuid.nullable(),
          decision: z.enum(["reviewed", "false_alarm", "follow_up"]),
          note: z.string().trim().min(3).max(1000),
        })
        .strict()
        .parse(input);
      if (v.event_id) {
        const event = checked(
          await db
            .from("gp_events")
            .select("id,status")
            .eq("id", v.event_id)
            .single(),
        );
        if (
          !event ||
          !["denied", "error"].includes(event.status) ||
          v.source_key !== `event:${event.id}`
        )
          throw new ApiError("เลือกได้เฉพาะเหตุการณ์ที่ต้องตรวจสอบ");
      } else if (!/^(offline|held|tamper|repeat):/.test(v.source_key))
        throw new ApiError("รายการแจ้งเตือนไม่ถูกต้อง");
      checked(
        await db
          .from("gp_reviews")
          .upsert({
            ...v,
            actor: who.id,
            created_at: new Date().toISOString(),
          }),
      );
      await audit(who.id, "บันทึกผลตรวจสอบ HR", v);
    } else if (resource === "qr") {
      const v = z.object({ device_id: id }).strict().parse(input);
      limit("qr-admin:" + who.id, 20);
      const qr = await issueQr(v.device_id, req);
      return ok({
        ...qr,
        image: await QRCode.toDataURL(qr.url, {
          width: 320,
          margin: 2,
          errorCorrectionLevel: "M",
        }),
      });
    } else if (resource === "employee-account") {
      if (who.role !== "Admin")
        throw new ApiError("เฉพาะ Admin เพิ่มบัญชีพนักงาน", 403);
      const v = z
        .object({
          employee_id: id,
          email: z.email(),
          password: z.string().min(12).max(128),
        })
        .strict()
        .parse(input);
      const person = checked(
        await db
          .from("gp_employees")
          .select("id,auth_user_id")
          .eq("id", v.employee_id)
          .single(),
      );
      if (!person) throw new ApiError("ไม่พบพนักงาน", 404);
      if (person.auth_user_id) throw new ApiError("พนักงานมีบัญชีแล้ว", 409);
      const account = await db.auth.admin.createUser({
        email: v.email,
        password: v.password,
        email_confirm: true,
      });
      if (account.error)
        throw new ApiError("สร้างบัญชีไม่ได้ อีเมลอาจถูกใช้แล้ว");
      const user = account.data.user;
      if (!user) throw new ApiError("สร้างบัญชีไม่ได้");
      try {
        checked(
          await db
            .from("gp_profiles")
            .insert({ id: user.id, role: "Employee" }),
        );
        checked(
          await db
            .from("gp_employees")
            .update({ auth_user_id: user.id })
            .eq("id", v.employee_id)
            .is("auth_user_id", null)
            .select("id")
            .single(),
        );
      } catch (e) {
        await db.auth.admin.deleteUser(user.id);
        throw e;
      }
      await audit(who.id, "เพิ่มบัญชีพนักงาน", { employee: v.employee_id });
    } else throw new ApiError("ไม่พบการทำงาน", 404);
    return ok({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
