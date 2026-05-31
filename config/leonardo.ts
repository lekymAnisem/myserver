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

async function findVideoUrl(id: string): Promise<string | null> {
  // Try 1: Get the generation and look in generated_images
  try {
    const gen = await pollGeneration(id, 300000);
    console.log("[Leonardo] full gen response:", JSON.stringify(gen).substring(0, 2000));
    const images = getImages(gen);
    for (const img of images) {
      console.log("[Leonardo] image keys:", Object.keys(img));
      // Check every field for a URL
      for (const [k, v] of Object.entries(img)) {
        if (typeof v === "string" && (v.startsWith("http://") || v.startsWith("https://"))) {
          console.log(`[Leonardo] found URL in field "${k}":`, v.substring(0, 80));
          // Return the MP4 URL if it exists
          if (k.toLowerCase().includes("mp4") || k.toLowerCase().includes("motion") || k.toLowerCase().includes("video")) {
            return v;
          }
        }
      }
      // Explicit checks for common video URL fields
      const url = img?.motionMP4URL || img?.motion_mp4_url || img?.motionUrl || img?.motion_url || img?.videoUrl || img?.video_url || null;
      if (url) return url;
    }
    // Fallback: any URL in the gen object that ends with .mp4
    const jsonStr = JSON.stringify(gen);
    const mp4Match = jsonStr.match(/"(https?:\/\/[^"]+\.mp4)"/);
    if (mp4Match) return mp4Match[1];
  } catch (e: any) {
    // Generation fetch failed, try motion-variations below
  }

  // Try 2: Motion variations endpoint (text-to-video might create a motion variation)
  try {
    const mv = await request(`/motion-variations/${id}`);
    console.log("[Leonardo] motion-variations response:", JSON.stringify(mv).substring(0, 1000));
    const items = mv?.generated_image_variation_motion || [];
    for (const item of items) {
      if (item?.status === "COMPLETE" && item?.url) return item.url;
    }
  } catch {}

  return null;
}

export async function generateVideoFromPrompt(prompt: string): Promise<string> {
  const json = await request("/generations-text-to-video", {
    method: "POST",
    body: JSON.stringify({
      prompt,
      model: "MOTION2",
      resolution: "RESOLUTION_720",
      frameInterpolation: true,
    }),
  });
  console.log("[Leonardo] text-to-video response:", JSON.stringify(json).substring(0, 500));
  const generationId = json?.motionVideoGenerationJob?.generationId;
  if (!generationId) throw new Error("No generationId in Leonardo video response");

  const videoUrl = await findVideoUrl(generationId);
  if (!videoUrl) throw new Error("No video URL in Leonardo response");
  return videoUrl;
}
