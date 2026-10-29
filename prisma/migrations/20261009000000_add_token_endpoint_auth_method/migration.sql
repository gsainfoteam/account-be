-- CreateEnum
CREATE TYPE "TokenEndpointAuthMethod" AS ENUM ('none', 'client_secret_post', 'client_secret_basic');

-- AlterTable
-- Existing clients keep exchanging codes without a secret, as they do today. Confidential clients are switched one by one.
ALTER TABLE "client" ADD COLUMN "token_endpoint_auth_method" "TokenEndpointAuthMethod" NOT NULL DEFAULT 'none';
