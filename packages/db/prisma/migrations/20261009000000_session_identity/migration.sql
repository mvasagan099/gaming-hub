ALTER TABLE "LoginSession" ADD COLUMN "providerSessionId" TEXT;
CREATE INDEX "LoginSession_userId_providerSessionId_idx" ON "LoginSession"("userId", "providerSessionId");
