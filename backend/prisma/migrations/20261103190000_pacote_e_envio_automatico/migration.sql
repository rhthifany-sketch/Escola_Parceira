-- Pedido da ZapSign passa a ser um pacote (vários anexos de uma criança no mesmo documento).
-- Os pedidos que já existem (um anexo cada) viram pacotes de um anexo só.
ALTER TABLE "sign_requests"
  ADD COLUMN "types" "SignedDocType"[],
  ADD COLUMN "auto" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "page_map" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "signed_file" BYTEA,
  ADD COLUMN "whatsapp" BOOLEAN NOT NULL DEFAULT false;

UPDATE "sign_requests" SET
  "types" = ARRAY["type"],
  "year" = COALESCE("year", EXTRACT(YEAR FROM "created_at")::int),
  "month" = COALESCE("month", EXTRACT(MONTH FROM "created_at")::int);

DROP INDEX "sign_requests_student_id_type_idx";
ALTER TABLE "sign_requests" DROP COLUMN "type",
  ALTER COLUMN "year" SET NOT NULL,
  ALTER COLUMN "month" SET NOT NULL;

ALTER TABLE "signed_documents" ADD COLUMN "request_id" TEXT;

CREATE TABLE "settings" (
    "id" TEXT NOT NULL DEFAULT 'geral',
    "auto_send_enabled" BOOLEAN NOT NULL DEFAULT false,
    "auto_send_day" INTEGER NOT NULL DEFAULT 15,
    "auto_send_month" TEXT NOT NULL DEFAULT 'ATUAL',
    "auto_send_whatsapp" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auto_send_runs" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" JSONB NOT NULL,
    CONSTRAINT "auto_send_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auto_send_runs_year_month_key" ON "auto_send_runs"("year", "month");
CREATE INDEX "sign_requests_student_id_year_month_idx" ON "sign_requests"("student_id", "year", "month");
CREATE INDEX "sign_requests_external_id_idx" ON "sign_requests"("external_id");
ALTER TABLE "signed_documents" ADD CONSTRAINT "signed_documents_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "sign_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
