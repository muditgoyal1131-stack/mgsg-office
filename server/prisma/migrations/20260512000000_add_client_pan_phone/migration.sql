-- Migration: add_client_pan_phone
-- Adds PAN and phone fields to the Client table.

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "pan"   TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "phone" TEXT;
