import { Request, Response } from "express";
import { verifyWebhook} from "@clerk/express/webhooks";
import { prisma } from "../config/prisma.js";

export const clerkWebhook = async (req: Request, res: Response) => {
    try { 
        const evt: any = await verifyWebhook(req);
        //Getting Data from request
        const { data, type} = evt;
        //Switch case for different events
        switch (type) {
            case "user.created": {
                    const createdMetadata = data.public_metadata || {};
                    await prisma.user.create({
                        data: {
                            id: data.id,
                            email: data.email_addresses[0].email_address,
                            name: data.first_name + " " + data.last_name,
                            image: data?.image_url,
                            plan: createdMetadata.plan || "free",
                        }
                    })
                  break;  
                }
                case "user.updated": {
                    const metadata = data.public_metadata || {};
                    await prisma.user.update({
                        where: {
                            id: data.id
                        },
                        data: {
                            id: data.id,
                            email: data.email_addresses[0].email_address,
                            name: data.first_name + " " + data.last_name,
                            image: data?.image_url,
                            plan: metadata.plan || "free",
                        }
                    })
                    break;
                }
                 case "user.deleted": {
                    await prisma.user.delete({
                        where: {id: data.id},})
                    break;
                }
                 case "paymentAttempt.created": {
                    const credits: Record<string, number> = { pro: 100, ultra: 300 }
                    const clerkUserId = data?.payer?.user_id;
                    const planId = data?.subscription_items?.[0]?.plan?.slug;

                    if ((data.charge_type === "recurring" || data.charge_type === "checkout") && data.status === "paid") {
                        if (!planId || (planId !== "pro" && planId !== "ultra")) {
                            return res.status(400).json({ message: "Invalid Plan" });
                        }
                        await prisma.user.update({
                            where: { id: clerkUserId },
                            data: {
                                credits: credits[planId],
                                plan: planId,
                            }
                        })
                    }
                    break;
                }
                case "subscription.created":
                case "subscription.updated": {
                    const subCredits: Record<string, number> = { pro: 100, ultra: 300 }
                    const subUserId = data?.payer_id;
                    const subPlanId = data?.items?.[0]?.plan?.slug;

                    if (!subUserId || !subPlanId || (subPlanId !== "pro" && subPlanId !== "ultra")) {
                        return res.status(400).json({ message: "Invalid Plan" });
                    }

                    await prisma.user.update({
                        where: { id: subUserId },
                        data: {
                            credits: subCredits[subPlanId],
                            plan: subPlanId,
                        }
                    })
                    break;
                }
            default:
                break;
        }
        res.status(200).json({ message: "Webhook received"  + type});
    }catch (error: any) {
        res.status(500).json({ message: error.message  });

        }
    }
