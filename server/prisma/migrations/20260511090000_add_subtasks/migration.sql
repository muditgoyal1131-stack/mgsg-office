-- Migration: add_subtasks
-- Creates the SubTask table that was added to schema.prisma but never migrated.

-- 1. Create SubTaskStatus enum (idempotent — only if missing)
DO $$ BEGIN
    CREATE TYPE "SubTaskStatus" AS ENUM ('OPEN', 'SENT_FOR_REVIEW', 'CLOSED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create SubTask table
CREATE TABLE IF NOT EXISTS "SubTask" (
    "id"            SERIAL NOT NULL,
    "subTaskNumber" TEXT NOT NULL,
    "taskId"        INTEGER NOT NULL,
    "name"          TEXT NOT NULL,
    "description"   TEXT,
    "assignedToId"  INTEGER,
    "dueDate"       DATE,
    "status"        "SubTaskStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubTask_pkey" PRIMARY KEY ("id")
);

-- 3. Unique constraint on subTaskNumber
CREATE UNIQUE INDEX IF NOT EXISTS "SubTask_subTaskNumber_key" ON "SubTask"("subTaskNumber");

-- 4. Foreign keys
ALTER TABLE "SubTask"
    ADD CONSTRAINT "SubTask_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SubTask"
    ADD CONSTRAINT "SubTask_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
