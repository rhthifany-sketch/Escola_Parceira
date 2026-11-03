-- AlterEnum
ALTER TYPE "SignMethod" ADD VALUE 'PLATAFORMA';

-- CreateTable
CREATE TABLE "sign_requests" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "type" "SignedDocType" NOT NULL,
    "year" INTEGER,
    "month" INTEGER,
    "provider" TEXT NOT NULL DEFAULT 'ZAPSIGN',
    "external_id" TEXT NOT NULL,
    "signers" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "sign_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sign_requests_student_id_type_idx" ON "sign_requests"("student_id", "type");

-- AddForeignKey
ALTER TABLE "sign_requests" ADD CONSTRAINT "sign_requests_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sign_requests" ADD CONSTRAINT "sign_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
