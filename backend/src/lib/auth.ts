import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { prisma } from "./prisma";
import { HttpError } from "./http";

export interface AuthUser {
  id: string;
  name: string;
  role: UserRole;
  unitId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET não configurado");
  return s;
}

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
export const comparePassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);
export const signToken = (userId: string) => jwt.sign({ sub: userId }, secret(), { expiresIn: "10h" });

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) throw new HttpError(401, "Faça login para continuar");
    let userId: string;
    try {
      userId = String((jwt.verify(header.slice(7), secret()) as jwt.JwtPayload).sub);
    } catch {
      throw new HttpError(401, "Sessão expirada, faça login de novo");
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new HttpError(401, "Usuário inativo");
    req.user = { id: user.id, name: user.name, role: user.role, unitId: user.unitId };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireFinanceiro(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== "FINANCEIRO") return next(new HttpError(403, "Só o financeiro pode fazer isso"));
  next();
}

/** Gestor só enxerga a unidade dele. */
export function assertUnitAccess(user: AuthUser, unitId: string) {
  if (user.role === "GESTOR" && user.unitId !== unitId) throw new HttpError(403, "Sem acesso a esta unidade");
}
