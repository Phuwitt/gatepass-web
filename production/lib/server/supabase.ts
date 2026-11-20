import "server-only";
import { workspaceMode } from "../runtime-mode.mjs";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export const isPreview = () => workspaceMode() === "preview";
export const isHosted = () => workspaceMode() !== "local";

export function configured() {
  return Boolean(
    process.env.SUPABASE_URL &&
    (!isHosted() || /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(process.env.SUPABASE_URL)) &&
    process.env.SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
export function adminDb() {
  if (!configured()) throw new Error("ยังไม่ได้ตั้งค่า Supabase");
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
// A fresh anonymous Auth client per mobile request; never shares session state.
export function mobileAuthDb() {
  if (!configured()) throw new Error("ยังไม่ได้ตั้งค่า Supabase");
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
export async function sessionDb() {
  const jar = await cookies();
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.VERCEL === "1" || process.env.APP_HTTPS === "true",
        path: "/",
      },
      cookies: {
        getAll() {
          return jar.getAll();
        },
        setAll(values) {
          for (const { name, value, options } of values)
            jar.set(name, value, options);
        },
      },
    },
  );
}
