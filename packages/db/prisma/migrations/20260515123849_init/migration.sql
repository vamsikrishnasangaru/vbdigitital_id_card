-- CreateEnum
CREATE TYPE "Orientation" AS ENUM ('HORIZONTAL', 'VERTICAL');

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "orientation" "Orientation" NOT NULL DEFAULT 'HORIZONTAL';
