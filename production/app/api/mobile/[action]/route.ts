import { z } from "zod";
import { adminDb, mobileAuthDb } from "../../../../lib/server/supabase";
import { ApiError, body, failure, identity, limit, ok } from "../../../../lib/server/http";
export const runtime = "nodejs";
// Native bearer-only endpoints. No cookie session and no permissive CORS.
export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await params;
    if (!["login", "refresh", "logout"].includes(action)) throw new ApiError("ไม่พบเส้นทาง", 404);
    const client = mobileAuthDb();
    if (action === "logout") {
      if (!/^Bearer [^\s]+$/i.test(req.headers.get("authorization") || "")) throw new ApiError("กรุณาเข้าสู่ระบบ", 401);
      await identity(req);
      const token = req.headers.get("authorization")!.slice(7);
      const { error } = await adminDb().auth.admin.signOut(token, "local");
      if (error) throw new ApiError("ออกจากระบบไม่สำเร็จ", 503);
      return ok({ ok: true });
    }
    const input = await body(req);
    let result;
    if (action === "login") {
      const value = z.object({ email: z.email(), password: z.string().min(1).max(128) }).strict().parse(input);
      limit("mobile-login:" + value.email.toLowerCase(), 8);
      result = await client.auth.signInWithPassword(value);
    } else {
      const value = z.object({ refresh_token: z.string().min(1).max(8192) }).strict().parse(input);
      result = await client.auth.refreshSession(value);
    }
    if (result.error || !result.data.session) throw new ApiError("บัญชีหรือ session ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่", 401);
    const session = result.data.session;
    let who;
    try {
      who = await identity(new Request(req.url, { headers: { authorization: "Bearer " + session.access_token } }));
      if (who.role !== "Employee") throw new ApiError("แอปนี้สำหรับบัญชีพนักงาน ใช้เว็บสำหรับ Admin/HR", 403);
    } catch (error) {
      await client.auth.signOut({ scope: "local" });
      throw error;
    }
    return ok({ access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at, user: who });
  } catch (error) { return failure(error); }
}
