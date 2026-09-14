import type { Task } from "./types";

import { taskImages } from "./images-model";
export { taskImages } from "./images-model";
export const cardSize = (task: Task) => ({
  width: task.expanded ? 340 : 260,
  height: task.expanded ? 560 : 140,
});

export async function compressImage(file: File): Promise<string> {
  if (
    !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)
  )
    throw new Error("支持 PNG、JPG、WebP 和 GIF 图片");
  if (file.size > 12 * 1024 * 1024) throw new Error("单张原图不能超过 12 MB");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器无法处理图片");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let result = canvas.toDataURL("image/webp", 0.82);
    if (result.length > 1_000_000)
      result = canvas.toDataURL("image/jpeg", 0.65);
    if (result.length > 1_000_000)
      throw new Error("图片压缩后仍然过大，请选择较小的图片");
    return result;
  } finally {
    bitmap.close();
  }
}
