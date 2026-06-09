-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('APPLICANT', 'HANDOVER', 'RECEIVER', 'ASSET_ADMIN', 'PERMISSION_ADMIN', 'MANAGER', 'AUDITOR');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('DRAFT', 'PENDING_HANDOVER', 'ASSET_VERIFICATION', 'PERMISSION_CONFIRMATION', 'MANAGER_APPROVAL', 'RETURNED_FOR_CORRECTION', 'PENDING_ARCHIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ChecklistItemStatus" AS ENUM ('PENDING', 'CONFIRMED', 'NOT_APPLICABLE', 'RETURNED');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('IN_POSSESSION', 'RETURNED', 'MISSING', 'COMPENSATED', 'DAMAGED');

-- CreateEnum
CREATE TYPE "PermissionStatus" AS ENUM ('TO_BE_TRANSFERRED', 'FIRST_CONFIRMED', 'TRANSFERRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED', 'RETURNED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'CONFIRM', 'ADVANCE_STATUS', 'APPROVE', 'REJECT', 'RETURN', 'ARCHIVE', 'LOGIN', 'EXPORT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "passwordHash" TEXT DEFAULT '$2a$10$placeholder',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionTemplate" (
    "id" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PositionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferApplication" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "transferNo" TEXT NOT NULL,
    "fromEmployeeId" TEXT NOT NULL,
    "toEmployeeId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "approverId" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'DRAFT',
    "fromDepartment" TEXT NOT NULL,
    "toDepartment" TEXT NOT NULL,
    "fromPosition" TEXT NOT NULL,
    "toPosition" TEXT NOT NULL,
    "reason" TEXT,
    "remark" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "returnedReason" TEXT,
    "returnedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransferApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "description" TEXT,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "status" "ChecklistItemStatus" NOT NULL DEFAULT 'PENDING',
    "sortOrder" INTEGER NOT NULL,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedRemark" TEXT,
    "confirmedVersion" INTEGER,
    "returnedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetHandover" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "assetName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "specification" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "AssetStatus" NOT NULL DEFAULT 'IN_POSSESSION',
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedVersion" INTEGER,
    "compensationNote" TEXT,
    "compensationFee" DECIMAL(65,30),
    "returnedReason" TEXT,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionConfirmation" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "systemName" TEXT NOT NULL,
    "permissionName" TEXT NOT NULL,
    "permissionScope" TEXT,
    "status" "PermissionStatus" NOT NULL DEFAULT 'TO_BE_TRANSFERRED',
    "firstConfirmerId" TEXT,
    "firstConfirmedAt" TIMESTAMP(3),
    "firstConfirmVersion" INTEGER,
    "secondConfirmerId" TEXT,
    "secondConfirmedAt" TIMESTAMP(3),
    "secondConfirmVersion" INTEGER,
    "transferredToId" TEXT,
    "returnedReason" TEXT,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRecord" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "comment" TEXT,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "transferId" TEXT,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "responseBody" JSONB NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "transferId" TEXT,
    "userId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "detail" TEXT,
    "version" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeCode_key" ON "User"("employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PositionTemplate_position_department_itemName_key" ON "PositionTemplate"("position", "department", "itemName");

-- CreateIndex
CREATE UNIQUE INDEX "TransferApplication_transferNo_key" ON "TransferApplication"("transferNo");

-- CreateIndex
CREATE INDEX "ChecklistItem_transferId_idx" ON "ChecklistItem"("transferId");

-- CreateIndex
CREATE INDEX "AssetHandover_transferId_idx" ON "AssetHandover"("transferId");

-- CreateIndex
CREATE INDEX "PermissionConfirmation_transferId_idx" ON "PermissionConfirmation"("transferId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRecord_idempotencyKey_key" ON "ApprovalRecord"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ApprovalRecord_transferId_idx" ON "ApprovalRecord"("transferId");

-- CreateIndex
CREATE INDEX "ApprovalRecord_idempotencyKey_idx" ON "ApprovalRecord"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_idempotencyKey_key" ON "IdempotencyRecord"("idempotencyKey");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_transferId_idx" ON "IdempotencyRecord"("transferId");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_transferId_idx" ON "AuditLog"("transferId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "TransferApplication" ADD CONSTRAINT "TransferApplication_fromEmployeeId_fkey" FOREIGN KEY ("fromEmployeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferApplication" ADD CONSTRAINT "TransferApplication_toEmployeeId_fkey" FOREIGN KEY ("toEmployeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferApplication" ADD CONSTRAINT "TransferApplication_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferApplication" ADD CONSTRAINT "TransferApplication_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "TransferApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetHandover" ADD CONSTRAINT "AssetHandover_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "TransferApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetHandover" ADD CONSTRAINT "AssetHandover_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionConfirmation" ADD CONSTRAINT "PermissionConfirmation_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "TransferApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionConfirmation" ADD CONSTRAINT "PermissionConfirmation_firstConfirmerId_fkey" FOREIGN KEY ("firstConfirmerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionConfirmation" ADD CONSTRAINT "PermissionConfirmation_secondConfirmerId_fkey" FOREIGN KEY ("secondConfirmerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionConfirmation" ADD CONSTRAINT "PermissionConfirmation_transferredToId_fkey" FOREIGN KEY ("transferredToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRecord" ADD CONSTRAINT "ApprovalRecord_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "TransferApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRecord" ADD CONSTRAINT "ApprovalRecord_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "TransferApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "TransferApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
