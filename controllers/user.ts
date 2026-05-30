import { Request, Response } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { prisma } from "../config/prisma.js";

const PLAN_CREDITS: Record<string, number> = { pro: 100, ultra: 300 };

async function syncSubscriptionCredits(userId: string) {
  try {
    const subscription = await clerkClient.billing.getUserBillingSubscription(userId);
    if (!subscription) return;

    const planSlug = subscription.subscriptionItems?.[0]?.plan?.slug;
    if (!planSlug || !PLAN_CREDITS[planSlug]) return;

    await prisma.user.update({
      where: { id: userId },
      data: { credits: PLAN_CREDITS[planSlug] },
    });
  } catch {
    // Billing API may not be available - skip silently
  }
}

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
      await syncSubscriptionCredits(userId);
      user = await prisma.user.findUnique({ where: { id: userId } });
    }

    res.json(user);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
