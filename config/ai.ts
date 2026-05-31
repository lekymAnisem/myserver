export async function generateImage(prompt: string): Promise<string> {
  const { generateImageFromPrompt } = await import("../config/replicate.js");
  return generateImageFromPrompt(prompt);
}

export async function editImage(prompt: string, _imageDataUrl: string): Promise<string> {
  return generateImage(prompt);
}

export async function generateVideo(prompt: string, imageDataUrl?: string): Promise<string> {
  const { generateVideoFromImage } = await import("../config/replicate.js");
  let imageUrl: string;
  if (!imageDataUrl) {
    imageUrl = await generateImage(prompt);
  } else {
    imageUrl = imageDataUrl;
  }
  return generateVideoFromImage(imageUrl);
}
