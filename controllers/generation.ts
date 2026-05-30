import { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { prisma } from "../config/prisma.js";
import { generateImage, editImage, generateVideo } from "../config/ai.js";
import { uploadImage } from "../config/cloudinary.js";

const CREDIT_COST = 5;

async function checkCredits(userId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { ok: false, reason: "User not found" };
  }
  if (user.credits < CREDIT_COST) {
    return { ok: false, reason: "Insufficient credits. Buy a subscription to get more." };
  }
  return { ok: true };
}

async function deductCredits(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { credits: { decrement: CREDIT_COST } },
  });
}

export const createImageGeneration = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { prompt, image } = req.body;
    if (!prompt) {
      return res.status(400).json({ message: "Prompt is required" });
    }

    const creditCheck = await checkCredits(userId);
    if (!creditCheck.ok) {
      return res.status(403).json({ message: creditCheck.reason });
    }

    let resultDataUrl: string;
    if (image) {
      resultDataUrl = await editImage(prompt, image);
    } else {
      resultDataUrl = await generateImage(prompt);
    }

    const cloudinaryUrl = await uploadImage(resultDataUrl);

    const project = await prisma.project.create({
      data: {
        name: prompt.slice(0, 60),
        userId,
        productName: prompt.slice(0, 60),
        productDescription: "",
        userPrompt: prompt,
        aspectRatio: "1:1",
        targetLength: 5,
        generatedImage: cloudinaryUrl,
      },
    });

    await deductCredits(userId);

    res.json({ imageUrl: cloudinaryUrl, project });
  } catch (error: any) {
    console.error("[createImageGeneration]", error?.message || error);
    res.status(500).json({ message: error?.message || "Generation failed" });
  }
};

export const createVideoGeneration = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { prompt, image } = req.body;
    if (!prompt) {
      return res.status(400).json({ message: "Prompt is required" });
    }

    const creditCheck = await checkCredits(userId);
    if (!creditCheck.ok) {
      return res.status(403).json({ message: creditCheck.reason });
    }

    const videoUri = await generateVideo(prompt, image || undefined);

    const project = await prisma.project.create({
      data: {
        name: prompt.slice(0, 60),
        userId,
        productName: prompt.slice(0, 60),
        productDescription: "",
        userPrompt: prompt,
        aspectRatio: "9:16",
        targetLength: 5,
        generatedVideo: videoUri,
      },
    });

    await deductCredits(userId);

    res.json({ project, videoUrl: videoUri, message: "Video generated successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
