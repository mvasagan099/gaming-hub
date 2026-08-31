-- CreateTable: AppVersionConfig
-- Singleton table that stores admin-controlled Android app version enforcement settings.
-- A seed row with safe defaults is inserted on first run.

CREATE TABLE "AppVersionConfig" (
    "id"                      TEXT NOT NULL,
    "latestVersion"           TEXT NOT NULL DEFAULT '1.0',
    "minimumSupportedVersion" TEXT NOT NULL DEFAULT '1.0',
    "downloadUrl"             TEXT NOT NULL DEFAULT 'https://play.google.com/store/apps/details?id=com.gaminghub.app',
    "updateMessage"           TEXT NOT NULL DEFAULT 'A new version of Gaming Hub is required. Please update to continue playing.',
    "forceUpdate"             BOOLEAN NOT NULL DEFAULT false,
    "updatedAt"               TIMESTAMP(3) NOT NULL,
    "updatedBy"               TEXT,

    CONSTRAINT "AppVersionConfig_pkey" PRIMARY KEY ("id")
);

-- Insert a safe default row so the singleton exists immediately after migration.
-- Defaults match the current Android versionName ("1.0") so no existing users are locked.
INSERT INTO "AppVersionConfig" ("id", "latestVersion", "minimumSupportedVersion", "downloadUrl", "updateMessage", "forceUpdate", "updatedAt")
VALUES (
    'app-version-config-singleton',
    '1.0',
    '1.0',
    'https://play.google.com/store/apps/details?id=com.gaminghub.app',
    'A new version of Gaming Hub is required. Please update to continue playing.',
    false,
    NOW()
);
