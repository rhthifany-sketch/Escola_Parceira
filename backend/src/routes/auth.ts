import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError, asyncHandler } from "../lib/http";
import { comparePassword, requireAuth, signToken } from "../lib/auth";

export const authRouter = Router();

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.active || !(await comparePassword(password, user.passwordHash))) {
      throw new HttpError(401, "E-mail ou senha incorretos");
    }
    res.json({ token: signToken(user.id), user: { id: user.id, name: user.name, role: user.role, unitId: user.unitId } });
  })
);

authRouter.get("/me", requireAuth, (req, res) => res.json(req.user));
