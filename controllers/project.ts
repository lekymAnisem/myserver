import { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { prisma } from "../config/prisma.js";
import { uploadImages, uploadImage } from "../config/cloudinary.js";
import { generateImage, generateVideo } from "../config/ai.js";

const CREDIT_COST = 5;

const getUserId = (req: Request): string | null => {
  const { userId } = getAuth(req);
  return userId;
};

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

export const createProject = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { name, productName, productDescription, userPrompt, aspectRatio, targetLength, uploadedImages } = req.body;

    const creditCheck = await checkCredits(userId);
    if (!creditCheck.ok) {
      return res.status(403).json({ message: creditCheck.reason });
    }

    const rawDataUrls: string[] = uploadedImages || [];

    let imageUrls: string[] = [];
    if (rawDataUrls.length > 0) {
      imageUrls = await uploadImages(rawDataUrls);
    }

    const project = await prisma.project.create({
      data: {
        name,
        userId,
        productName,
        productDescription: productDescription || "",
        userPrompt: userPrompt || "",
        aspectRatio: aspectRatio || "9:16",
        targetLength: targetLength || 5,
        uploadedImages: imageUrls,
        isGenerating: true,
      },
    });

    if (project.userPrompt) {
      try {
        const combinedPrompt = productName
          ? `Product: ${productName}${productDescription ? ` - ${productDescription}` : ""}. ${userPrompt}. Professional product photography, cinematic lighting, high quality, 4K`
          : userPrompt;
        const imageDataUrl = await generateImage(combinedPrompt);
        const cloudinaryUrl = await uploadImage(imageDataUrl);
        await prisma.project.update({
          where: { id: project.id },
          data: { generatedImage: cloudinaryUrl, isGenerating: false },
        });
      } catch (genErr) {
        console.error("Image generation failed:", genErr);
        await prisma.project.update({
          where: { id: project.id },
          data: { isGenerating: false },
        });
      }
    } else {
      await prisma.project.update({
        where: { id: project.id },
        data: { isGenerating: false },
      });
    }

    await deductCredits(userId);

    const finalProject = await prisma.project.findUnique({ where: { id: project.id } });
    res.status(201).json(finalProject);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const generateVideoFromImage = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const id = req.params.id as string;
    const project = await prisma.project.findFirst({ where: { id, userId } });
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    if (!project.generatedImage) {
      return res.status(400).json({ message: "No generated image to create video from" });
    }
    if (project.isGenerating) {
      return res.status(400).json({ message: "Already generating" });
    }

    const creditCheck = await checkCredits(userId);
    if (!creditCheck.ok) {
      return res.status(403).json({ message: creditCheck.reason });
    }

    await prisma.project.update({
      where: { id },
      data: { isGenerating: true },
    });

    try {
      const videoDataUrl = await generateVideo(project.userPrompt || project.name, project.generatedImage);
      console.log("[Video] Got Leonardo URL:", videoDataUrl.substring(0, 100));
      let finalVideoUrl = videoDataUrl;
      try {
        const cloudinaryVideoUrl = await uploadImage(videoDataUrl);
        console.log("[Video] Cloudinary upload succeeded:", cloudinaryVideoUrl.substring(0, 80));
        finalVideoUrl = cloudinaryVideoUrl;
      } catch (uploadErr: any) {
        console.error("[Video] Cloudinary upload failed, using Leonardo URL directly:", uploadErr.message);
      }
      const updated = await prisma.project.update({
        where: { id },
        data: { generatedVideo: finalVideoUrl, isGenerating: false },
      });
      await deductCredits(userId);
      res.json(updated);
    } catch (genErr: any) {
      console.error("[Video] Generation failed:", genErr.message);
      await prisma.project.update({
        where: { id },
        data: { isGenerating: false },
      });
      res.status(500).json({ message: genErr.message || "Video generation failed" });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getProjects = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const projects = await prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    res.json(projects);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getProject = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const id = req.params.id as string;
    const project = await prisma.project.findFirst({
      where: { id, userId },
    });

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json(project);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateProject = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const id = req.params.id as string;
    const { name, productName, productDescription, userPrompt, aspectRatio, targetLength, uploadedImages, generatedImage, generatedVideo, isGenerating, isPublished, error } = req.body;

    const existing = await prisma.project.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return res.status(404).json({ message: "Project not found" });
    }

    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(productName !== undefined && { productName }),
        ...(productDescription !== undefined && { productDescription }),
        ...(userPrompt !== undefined && { userPrompt }),
        ...(aspectRatio !== undefined && { aspectRatio }),
        ...(targetLength !== undefined && { targetLength }),
        ...(uploadedImages !== undefined && { uploadedImages }),
        ...(generatedImage !== undefined && { generatedImage }),
        ...(generatedVideo !== undefined && { generatedVideo }),
        ...(isGenerating !== undefined && { isGenerating }),
        ...(isPublished !== undefined && { isPublished }),
        ...(error !== undefined && { error }),
      },
    });

    res.json(project);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getCommunityProjects = async (_req: Request, res: Response) => {
  try {
    const projects = await prisma.project.findMany({
      where: { isPublished: true, isGenerating: false },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(projects);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteProject = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const id = req.params.id as string;
    const existing = await prisma.project.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return res.status(404).json({ message: "Project not found" });
    }

    await prisma.project.delete({ where: { id } });
    res.json({ message: "Project deleted" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
