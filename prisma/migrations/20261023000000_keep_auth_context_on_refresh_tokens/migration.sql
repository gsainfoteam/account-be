-- AlterTable
ALTER TABLE "refresh_token" ADD COLUMN     "amr" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "authTime" TIMESTAMP(3);
