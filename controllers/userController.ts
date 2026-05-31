import { Request, Response } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { prisma } from "../config/prisma.js";

const CREDITS_BY_PLAN: Record<string, number> = { free: 20, pro: 100, ultra: 300 };

export const getMe = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    let user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      const clerkUser = await clerkClient.users.getUser(userId);
      if (clerkUser) {
        user = await prisma.user.create({
          data: {
            id: clerkUser.id,
            email: clerkUser.emailAddresses[0]?.emailAddress || "",
            name: `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() || "User",
            image: clerkUser.imageUrl || "",
          },
        });
      }
    } else {
      user = await prisma.user.findUnique({ where: { id: userId } });
    }

    res.json(user);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getUserCredits = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ credits: user.credits ?? 20 });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllUserProjects = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
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

export const getProjectById = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
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

export const syncPlan = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const CLERK_SECRET = process.env.CLERK_SECRET_KEY;
    if (!CLERK_SECRET) {
      return res.status(500).json({ message: "CLERK_SECRET_KEY not configured" });
    }

    // Fetch user's subscriptions from Clerk Billing API
    const subRes = await fetch(
      `https://api.clerk.com/v1/billing/subscriptions?user_id=${userId}&status=active`,
      { headers: { Authorization: `Bearer ${CLERK_SECRET}` } }
    );

    let plan = "free";

    if (subRes.ok) {
      const subscriptions = await subRes.json();
      const active = Array.isArray(subscriptions)
        ? subscriptions.find((s: any) => s.status === "active")
        : null;
      if (active) {
        const slug = active.plan?.slug || active.items?.[0]?.plan?.slug;
        if (slug === "pro" || slug === "ultra") plan = slug;
      }
    }

    // Fallback: check public metadata if Billing API returned nothing
    if (plan === "free") {
      const clerkUser = await clerkClient.users.getUser(userId);
      const metaPlan = clerkUser.publicMetadata?.plan as string;
      if (metaPlan === "pro" || metaPlan === "ultra") plan = metaPlan;
    }

    const credits = CREDITS_BY_PLAN[plan] || 20;
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { plan, credits },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const toggleProjectPublic = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
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

    const project = await prisma.project.update({
      where: { id },
      data: { isPublished: !existing.isPublished },
    });

    res.json(project);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
