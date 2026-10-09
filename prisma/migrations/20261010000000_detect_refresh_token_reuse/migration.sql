-- AlterTable
-- Every existing refresh token starts its own family. The default only fills existing rows and is dropped
-- right away, because Prisma generates the id for new rows.
ALTER TABLE "refresh_token" ADD COLUMN "familyId" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN "usedAt" TIMESTAMP(3);
ALTER TABLE "refresh_token" ALTER COLUMN "familyId" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "refresh_token_familyId_idx" ON "refresh_token"("familyId");
