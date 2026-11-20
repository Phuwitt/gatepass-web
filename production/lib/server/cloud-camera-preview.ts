import "server-only";
import { adminDb } from "./supabase";
import { checked } from "./http";

export async function watchCloud(
  viewer: string,
  actor: string,
  device: string,
  enabled: boolean,
) {
  const db = adminDb();
  if (enabled) {
    checked(await db.from("gp_camera_viewers").upsert({
      viewer_id: viewer,
      actor_id: actor,
      device_id: device,
      expires_at: new Date(Date.now() + 20_000).toISOString(),
    }));
  } else {
    checked(await db.from("gp_camera_viewers").delete()
      .eq("viewer_id", viewer).eq("actor_id", actor).eq("device_id", device));

  }
}

export async function cloudPreviewWanted(device: string) {
  const rows = checked(await adminDb().from("gp_camera_viewers")
    .select("viewer_id").eq("device_id", device)
    .gt("expires_at", new Date().toISOString()).limit(1));
  return Boolean(rows?.length);
}

export async function putCloudPreview(device: string, bytes: Buffer) {
  if (bytes.length > 524_288 || !(await cloudPreviewWanted(device))) return;
  checked(await adminDb().from("gp_camera_frames").upsert({
    device_id: device,
    jpeg_base64: bytes.toString("base64"),
    captured_at: new Date().toISOString(),
  }));
}

export async function getCloudPreview(device: string, actor: string) {
  const db = adminDb();
  const lease = checked(await db.from("gp_camera_viewers").select("viewer_id")
    .eq("device_id", device).eq("actor_id", actor)
    .gt("expires_at", new Date().toISOString()).limit(1));
  if (!lease?.length) return undefined;

  const row = checked(await db.from("gp_camera_frames")
    .select("jpeg_base64,captured_at").eq("device_id", device)
    .gt("captured_at", new Date(Date.now() - 10_000).toISOString()).maybeSingle());
  return row ? { bytes: Buffer.from(row.jpeg_base64, "base64"), at: Date.parse(row.captured_at) } : undefined;
}

export function useCloudCameraPreview() {
  return /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(process.env.SUPABASE_URL || "");
}
