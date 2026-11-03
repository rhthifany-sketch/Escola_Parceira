-- CreateEnum
CREATE TYPE "SignedDocType" AS ENUM ('ANEXO_I', 'ANEXO_II', 'ANEXO_III', 'ANEXO_IV', 'ANEXO_V');

-- CreateEnum
CREATE TYPE "SignMethod" AS ENUM ('PAPEL', 'DIGITAL');

-- CreateTable
CREATE TABLE "signed_documents" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "type" "SignedDocType" NOT NULL,
    "year" INTEGER,
    "month" INTEGER,
    "file_name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "method" "SignMethod" NOT NULL,
    "signatures" JSONB NOT NULL DEFAULT '[]',
    "uploaded_by_id" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signed_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "signed_documents_student_id_type_idx" ON "signed_documents"("student_id", "type");

-- CreateIndex
CREATE INDEX "signed_documents_unit_id_type_year_month_idx" ON "signed_documents"("unit_id", "type", "year", "month");

-- AddForeignKey
ALTER TABLE "signed_documents" ADD CONSTRAINT "signed_documents_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signed_documents" ADD CONSTRAINT "signed_documents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signed_documents" ADD CONSTRAINT "signed_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
