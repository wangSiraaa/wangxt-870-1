import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../index.js';
import { ChecklistItemStatus, TransferStatus, UserRole } from '@prisma/client';
import { BusinessException } from '../middleware/errorHandler.js';
import { requirePermission } from '../services/permissionMatrixService.js';
import { ensureNotArchived, ensureReturnedCanEdit } from '../middleware/versionMiddleware.js';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'checklist', 'read');

    const { transferId, status, isCritical } = req.query;
    const where: any = {};
    if (transferId) where.transferId = String(transferId);
    if (status) where.status = String(status) as ChecklistItemStatus;
    if (isCritical !== undefined) where.isCritical = isCritical === 'true';

    const items = await prisma.checklistItem.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { confirmedBy: true },
    });
    res.json({ success: true, data: items });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'checklist', 'read');

    const item = await prisma.checklistItem.findUnique({
      where: { id: req.params.id },
      include: { confirmedBy: true, transfer: true },
    });
    if (!item) return res.status(404).json({ success: false, message: '清单条目不存在' });
    res.json({ success: true, data: item });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'checklist', 'create');

    const items = Array.isArray(req.body) ? req.body : [req.body];
    if (!items.every((it: any) => it.transferId && it.itemName)) {
      return res.status(400).json({ success: false, message: '每条记录必须包含 transferId 和 itemName' });
    }
    const created = await prisma.$transaction(
      items.map((it: any) => prisma.checklistItem.create({ data: it }))
    );
    res.status(201).json({ success: true, data: created });
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'checklist', 'update');

    const itemId = req.params.id;
    const existing = await prisma.checklistItem.findUnique({
      where: { id: itemId },
      select: { transferId: true, status: true, confirmedById: true, confirmedVersion: true, returnedReason: true },
    });
    if (!existing) return res.status(404).json({ success: false, message: '清单条目不存在' });

    await ensureNotArchived(existing.transferId);

    const transfer = await prisma.transferApplication.findUnique({
      where: { id: existing.transferId },
      select: { status: true, version: true },
    });
    if (!transfer) throw new BusinessException('申请不存在', 404);

    const { status, confirmedById, confirmedRemark, ...rest } = req.body;
    const updateData: any = { ...rest };
    delete updateData.version;
    delete updateData.expectedVersion;

    if (transfer.status === TransferStatus.RETURNED_FOR_CORRECTION) {
      if (!existing.returnedReason && existing.status === ChecklistItemStatus.CONFIRMED) {
        throw new BusinessException('退回补正阶段仅可修改被退回的项目，已确认项不可修改');
      }
      if (existing.status === ChecklistItemStatus.CONFIRMED && confirmedById) {
        if (existing.confirmedById && confirmedById !== existing.confirmedById) {
          throw new BusinessException('退回补正阶段已确认项的确认人不可修改');
        }
      }
    }

    if (status !== undefined) {
      const validStatuses = Object.values(ChecklistItemStatus);
      if (!validStatuses.includes(status as ChecklistItemStatus)) {
        throw new BusinessException(`状态值无效，必须为: ${validStatuses.join(', ')}`);
      }
      updateData.status = status;

      if (
        (status === ChecklistItemStatus.CONFIRMED || status === ChecklistItemStatus.NOT_APPLICABLE) &&
        existing.status !== ChecklistItemStatus.CONFIRMED
      ) {
        if (!confirmedById) throw new BusinessException('确认操作必须提供 confirmedById');
        updateData.confirmedById = confirmedById;
        updateData.confirmedAt = new Date();
        updateData.confirmedVersion = transfer.version;
        if (confirmedRemark !== undefined) updateData.confirmedRemark = confirmedRemark;
      } else if (status === ChecklistItemStatus.PENDING) {
        if (existing.confirmedVersion && transfer.status !== TransferStatus.RETURNED_FOR_CORRECTION) {
          throw new BusinessException('已确认项不可退回为待确认');
        }
        updateData.confirmedById = null;
        updateData.confirmedAt = null;
      }
    }

    await prisma.$transaction([
      prisma.checklistItem.update({
        where: { id: itemId },
        data: updateData,
      }),
      prisma.transferApplication.update({
        where: { id: existing.transferId },
        data: { version: { increment: 1 } },
      }),
      prisma.auditLog.create({
        data: {
          transferId: existing.transferId,
          userId: req.user.id,
          action: status === ChecklistItemStatus.CONFIRMED ? 'CONFIRM' : 'UPDATE',
          entityType: 'ChecklistItem',
          entityId: itemId,
          detail: `交接项: ${(existing as any).itemName || itemId} 状态变更为 ${status || 'UPDATE'}`,
          version: transfer.version + 1,
        },
      }),
    ]);

    const updated = await prisma.checklistItem.findUnique({
      where: { id: itemId },
      include: { confirmedBy: true },
    });
    res.json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'checklist', 'delete');

    const item = await prisma.checklistItem.findUnique({
      where: { id: req.params.id },
      select: { transferId: true },
    });
    if (!item) return res.status(404).json({ success: false, message: '清单条目不存在' });
    await ensureNotArchived(item.transferId);

    await prisma.checklistItem.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: '删除成功' });
  } catch (e) {
    next(e);
  }
});

export default router;
