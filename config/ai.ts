export async function generateImage(prompt: string): Promise<string> {
  const { generateImageFromPrompt } = await import("../config/leonardo.js");
  return generateImageFromPrompt(prompt);
}

export async function editImage(prompt: string, _imageDataUrl: string): Promise<string> {
  return generateImage(prompt);
}

export async function generateVideo(prompt: string, _imageDataUrl?: string): Promise<string> {
  const { generateVideoFromPrompt } = await import("../config/leonardo.js");
  return generateVideoFromPrompt(prompt);
}
