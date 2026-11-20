import "server-only";
import sharp from "sharp";
import { ApiError } from "./http";
export const FACE_MODEL = "opencv-sface-2021dec";
export async function jpeg(req: Request): Promise<Buffer> {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > 2097152) throw new ApiError("ภาพต้องไม่เกิน 2 MB", 413);
  if (!req.headers.get("content-type")?.startsWith("image/jpeg"))
    throw new ApiError("ใช้ภาพ JPEG เท่านั้น", 415);
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError("ไม่พบภาพ");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2097152) {
      await reader.cancel();
      throw new ApiError("ภาพต้องไม่เกิน 2 MB", 413);
    }
    chunks.push(value);
  }
  try {
    const b = Buffer.concat(chunks);
    const meta = await sharp(b, { limitInputPixels: 12000000 }).metadata();
    if (meta.format !== "jpeg" || !meta.width || meta.width < 100)
      throw Error();
    return await sharp(b, { limitInputPixels: 12000000 })
      .rotate()
      .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch {
    throw new ApiError("ภาพ JPEG เสียหรือขนาดเล็กเกินไป");
  }
}
export async function extract(image: Buffer): Promise<number[]> {
  const res = await fetch(
    `${process.env.FACE_SERVICE_URL || "http://127.0.0.1:8001"}/extract`,
    {
      method: "POST",
      headers: {
        "content-type": "image/jpeg",
        "x-face-key": process.env.FACE_SERVICE_KEY || "",
      },
      body: new Uint8Array(image),
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    },
  );
  const data = await res.json();
  if (!res.ok)
    throw new ApiError(
      data.detail || "ประมวลผลใบหน้าไม่ได้",
      res.status === 422 ? 422 : 503,
    );
  if (
    !Array.isArray(data.embedding) ||
    data.embedding.length !== 128 ||
    !data.embedding.every(
      (x: unknown) => typeof x === "number" && Number.isFinite(x),
    )
  )
    throw new ApiError("ผลโมเดลไม่ถูกต้อง", 503);
  return data.embedding;
}
export function similarity(a: number[], b: number[]) {
  if (a.length !== 128 || b.length !== 128) return -1;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < 128; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / Math.sqrt(na * nb) || -1;
}
