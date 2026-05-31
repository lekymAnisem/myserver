import { Request, Response } from "express";
import { verifyWebhook } from "@clerk/express/webhooks";
import { prisma } from "../config/prisma.js";

const CREDITS: Record<string, number> = { pro: 100, ultra: 300 };

function findUserId(data: any): string | null {
  return data?.payer?.user_id || data?.payer_id || data?.user_id || data?.id || null;
}

function findPlanSlug(data: any): string | null {
  return data?.plan?.slug
    || data?.items?.[0]?.plan?.slug
    || data?.subscription_items?.[0]?.plan?.slug
    || data?.price?.slug
    || null;
}

export const clerkWebhook = async (req: Request, res: Response) => {
    try {
        const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
        if (!signingSecret) {
            console.warn("[clerkWebhook] ⚠️ No CLERK_WEBHOOK_SIGNING_SECRET set — accepting events without verification (dev mode)");
        }

        let evt: any;
        if (signingSecret) {
            evt = await verifyWebhook(req);
        } else {
            const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf-8') : JSON.stringify(req.body);
            evt = JSON.parse(raw);
        }
        const { data, type } = evt;
        console.log(`[clerkWebhook] Event: ${type}`, JSON.stringify(data).substring(0, 1000));

        switch (type) {
            case "user.created":
                await prisma.user.create({
                    data: {
                        id: data.id,
                        email: data.email_addresses?.[0]?.email_address || "",
                        name: (data.first_name || "") + " " + (data.last_name || ""),
                        image: data?.image_url || "",
                    }
                }).catch(() => {});
                break;

            case "user.updated":
                await prisma.user.upsert({
                    where: { id: data.id },
                    create: {
                        id: data.id,
                        email: data.email_addresses?.[0]?.email_address || "",
                        name: (data.first_name || "") + " " + (data.last_name || ""),
                        image: data?.image_url || "",
                    },
                    update: {
                        email: data.email_addresses?.[0]?.email_address || undefined,
                        name: (data.first_name || "") + " " + (data.last_name || ""),
                        image: data?.image_url || undefined,
                    },
                }).catch(() => {});
                break;

            case "user.deleted":
                await prisma.user.delete({ where: { id: data.id } }).catch(() => {});
                break;

            case "paymentAttempt.created":
            case "subscription.created":
            case "subscription.updated": {
                const userId = findUserId(data);
                const planId = findPlanSlug(data);
                const status = data?.status || "";

                console.log(`[clerkWebhook] ${type}: userId=${userId}, planId=${planId}, status=${status}`);

                if (!userId) {
                    console.warn(`[clerkWebhook] No userId found in ${type} event`);
                    return res.status(200).json({ message: "No userId" });
                }
                if (!planId || (planId !== "pro" && planId !== "ultra")) {
                    console.warn(`[clerkWebhook] Invalid or missing plan: ${planId}`);
                    return res.status(200).json({ message: "No valid plan" });
                }

                const paid =
                    status === "paid" || status === "active" || status === "trialing" ||
                    data?.charge_type === "recurring" || data?.charge_type === "checkout";

                if (!paid) {
                    console.warn(`[clerkWebhook] Skipping — status=${status}, charge_type=${data?.charge_type}`);
                    return res.status(200).json({ message: "Not a paid/subscribed event" });
                }

                await prisma.user.upsert({
                    where: { id: userId },
                    create: {
                        id: userId,
                        email: "",
                        name: "",
                        image: "",
                        plan: planId,
                        credits: CREDITS[planId],
                    },
                    update: {
                        plan: planId,
                        credits: CREDITS[planId],
                    },
                });

                console.log(`[clerkWebhook] ✅ Updated user ${userId} to ${planId} with ${CREDITS[planId]} credits`);
                break;
            }

            default:
                console.log(`[clerkWebhook] Unhandled event type: ${type}`);
                break;
        }
        res.status(200).json({ message: "Webhook received: " + type});
    } catch (error: any) {
        console.error("[clerkWebhook] Error:", error.message);
        console.error("[clerkWebhook] Stack:", error.stack);
        res.status(200).json({ message: error.message });
    }
}
