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

async function pollGeneration(id: string, maxWaitMs = 120000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const json = await request(`/generations/${id}`);
    const gen = json?.generations_by_pk;
    if (!gen) throw new Error("Generation not found");
    if (gen.status === "COMPLETE") return gen;
    if (gen.status === "FAILED") throw new Error("Generation failed");
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Generation timed out");
}

export async function generateImageFromPrompt(prompt: string): Promise<string> {
  const json = await request("/generations", {
    method: "POST",
    body: JSON.stringify({
      prompt,
      modelId: "b24e16ff-06e3-43eb-8d33-4416c2d75876",
      num_images: 1,
      width: 1024,
      height: 768,
      alchemy: true,
      sd_version: "PHOENIX",
    }),
  });
  const generationId = json?.sdGenerationJob?.generationId;
  if (!generationId) throw new Error("No generationId in Leonardo response");

  const gen = await pollGeneration(generationId);
  const url = gen?.generated_images?.[0]?.url;
  if (!url) throw new Error("No image URL in Leonardo response");
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
  const videoUrl = gen?.generated_images?.[0]?.motionMP4URL;
  if (!videoUrl) throw new Error("No video URL in Leonardo response");
  return videoUrl;
}
