/*
  Warnings:

  - The `category` column on the `Expense` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `amount` on the `Reimbursement` table. All the data in the column will be lost.
  - You are about to drop the column `category` on the `Reimbursement` table. All the data in the column will be lost.
  - You are about to drop the column `date` on the `Reimbursement` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `Reimbursement` table. All the data in the column will be lost.
  - You are about to drop the column `expenseId` on the `Reimbursement` table. All the data in the column will be lost.
  - You are about to drop the column `receiptUrl` on the `Reimbursement` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[claimNumber]` on the table `Reimbursement` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `claimNumber` to the `Reimbursement` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('CGST_SGST', 'IGST', 'NONE');

-- CreateEnum
CREATE TYPE "GSTType" AS ENUM ('REGISTERED', 'B2C', 'EXPORT');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CompLeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'HALF_DAY', 'WFH', 'ON_LEAVE');

-- CreateEnum
CREATE TYPE "ITAssetCategory" AS ENUM ('COMPUTER', 'LAPTOP', 'MONITOR', 'PRINTER', 'PHONE', 'TABLET', 'SERVER', 'NETWORK_DEVICE', 'SOFTWARE_LICENSE', 'FURNITURE', 'OTHER');

-- CreateEnum
CREATE TYPE "ITAssetStatus" AS ENUM ('IN_STOCK', 'ASSIGNED', 'UNDER_REPAIR', 'DISPOSED', 'LOST');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NEW', 'CONTACTED', 'PROPOSAL_SENT', 'NEGOTIATING', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('REFERRAL', 'COLD_OUTREACH', 'WEBSITE', 'EVENT', 'EXISTING_CLIENT', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "TenderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_EVALUATION', 'WON', 'LOST', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "TenderSource" AS ENUM ('GOVERNMENT', 'PSU', 'PRIVATE', 'NGO', 'OTHER');

-- CreateEnum
CREATE TYPE "HolidayType" AS ENUM ('NATIONAL', 'REGIONAL', 'FIRM');

-- CreateEnum
CREATE TYPE "StaffDocCategory" AS ENUM ('IDENTITY', 'EDUCATIONAL', 'PROFESSIONAL', 'EMPLOYMENT', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReimbursementStatus" ADD VALUE 'REVIEWED';
ALTER TYPE "ReimbursementStatus" ADD VALUE 'RETURNED';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'HR';

-- DropForeignKey
ALTER TABLE "Reimbursement" DROP CONSTRAINT "Reimbursement_expenseId_fkey";

-- DropIndex
DROP INDEX "Reimbursement_expenseId_key";

-- AlterTable
ALTER TABLE "BillingEntity" ADD COLUMN     "address" TEXT,
ADD COLUMN     "bankAccount" TEXT,
ADD COLUMN     "bankBranch" TEXT,
ADD COLUMN     "bankIfsc" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "gstin" TEXT,
ADD COLUMN     "pan" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "stateCode" TEXT;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "address" TEXT,
ADD COLUMN     "gstin" TEXT,
ADD COLUMN     "legalName" TEXT;

-- AlterTable
ALTER TABLE "Expense" DROP COLUMN "category",
ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'OTHER';

-- AlterTable
ALTER TABLE "Reimbursement" DROP COLUMN "amount",
DROP COLUMN "category",
DROP COLUMN "date",
DROP COLUMN "description",
DROP COLUMN "expenseId",
DROP COLUMN "receiptUrl",
ADD COLUMN     "claimNumber" TEXT NOT NULL,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "returnReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" INTEGER;

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "dateOfBirth" DATE,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "joiningDate" DATE,
ADD COLUMN     "reportingPartnerId" INTEGER;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "archiveConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "archiveConfirmedById" INTEGER,
ADD COLUMN     "archiveLink" TEXT,
ADD COLUMN     "archivingConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "assignedStaffId" INTEGER,
ADD COLUMN     "frozenAt" TIMESTAMP(3),
ADD COLUMN     "frozenById" INTEGER,
ADD COLUMN     "isFrozen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "otherExpenseAmount" DECIMAL(10,2),
ADD COLUMN     "otherExpenseDetails" TEXT,
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "terms" TEXT;

-- DropEnum
DROP TYPE "ExpenseCategory";

-- CreateTable
CREATE TABLE "ClientGSTIN" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "label" TEXT,
    "gstin" TEXT,
    "gstType" "GSTType" NOT NULL DEFAULT 'REGISTERED',
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "stateCode" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientGSTIN_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "prefix" TEXT NOT NULL DEFAULT '',
    "suffix" TEXT NOT NULL DEFAULT '',
    "startNumber" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" SERIAL NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "taskId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "clientGstinId" INTEGER,
    "billingEntityId" INTEGER,
    "amount" DECIMAL(10,2) NOT NULL,
    "taxType" "TaxType" NOT NULL DEFAULT 'NONE',
    "cgstRate" DECIMAL(5,2),
    "sgstRate" DECIMAL(5,2),
    "igstRate" DECIMAL(5,2),
    "cgstAmount" DECIMAL(10,2),
    "sgstAmount" DECIMAL(10,2),
    "igstAmount" DECIMAL(10,2),
    "totalAmount" DECIMAL(10,2),
    "hsnSacCode" TEXT,
    "template" INTEGER NOT NULL DEFAULT 1,
    "invoiceDate" DATE NOT NULL,
    "dueDate" DATE,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "paymentDate" DATE,
    "paymentAmount" DECIMAL(10,2),
    "paymentNotes" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLineItem" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "slNo" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "hsnSac" TEXT,
    "quantity" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "rate" DECIMAL(10,2) NOT NULL,
    "unit" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ITAsset" (
    "id" SERIAL NOT NULL,
    "assetCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ITAssetCategory" NOT NULL DEFAULT 'COMPUTER',
    "brand" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "purchaseDate" DATE,
    "purchasePrice" DECIMAL(10,2),
    "warrantyExpiry" DATE,
    "status" "ITAssetStatus" NOT NULL DEFAULT 'IN_STOCK',
    "assignedToId" INTEGER,
    "assignedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ITAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "daysAllowed" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Leave" (
    "id" SERIAL NOT NULL,
    "staffId" INTEGER NOT NULL,
    "leaveTypeId" INTEGER,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "days" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Leave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompLeaveRequest" (
    "id" SERIAL NOT NULL,
    "staffId" INTEGER NOT NULL,
    "days" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CompLeaveStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompLeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceCorrectionRequest" (
    "id" SERIAL NOT NULL,
    "staffId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "requestedStatus" "AttendanceStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceCorrectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" SERIAL NOT NULL,
    "staffId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReimbursementCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReimbursementCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReimbursementItem" (
    "id" SERIAL NOT NULL,
    "reimbursementId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "date" DATE NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "expenseId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReimbursementItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReimbursementAttachment" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReimbursementAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimesheetLock" (
    "id" SERIAL NOT NULL,
    "weekStart" DATE NOT NULL,
    "lockedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimesheetLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" INTEGER,
    "checklist" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" SERIAL NOT NULL,
    "leadName" TEXT NOT NULL,
    "contactPerson" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "source" "LeadSource" NOT NULL DEFAULT 'REFERRAL',
    "referredById" INTEGER,
    "estimatedFee" DECIMAL(10,2),
    "servicesInterested" TEXT,
    "stage" "LeadStage" NOT NULL DEFAULT 'NEW',
    "priority" "LeadPriority" NOT NULL DEFAULT 'MEDIUM',
    "assignedToId" INTEGER,
    "expectedCloseDate" DATE,
    "nextFollowUpDate" DATE,
    "lostReason" TEXT,
    "wonFee" DECIMAL(10,2),
    "convertedClientId" INTEGER,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadNote" (
    "id" SERIAL NOT NULL,
    "leadId" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "authorId" INTEGER NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tender" (
    "id" SERIAL NOT NULL,
    "tenderNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "tenderSource" "TenderSource" NOT NULL DEFAULT 'GOVERNMENT',
    "description" TEXT,
    "bidValue" DECIMAL(15,2),
    "estimatedValue" DECIMAL(15,2),
    "emdAmount" DECIMAL(10,2),
    "emdRefunded" BOOLEAN NOT NULL DEFAULT false,
    "status" "TenderStatus" NOT NULL DEFAULT 'DRAFT',
    "preBidDate" DATE,
    "submissionDeadline" DATE,
    "submittedAt" DATE,
    "dueDate" DATE,
    "resultDate" DATE,
    "lostReason" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderAssignment" (
    "id" SERIAL NOT NULL,
    "tenderId" INTEGER NOT NULL,
    "staffId" INTEGER NOT NULL,

    CONSTRAINT "TenderAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderDocument" (
    "id" SERIAL NOT NULL,
    "tenderId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenderDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderSubmissionFile" (
    "id" SERIAL NOT NULL,
    "tenderId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenderSubmissionFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderComment" (
    "id" SERIAL NOT NULL,
    "tenderId" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "authorId" INTEGER NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenderComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "type" "HolidayType" NOT NULL DEFAULT 'NATIONAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffDocument" (
    "id" SERIAL NOT NULL,
    "staffId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "category" "StaffDocCategory" NOT NULL DEFAULT 'OTHER',
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "expiryDate" DATE,
    "notes" TEXT,
    "uploadedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_taskId_key" ON "Invoice"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "ITAsset_assetCode_key" ON "ITAsset"("assetCode");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveType_name_key" ON "LeaveType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_staffId_date_key" ON "Attendance"("staffId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ReimbursementCategory_name_key" ON "ReimbursementCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ReimbursementItem_expenseId_key" ON "ReimbursementItem"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "TimesheetLock_weekStart_key" ON "TimesheetLock"("weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_convertedClientId_key" ON "Lead"("convertedClientId");

-- CreateIndex
CREATE UNIQUE INDEX "Tender_tenderNumber_key" ON "Tender"("tenderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TenderAssignment_tenderId_staffId_key" ON "TenderAssignment"("tenderId", "staffId");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Reimbursement_claimNumber_key" ON "Reimbursement"("claimNumber");

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_reportingPartnerId_fkey" FOREIGN KEY ("reportingPartnerId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientGSTIN" ADD CONSTRAINT "ClientGSTIN_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_frozenById_fkey" FOREIGN KEY ("frozenById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientGstinId_fkey" FOREIGN KEY ("clientGstinId") REFERENCES "ClientGSTIN"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_billingEntityId_fkey" FOREIGN KEY ("billingEntityId") REFERENCES "BillingEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ITAsset" ADD CONSTRAINT "ITAsset_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leave" ADD CONSTRAINT "Leave_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leave" ADD CONSTRAINT "Leave_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leave" ADD CONSTRAINT "Leave_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompLeaveRequest" ADD CONSTRAINT "CompLeaveRequest_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompLeaveRequest" ADD CONSTRAINT "CompLeaveRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reimbursement" ADD CONSTRAINT "Reimbursement_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReimbursementItem" ADD CONSTRAINT "ReimbursementItem_reimbursementId_fkey" FOREIGN KEY ("reimbursementId") REFERENCES "Reimbursement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReimbursementItem" ADD CONSTRAINT "ReimbursementItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ReimbursementCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReimbursementAttachment" ADD CONSTRAINT "ReimbursementAttachment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ReimbursementItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetLock" ADD CONSTRAINT "TimesheetLock_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedClientId_fkey" FOREIGN KEY ("convertedClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderAssignment" ADD CONSTRAINT "TenderAssignment_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderAssignment" ADD CONSTRAINT "TenderAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderDocument" ADD CONSTRAINT "TenderDocument_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderSubmissionFile" ADD CONSTRAINT "TenderSubmissionFile_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderComment" ADD CONSTRAINT "TenderComment_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffDocument" ADD CONSTRAINT "StaffDocument_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffDocument" ADD CONSTRAINT "StaffDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
