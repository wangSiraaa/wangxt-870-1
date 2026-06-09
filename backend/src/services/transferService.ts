import { prisma } from '../index.js';
import { TransferStatus, ChecklistItemStatus, AssetStatus, PermissionStatus } from '@prisma/client';
import { BusinessException } from '../middleware/errorHandler.js';
import { validateTransferBeforeAdvance } from './validationService.js';

const STATUS_FLOW: Record<TransferStatus, TransferStatus[]> = {
  [TransferStatus.DRAFT]: [TransferStatus.PENDING_HANDOVER],
  [TransferStatus.PENDING_HANDOVER]: [TransferStatus.ASSET_VERIFICATION],
  [TransferStatus.ASSET_VERIFICATION]: [TransferStatus.PERMISSION_CONFIRMATION],
  [TransferStatus.PERMISSION_CONFIRMATION]: [TransferStatus.MANAGER_APPROVAL],
  [TransferStatus.MANAGER_APPROVAL]: [TransferStatus.PENDING_ARCHIVE, TransferStatus.RETURNED_FOR_CORRECTION],
  [TransferStatus.RETURNED_FOR_CORRECTION]: [TransferStatus.MANAGER_APPROVAL],
  [TransferStatus.PENDING_ARCHIVE]: [TransferStatus.ARCHIVED],
  [TransferStatus.ARCHIVED]: [],
};

export function canTransitionTo(
  current: TransferStatus,
  target: TransferStatus
): boolean {
  return STATUS_FLOW[current]?.includes(target) || false;
}

export function getNextStatus(current: TransferStatus): TransferStatus | null {
  const next = STATUS_FLOW[current]?.[0];
  return next || null;
}

export async function generateTransferNo(): Promise<string> {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePart = `${yyyy}${mm}${dd}`;
  const prefix = `HG-${datePart}-`;

  const latest = await prisma.transferApplication.findFirst({
    where: { transferNo: { startsWith: prefix } },
    orderBy: { transferNo: 'desc' },
    select: { transferNo: true },
  });

  let seq = 1;
  if (latest) {
    const parts = latest.transferNo.split('-');
    if (parts.length >= 3) {
      const num = parseInt(parts[2], 10);
      if (!isNaN(num)) seq = num + 1;
    }
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

export async function advanceStatus(
  transferId: string,
  targetStatus: TransferStatus,
  operatorId: string
) {
  const transfer = await prisma.transferApplication.findUnique({
    where: { id: transferId },
    select: { status: true, version: true },
  });

  if (!transfer) {
    throw new BusinessException('转岗申请不存在', 404);
  }

  if (transfer.status === TransferStatus.ARCHIVED) {
    throw new BusinessException('已归档的申请不可推进状态');
  }

  if (!canTransitionTo(transfer.status, targetStatus)) {
    throw new BusinessException(
      `状态流转不合法: ${transfer.status} -> ${targetStatus}`
    );
  }

  await validateTransferBeforeAdvance(transferId, targetStatus);

  const version = transfer.version;

  const updated = await prisma.transferApplication.update({
    where: {
      id: transferId,
      version,
    },
    data: {
      status: targetStatus,
      version: { increment: 1 },
      archivedAt:
        targetStatus === TransferStatus.ARCHIVED ? new Date() : undefined,
    },
    include: {
      fromEmployee: true,
      toEmployee: true,
      creator: true,
      approver: true,
      checklistItems: { orderBy: { sortOrder: 'asc' } },
      assets: true,
      permissions: true,
      approvals: { orderBy: { approvedAt: 'desc' } },
    },
  });

  await prisma.auditLog.create({
    data: {
      transferId,
      userId: operatorId,
      action: 'ADVANCE_STATUS',
      entityType: 'TransferApplication',
      entityId: transferId,
      detail: `状态流转: ${transfer.status} -> ${targetStatus}`,
      version: version + 1,
    },
  });

  return updated;
}
