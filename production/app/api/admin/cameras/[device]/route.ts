import { getCloudPreview, watchCloud, useCloudCameraPreview } from "../../../../../lib/server/cloud-camera-preview";
import { z } from "zod";
import {
  actor,
  ApiError,
  body,
  checkOrigin,
  checked,
  failure,
  ok,
} from "../../../../../lib/server/http";
import { adminDb } from "../../../../../lib/server/supabase";
import { getPreview, watch } from "../../../../../lib/server/camera-preview";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function camera(params: Promise<{ device: string }>) {
  const viewer = await actor();
  const id = z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,40}$/)
    .parse((await params).device);
  const d = checked(
    await adminDb()
      .from("gp_devices")
      .select("id,revoked")
      .eq("id", id)
      .maybeSingle(),
  );
  if (!d || d.revoked)
    throw new ApiError("ไม่พบเครื่อง หรือเครื่องถูกเพิกถอน", 404);
  return { id, actorId: viewer.id };
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ device: string }> },
) {
  try {
    checkOrigin(req);
    const { id, actorId } = await camera(params);
    const v = z
      .object({ viewer_id: z.uuid(), watch: z.boolean() })
      .strict()
      .parse(await body(req));
    if (useCloudCameraPreview()) await watchCloud(v.viewer_id, actorId, id, v.watch);
    else watch(v.viewer_id, id, v.watch);
    return ok({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ device: string }> },
) {
  try {
    const { id, actorId } = await camera(params);
    const frame = useCloudCameraPreview() ? await getCloudPreview(id, actorId) : getPreview(id);
    const headers = {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    };
    if (!frame) return new Response(null, { status: 204, headers });
    return new Response(new Uint8Array(frame.bytes), {
      headers: {
        ...headers,
        "Content-Type": "image/jpeg",
        "X-Frame-Time": new Date(frame.at).toISOString(),
      },
    });
  } catch (e) {
    return failure(e);
  }
}
