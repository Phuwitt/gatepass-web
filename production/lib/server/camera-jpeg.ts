import "server-only";
import sharp from "sharp";
import { ApiError } from "./http";
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
