import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { prisma } from "../config/prisma.js";

export const syncUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getAuth(req).userId;
    if (!userId) return next();

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (existing) return next();

    const clerkUser = await clerkClient.users.getUser(userId);
    if (!clerkUser) return next();

    const clerkPlan = (clerkUser?.publicMetadata as any)?.plan || "free";
    await prisma.user.create({
      data: {
        id: clerkUser.id,
        email: clerkUser.emailAddresses[0]?.emailAddress || "",
        name: `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() || "User",
        image: clerkUser.imageUrl || "",
        plan: clerkPlan,
      },
    });

    next();
  } catch (err) {
    console.error("[syncUser] Error:", err);
    next();
  }
};
