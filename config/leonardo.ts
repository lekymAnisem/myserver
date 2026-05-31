const BASE = "https://cloud.leonardo.ai/api/rest/v1";

function getApiKey(): string {
  const key = process.env.LEONARDO_API_KEY;
  if (!key) throw new Error("LEONARDO_API_KEY is not set");
  return key;
}

async function request(path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Leonardo API ${res.status}: ${text.substring(0, 300)}`);
  }
  return res.json();
}

function get(obj: any, ...keys: string[]): any {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined) return v;
  }
  return undefined;
}

function getGen(obj: any): any {
  return obj?.generations_by_pk || obj?.generationsByPk || obj;
}

function getImages(gen: any): any[] {
  return gen?.generated_images || gen?.generatedImages || gen?.images || [];
}

async function pollGeneration(id: string, maxWaitMs = 180000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const json = await request(`/generations/${id}`);
    console.log("[Leonardo] poll response keys:", Object.keys(json));
    const gen = getGen(json);
    if (!gen) {
      console.log("[Leonardo] no gen object, raw:", JSON.stringify(json).substring(0, 500));
      throw new Error("Generation not found");
    }
    const status = gen.status || gen.Status || "";
    console.log("[Leonardo] status:", status, "id:", id);
    if (status === "COMPLETE") return gen;
    if (status === "FAILED") throw new Error("Generation failed");
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Generation timed out");
}

function findUrl(images: any[], field: string): string | null {
  const keys = field === "motionMP4URL"
    ? ["motionMP4URL", "motion_mp4_url", "motionMp4Url", "motion_url"]
    : ["url", "Url", "URL", "image_url"];
  for (const img of images) {
    for (const k of keys) {
      const v = img?.[k];
      if (v) return v;
    }
    // Fallback: any string value that looks like a URL
    for (const v of Object.values(img)) {
      if (typeof v === "string" && (v.startsWith("http://") || v.startsWith("https://"))) return v;
    }
  }
  return null;
}

export async function generateImageFromPrompt(prompt: string): Promise<string> {
  const json = await request("/generations", {
    method: "POST",
    body: JSON.stringify({
      prompt,
      modelId: "de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3",
      num_images: 1,
      width: 1024,
      height: 768,
      contrast: 3.5,
      alchemy: true,
      styleUUID: "111dc692-d470-4eec-b791-3475abac4c46",
    }),
  });
  const generationId = json?.sdGenerationJob?.generationId;
  if (!generationId) throw new Error("No generationId in Leonardo response");

  const gen = await pollGeneration(generationId);
  const images = getImages(gen);
  console.log("[Leonardo] image gen images:", images.length);
  const url = findUrl(images, "url");
  if (!url) {
    console.log("[Leonardo] no url in images:", JSON.stringify(images).substring(0, 500));
    throw new Error("No image URL in Leonardo response");
  }
  return url;
}

export async function generateVideoFromPrompt(prompt: string): Promise<string> {
  const json = await request("/generations-text-to-video", {
    method: "POST",
    body: JSON.stringify({
      prompt,
      model: "MOTION2",
      resolution: "RESOLUTION_720",
    }),
  });
  const generationId = json?.motionVideoGenerationJob?.generationId;
  if (!generationId) throw new Error("No generationId in Leonardo video response");

  const gen = await pollGeneration(generationId);
  const images = getImages(gen);
  console.log("[Leonardo] video gen images:", images.length);
  const videoUrl = findUrl(images, "motionMP4URL");
  if (!videoUrl) {
    console.log("[Leonardo] no motionMP4URL in images:", JSON.stringify(images).substring(0, 500));
    throw new Error("No video URL in Leonardo response");
  }
  return videoUrl;
}
