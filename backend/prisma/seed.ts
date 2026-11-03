import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

/** Cria o primeiro usuário financeiro (idempotente: não mexe se já existir). */
async function main() {
  const prisma = new PrismaClient();
  const email = (process.env.ADMIN_EMAIL ?? "").toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || !password) {
    console.log("Seed: ADMIN_EMAIL/ADMIN_PASSWORD não configurados — nenhum usuário criado.");
    return prisma.$disconnect();
  }
  const exists = await prisma.user.findUnique({ where: { email } });
  if (!exists) {
    await prisma.user.create({
      data: { name: process.env.ADMIN_NAME ?? "Financeiro", email, role: "FINANCEIRO", passwordHash: await bcrypt.hash(password, 10) },
    });
    console.log(`Seed: usuário financeiro ${email} criado.`);
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
