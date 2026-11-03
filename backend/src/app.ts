import express from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler } from "./lib/http";
import { requireAuth } from "./lib/auth";
import { authRouter } from "./routes/auth";
import { usersRouter } from "./routes/users";
import { unitsRouter } from "./routes/units";
import { studentsRouter } from "./routes/students";
import { monthsRouter } from "./routes/months";

export function createApp() {
  const app = express();
  app.use(helmet());
  const origins = (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(",").map((o) => o.trim());
  app.use(cors({ origin: origins, exposedHeaders: ["Content-Disposition"] }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter);
  app.use("/api/users", requireAuth, usersRouter);
  app.use("/api/units", requireAuth, unitsRouter);
  app.use("/api/students", requireAuth, studentsRouter);
  app.use("/api/months", requireAuth, monthsRouter);
  app.use(errorHandler);
  return app;
}
