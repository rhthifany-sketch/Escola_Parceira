-- AlterTable
ALTER TABLE "students" ADD COLUMN     "material_delivered_at" DATE;

-- AlterTable
ALTER TABLE "units" ADD COLUMN     "attendant_cpf" TEXT,
ADD COLUMN     "attendant_name" TEXT,
ADD COLUMN     "menu" JSONB;
