-- Migration: add_comments_vault_phone
-- Adds: phone on Staff, TaskComment model, ClientDocCategory enum, ClientDocument model

-- 1. Add phone field to Staff
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "phone" TEXT;

-- 2. Create TaskComment model
CREATE TABLE IF NOT EXISTS "TaskComment" (
    "id"        SERIAL NOT NULL,
    "taskId"    INTEGER NOT NULL,
    "authorId"  INTEGER NOT NULL,
    "content"   TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TaskComment"
    ADD CONSTRAINT "TaskComment_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskComment"
    ADD CONSTRAINT "TaskComment_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Create ClientDocCategory enum
DO $$ BEGIN
    CREATE TYPE "ClientDocCategory" AS ENUM (
        'PAN',
        'GST_CERTIFICATE',
        'INCORPORATION',
        'BANK_DETAILS',
        'BOARD_RESOLUTION',
        'POWER_OF_ATTORNEY',
        'FINANCIAL_STATEMENT',
        'OTHER'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 4. Create ClientDocument model
CREATE TABLE IF NOT EXISTS "ClientDocument" (
    "id"           SERIAL NOT NULL,
    "clientId"     INTEGER NOT NULL,
    "title"        TEXT NOT NULL,
    "category"     "ClientDocCategory" NOT NULL DEFAULT 'OTHER',
    "fileName"     TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileSize"     INTEGER NOT NULL,
    "mimeType"     TEXT NOT NULL,
    "notes"        TEXT,
    "uploadedById" INTEGER NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientDocument_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ClientDocument"
    ADD CONSTRAINT "ClientDocument_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientDocument"
    ADD CONSTRAINT "ClientDocument_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
