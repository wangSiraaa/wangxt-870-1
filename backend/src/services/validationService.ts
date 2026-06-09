import { prisma } from '../index.js';
import { TransferStatus, ChecklistItemStatus, AssetStatus, PermissionStatus } from '@prisma/client';
import { BusinessException } from '../middleware/errorHandler.js';

const statusOrder: TransferStatus[] = [
  TransferStatus.DRAFT,
  TransferStatus.PENDING_HANDOVER,
  TransferStatus.ASSET_VERIFICATION,
  TransferStatus.PERMISSION_CONFIRMATION,
  TransferStatus.MANAGER_APPROVAL,
  TransferStatus.RETURNED_FOR_CORRECTION,
  TransferStatus.PENDING_ARCHIVE,
  TransferStatus.ARCHIVED,
];

const getStatusRank = (status: TransferStatus): number => {
  const idx = statusOrder.indexOf(status);
  return idx === -1 ? -1 : idx;
};

export async function validateTransferBeforeAdvance(
  transferId: string,
  targetStatus: TransferStatus
): Promise<void> {
  const targetRank = getStatusRank(targetStatus);

  await prisma.$transaction(async (tx) => {
    if (targetRank >= getStatusRank(TransferStatus.ASSET_VERIFICATION)) {
      const criticalItems = await tx.checklistItem.findMany({
        where: {
          transferId,
          isCritical: true,
          status: {
            notIn: [ChecklistItemStatus.CONFIRMED, ChecklistItemStatus.NOT_APPLICABLE],
          },
        },
        select: { id: true, itemName: true, category: true, status: true },
      });
      if (criticalItems.length > 0) {
        const list = criticalItems
          .map((it) => `[${it.category}] ${it.itemName}(${it.status})`)
          .join('、');
        throw new BusinessException(`关键事项未确认，无法推进: ${list}`);
      }
    }

    if (targetRank >= getStatusRank(TransferStatus.PERMISSION_CONFIRMATION)) {
      const missingAssets = await tx.assetHandover.findMany({
        where: {
          transferId,
          status: AssetStatus.MISSING,
          OR: [{ compensationNote: null }, { compensationNote: '' }],
        },
        select: { id: true, assetName: true, assetCode: true, compensationNote: true },
      });
      if (missingAssets.length > 0) {
        const list = missingAssets
          .map((a) => `${a.assetName}(${a.assetCode})`)
          .join('、');
        throw new BusinessException(`资产缺失但未填写赔付备注: ${list}，请先处理赔付并进入主管复核`);
      }
    }

    if (targetRank >= getStatusRank(TransferStatus.MANAGER_APPROVAL)) {
      const unconfirmedPerms = await tx.permissionConfirmation.findMany({
        where: {
          transferId,
          status: {
            notIn: [PermissionStatus.TRANSFERRED, PermissionStatus.REVOKED],
          },
        },
        select: { id: true, systemName: true, permissionName: true, status: true },
      });
      if (unconfirmedPerms.length > 0) {
        const list = unconfirmedPerms
          .map((p) => `${p.systemName}-${p.permissionName}(${p.status})`)
          .join('、');
        throw new BusinessException(`权限移交未完成双人确认: ${list}`);
      }
    }
  });
}
