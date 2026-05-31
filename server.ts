
import "dotenv/config";
import express, { Request, Response } from 'express';
import cors from "cors";
import { auth } from "./middleware/auth.js";
import projectRoutes from "./routes/project.js";
import userRoutes from "./routes/user.js";
import generationRoutes from "./routes/generation.js";
import { clerkWebhook } from "./controllers/clerk.js";
import "./config/instrument.js";
import * as Sentry from "@sentry/node"
const app = express();

app.use(cors())

// Webhook route MUST use raw body before express.json() parses it away
app.post('/api/webhooks/clerk', express.raw({ type: 'application/json' }), clerkWebhook);
app.get('/api/webhooks/clerk', (_req: Request, res: Response) => {
  res.send('Webhook endpoint is ready');
});

// Other middleware for non-webhook routes
app.use(express.json({ limit: "10mb" }));
app.use(auth);
app.use('/api/projects', projectRoutes);
app.use('/api/generate', generationRoutes);
app.use('/api', userRoutes);

app.get('/', (req: Request, res: Response) => {
    res.send('Server is Live!');
});
app.get("/debug-sentry", function mainHandler(req, res) {
  throw new Error("My first Sentry error!");
});

// Debug endpoints (remove after confirming DB works)
app.get('/api/debug/users', async (_req: Request, res: Response) => {
    const { prisma } = await import("./config/prisma.js");
    const users = await prisma.user.findMany({ take: 10 });
    res.json({ count: users.length, users: users.map((u: any) => ({ id: u.id, email: u.email, name: u.name })) });
});

app.get('/api/debug/env', (_req: Request, res: Response) => {
    res.json({
        clerkSecretKey: !!process.env.CLERK_SECRET_KEY,
        databaseUrl: !!process.env.DATABASE_URL,
        webhookSecret: !!process.env.CLERK_WEBHOOK_SIGNING_SECRET,
    });
});

app.use((err: any, _req: Request, res: Response, _next: any) => {
  res.status(err.status || 500).json({
    message: err.message || "Internal server error",
    ...(err.type === "entity.parse.failed" && { detail: "Request body too large or malformed" }),
  });
});
Sentry.setupExpressErrorHandler(app);

const port = process.env.PORT || 3000;

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});