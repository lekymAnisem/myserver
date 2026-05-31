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

    let plan = "free";

    // 1) Try Clerk Billing API
    const CLERK_SECRET = process.env.CLERK_SECRET_KEY;
    if (CLERK_SECRET) {
      try {
        const subRes = await fetch(
          `https://api.clerk.com/v1/billing/subscriptions?user_id=${userId}&status=active`,
          { headers: { Authorization: `Bearer ${CLERK_SECRET}` } }
        );
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
      } catch {
        // Billing API unavailable — fall through
      }
    }

    // 2) Fallback: check all Clerk user metadata
    if (plan === "free") {
      const clerkUser = await clerkClient.users.getUser(userId);
      const raw = clerkUser as any;
      const metaPlan =
        (raw.publicMetadata?.plan as string) ||
        (raw.privateMetadata?.plan as string) ||
        (raw.unsafeMetadata?.plan as string);
      if (metaPlan === "pro" || metaPlan === "ultra") plan = metaPlan;
    }

    // Only grant credits if a paid plan was verified via Clerk's API/metadata
    if (plan === "free") {
      return res.status(400).json({ message: "No active paid subscription found" });
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

export const claimPlan = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { plan } = req.body as { plan: string };
    if (plan !== "pro" && plan !== "ultra") {
      return res.status(400).json({ message: "Invalid plan" });
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
