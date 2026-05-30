import { v2 as cloudinary } from "cloudinary";

cloudinary.config();

const BLANK_PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function sanitizePrompt(prompt: string): string {
  return prompt
    .replace(/[\s]+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 80);
}

export async function uploadImage(base64: string): Promise<string> {
  const result = await cloudinary.uploader.upload(base64, {
    folder: "visualdemo/products",
  });
  return result.secure_url;
}

export async function uploadImages(base64Images: string[]): Promise<string[]> {
  const urls = await Promise.all(
    base64Images.map((img) => uploadImage(img))
  );
  return urls;
}

export async function generateImageFromPrompt(prompt: string): Promise<string> {
  const short = sanitizePrompt(prompt);
  const base = await cloudinary.uploader.upload(BLANK_PIXEL, {
    folder: "visualdemo/generations",
  });
  return cloudinary.url(base.public_id, {
    effect: `gen_ai:prompt_${short}`,
    version: base.version,
  });
}

export async function editImageFromPrompt(base64: string, prompt: string): Promise<string> {
  const short = sanitizePrompt(prompt);
  const upload = await cloudinary.uploader.upload(base64, {
    folder: "visualdemo/generations",
  });
  return cloudinary.url(upload.public_id, {
    effect: `gen_ai:prompt_${short}`,
    version: upload.version,
  });
}

export { cloudinary };
