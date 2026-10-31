/**
 * A listing photo (Buy, Sell & Rent's photos, Events' cover) made ready in the browser: decoded (turned upright by its own orientation), scaled to at most 1600 px on
 * its long side and saved as a JPEG. Phone photos are often over 4.5 MB, which is more than a serverless request may carry,
 * and re-drawing them drops their location data before anything leaves the device (the server strips metadata again).
 */
export const MAX_SIDE = 1600;

/** The size a picture is drawn at: its long side at most `max`, never enlarged. */
export const fitSize = (w: number, h: number, max = MAX_SIDE) => {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
};

export async function preparePhoto(file: File, max = MAX_SIDE): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("That file can't be read as a photo. Use a JPEG, PNG or WebP.");
  }
  const { width, height } = fitSize(bitmap.width, bitmap.height, max);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare photos. Try another browser.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.85));
  if (!blob) throw new Error("That photo couldn't be prepared. Try another.");
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}
