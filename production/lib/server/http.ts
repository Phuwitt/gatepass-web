import "server-only";
import { NextResponse } from "next/server";
import { adminDb, sessionDb, mobileAuthDb } from "./supabase";
import { createHash, timingSafeEqual } from "node:crypto";
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function hash(v: string | Buffer) {
  return createHash("sha256").update(v).digest("hex");
}
export function secretEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function checkOrigin(req: Request) {
  const origin = req.headers.get("origin"),
    url = new URL(req.url);
  let same = false;
  try {
    const parsed = new URL(origin || "");
    same =
      parsed.host === (req.headers.get("host") || url.host) &&
      parsed.protocol === url.protocol;
  } catch {}
  if (!same) throw new ApiError("คำขอต้องมาจากเว็บเดียวกัน", 403);
}
export async function identity(req?: Request) {
  const authorization = req?.headers.get("authorization");
  let token: string | undefined;
  if (authorization !== null && authorization !== undefined) {
    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match || match[1].length > 8192) throw new ApiError("กรุณาเข้าสู่ระบบใหม่", 401);
    token = match[1];
  }
  const client = token ? mobileAuthDb() : await sessionDb();
  const {
    data: { user },
    error,
  } = await client.auth.getUser(token);
  if (error || !user) throw new ApiError("กรุณาเข้าสู่ระบบ", 401);
  const { data: profile } = await adminDb()
    .from("gp_profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!profile?.active) throw new ApiError("บัญชีไม่มีสิทธิ์จัดการระบบ", 403);
  if (profile.role === "Employee") {
    const p = checked(
      await adminDb()
        .from("gp_employees")
        .select("id,active")
        .eq("auth_user_id", user.id)
        .maybeSingle(),
    );
    if (!p?.active)
      throw new ApiError("พนักงานถูกระงับหรือยังไม่ผูกบัญชี", 403);
    return {
      id: user.id,
      email: user.email,
      role: profile.role,
      employee_id: p.id,
    };
  }
  return { id: user.id, email: user.email, role: profile.role };
}
export async function actor() {
  const who = await identity();
  if (!["Admin", "HR"].includes(who.role))
    throw new ApiError("เฉพาะ Admin และ HR", 403);
  return who;
}
export async function audit(
  id: string,
  action: string,
  details: Record<string, unknown> = {},
) {
  const { error } = await adminDb()
    .from("gp_audit")
    .insert({ actor: id, action, details });
  if (error) throw new Error("บันทึกประวัติไม่สำเร็จ");
}
export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export function failure(e: unknown) {
  if (e instanceof ApiError) return ok({ error: e.message }, e.status);
  if (e && typeof e === "object" && "issues" in e)
    return ok({ error: "ข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง" }, 400);
  console.error("API error", e instanceof Error ? e.message : "unknown");
  return ok({ error: "ระบบยังไม่พร้อมหรือบันทึกไม่สำเร็จ กรุณาลองใหม่" }, 503);
}
export async function body(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError("ไม่พบข้อมูล");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16384) {
      await reader.cancel();
      throw new ApiError("ข้อมูลใหญ่เกินไป", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError("ข้อมูล JSON ไม่ถูกต้อง");
  }
}
export function checked<T>(r: { data: T; error: unknown }): T {
  if (r.error) {
    const code = (r.error as { code?: string }).code;
    if (code === "23505")
      throw new ApiError("รหัสหรือชื่อซ้ำกับข้อมูลที่มีอยู่", 409);
    if (code === "23503") throw new ApiError("ไม่พบข้อมูลที่อ้างอิง", 400);
    throw new Error("Database operation failed");
  }
  return r.data;
}
export const limits = new Map<string, { count: number; until: number }>();
export function limit(key: string, max = 12) {
  const t = Date.now();
  for (const [k, v] of limits) if (v.until < t) limits.delete(k);
  let item = limits.get(key);
  if (!item) {
    item = { count: 0, until: t + 60000 };
    limits.set(key, item);
  }
  if (++item.count > max)
    throw new ApiError("คำขอถี่เกินไป รอสักครู่แล้วลองใหม่", 429);
}
