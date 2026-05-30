const HF_TOKEN = process.env.HUGGINGFACE_TOKEN;

async function hfTextToImage(modelId: string, prompt: string): Promise<string> {
  const res = await fetch(`https://router.huggingface.co/hf-inference/models/${modelId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: prompt }),
  });
  if (!res.ok) {
    throw new Error(`HuggingFace API error ${res.status}: ${await res.text()}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

async function hfImageToImage(
  modelId: string,
  imageDataUrl: string,
  text?: string
): Promise<string> {
  const parts = imageDataUrl.split(",");
  const mimeType = parts[0].match(/:(.*?);/)?.[1] || "image/png";
  const imageBuf = Buffer.from(parts[1] || parts[0], "base64");
  const res = await fetch(
    `https://router.huggingface.co/hf-inference/models/${modelId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: imageBuf.toString("base64"),
        parameters: {
          ...(text && { prompt: text }),
        },
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`HuggingFace API error ${res.status}: ${await res.text()}`);
  }
  const outBuf = Buffer.from(await res.arrayBuffer());
  return `data:${mimeType};base64,${outBuf.toString("base64")}`;
}

export async function generateImage(prompt: string): Promise<string> {
  return hfTextToImage("black-forest-labs/FLUX.1-schnell", prompt);
}

export async function editImage(prompt: string, imageDataUrl: string): Promise<string> {
  // img2img models are limited on hf-inference; use FLUX text-to-image instead
  return generateImage(prompt);
}

export async function generateVideo(prompt: string, imageDataUrl?: string): Promise<string> {
  if (!imageDataUrl) {
    const image = await generateImage(prompt);
    const parts = image.split(",");
    const imageBuf = Buffer.from(parts[1] || parts[0], "base64");
    const res = await fetch(
      "https://router.huggingface.co/hf-inference/models/stabilityai/stable-video-diffusion-img2vid",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HF_TOKEN}`,
          "Content-Type": "application/octet-stream",
        },
        body: imageBuf,
      }
    );
    if (!res.ok) {
      throw new Error(`HuggingFace API error ${res.status}: ${await res.text()}`);
    }
    const outBuf = Buffer.from(await res.arrayBuffer());
    return `data:video/mp4;base64,${outBuf.toString("base64")}`;
  }
  const parts = imageDataUrl.split(",");
  const imageBuf = Buffer.from(parts[1] || parts[0], "base64");
  const res = await fetch(
    "https://router.huggingface.co/hf-inference/models/stabilityai/stable-video-diffusion-img2vid",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/octet-stream",
      },
      body: imageBuf,
    }
  );
  if (!res.ok) {
    throw new Error(`HuggingFace API error ${res.status}: ${await res.text()}`);
  }
  const outBuf = Buffer.from(await res.arrayBuffer());
  return `data:video/mp4;base64,${outBuf.toString("base64")}`;
}
