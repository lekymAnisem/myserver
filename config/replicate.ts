import Replicate from "replicate";

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_KEY;

let replicate: Replicate | null = null;

function getClient(): Replicate {
  if (!replicate) {
    if (!REPLICATE_API_TOKEN) {
      throw new Error("REPLICATE_API_KEY is not set");
    }
    replicate = new Replicate({ auth: REPLICATE_API_TOKEN });
  }
  return replicate;
}

export async function generateImageFromPrompt(prompt: string): Promise<string> {
  const client = getClient();
  const output = await client.run(
    "black-forest-labs/flux-schnell",
    {
      input: {
        prompt,
        go_fast: true,
        num_outputs: 1,
        aspect_ratio: "1:1",
        output_format: "jpg",
      },
    }
  );
  if (Array.isArray(output) && output.length > 0) {
    return output[0];
  }
  if (typeof output === "string") {
    return output;
  }
  throw new Error("Unexpected Replicate image output format");
}

export async function generateVideoFromImage(imageUrl: string): Promise<string> {
  const client = getClient();
  const output = await client.run(
    "stability-ai/stable-video-diffusion:3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438",
    {
      input: {
        input_image: imageUrl,
        video_length: 25,
        frames_per_second: 7,
        cond_aug: 0.02,
        decoding_t: 7,
        sizing_strategy: "maintain_aspect_ratio",
      },
    }
  );
  if (Array.isArray(output) && output.length > 0) {
    return output[0];
  }
  if (typeof output === "string") {
    return output;
  }
  throw new Error("Unexpected Replicate output format");
}
