import { z } from "zod";
import { randomBytes } from "node:crypto";
import {
  adminDb,
  configured,
  sessionDb,
} from "../../../../lib/server/supabase";
import {
  identity,
  ApiError,
  checkOrigin,
  checked,
  failure,
  limit,
  ok,
  secretEqual,
  body,
} from "../../../../lib/server/http";
export const runtime = "nodejs";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    const { action } = await params;
    if (action !== "status") throw new ApiError("ไม่พบเส้นทาง", 404);
    if (!configured())
      return ok({ configured: false, needsSetup: false, user: null });
    const db = adminDb();
    const { data, error } = await db
      .from("gp_setup")
      .select("claimed")
      .eq("id", true)
      .single();
    if (error)
      return ok({
        configured: true,
        databaseReady: false,
        user: null,
        error: "ฐานข้อมูลยังไม่พร้อม",
      });
    let user = null;
    try {
      user = await identity();
    } catch {}
    return ok({
      configured: true,
      databaseReady: true,
      needsSetup: !data.claimed,
      user,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    checkOrigin(req);
    const { action } = await params;
    if (!configured()) throw new ApiError("ยังไม่ได้ตั้งค่า Supabase", 503);
    const client = await sessionDb();
    if (action === "logout") {
      await client.auth.signOut();
      return ok({ ok: true });
    }
    const input = z
      .object({
        email: z.email(),
        password: z.string().min(12).max(128),
        setupToken: z.string().optional(),
      })
      .parse(await body(req));
    limit(`auth:${input.email.toLowerCase()}`);
    if (action === "login") {
      const { error } = await client.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      if (error) throw new ApiError("อีเมลหรือรหัสผ่านไม่ถูกต้อง", 401);
      try {
        return ok({ user: await identity() });
      } catch (e) {
        await client.auth.signOut();
        throw e;
      }
    }
    if (action !== "setup") throw new ApiError("ไม่พบเส้นทาง", 404);
    const token = process.env.BOOTSTRAP_TOKEN || "";
    if (token.length < 32 || !secretEqual(input.setupToken || "", token))
      throw new ApiError("รหัสเริ่มต้นไม่ถูกต้อง", 403);
    const db = adminDb();
    const claimed = checked(await db.rpc("gp_claim_setup"));
    if (!claimed)
      throw new ApiError("สร้าง Admin คนแรกแล้ว กรุณาเข้าสู่ระบบ", 409);
    let uid: string | undefined;
    try {
      const { data, error } = await db.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
      });
      if (error || !data.user)
        throw new ApiError("สร้างบัญชีไม่ได้ ตรวจอีเมลและรหัสผ่าน");
      uid = data.user.id;
      checked(await db.from("gp_profiles").insert({ id: uid, role: "Admin" }));
      checked(
        await db
          .from("gp_audit")
          .insert({ actor: uid, action: "สร้าง Admin คนแรก" }),
      );
    } catch (e) {
      if (uid) await db.auth.admin.deleteUser(uid);
      await db.from("gp_setup").update({ claimed: false }).eq("id", true);
      throw e;
    }
    return ok({
      ok: true,
      message: "สร้าง Admin แล้ว เข้าสู่ระบบด้วยบัญชีของคุณ",
    });
  } catch (e) {
    return failure(e);
  }
}
