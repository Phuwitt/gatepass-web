import { workspaceMode } from "../../../../lib/runtime-mode.mjs";
import { adminDb, configured } from "../../../../lib/server/supabase";
export const dynamic = "force-dynamic";
export async function GET() {
  let database = false;
  if (configured()) {
    try {
      const r = await adminDb().from("gp_setup").select("id").limit(1);
      database = !r.error;
    } catch {}
  }
  return Response.json(
    {
      service: "gatepass-api",
      version: "1.0.0",
      mode: workspaceMode(),
      database,
      database_target: (process.env.SUPABASE_URL||"").includes(".supabase.co") ? "cloud" : "local",
      card_enrollment: true,
      face_service: false,
      card: true,
      nfc: true,
      qr: true,
      actuation_enabled: false,
      liveness_verified: false,
    },
    {
      status: database ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
