-- Migration: invoice_profit_centre
-- 1. Add profitCentreId to Invoice
-- 2. Ensure a "Default" profit centre exists
-- 3. Back-fill existing invoices to the Default profit centre
-- 4. Create StaffProfitCentre access-control table

-- 1. Add profitCentreId column to Invoice (nullable)
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "profitCentreId" INTEGER;

-- 2. Ensure "Default" profit centre exists
INSERT INTO "ProfitCentre" ("name", "createdAt", "updatedAt")
VALUES ('Default', NOW(), NOW())
ON CONFLICT ("name") DO NOTHING;

-- 3. Back-fill: set all existing invoices to the Default profit centre
UPDATE "Invoice"
SET "profitCentreId" = (SELECT "id" FROM "ProfitCentre" WHERE "name" = 'Default')
WHERE "profitCentreId" IS NULL;

-- 4. FK constraint for Invoice -> ProfitCentre
DO $$ BEGIN
  ALTER TABLE "Invoice"
    ADD CONSTRAINT "Invoice_profitCentreId_fkey"
    FOREIGN KEY ("profitCentreId") REFERENCES "ProfitCentre"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 5. Create StaffProfitCentre table
CREATE TABLE IF NOT EXISTS "StaffProfitCentre" (
  "id"             SERIAL NOT NULL,
  "staffId"        INTEGER NOT NULL,
  "profitCentreId" INTEGER NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffProfitCentre_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StaffProfitCentre_staffId_profitCentreId_key"
  ON "StaffProfitCentre"("staffId", "profitCentreId");

DO $$ BEGIN
  ALTER TABLE "StaffProfitCentre"
    ADD CONSTRAINT "StaffProfitCentre_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "StaffProfitCentre"
    ADD CONSTRAINT "StaffProfitCentre_profitCentreId_fkey"
    FOREIGN KEY ("profitCentreId") REFERENCES "ProfitCentre"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
