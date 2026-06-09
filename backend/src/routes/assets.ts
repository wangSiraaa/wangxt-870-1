import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../index.js';
import { AssetStatus, UserRole, TransferStatus } from '@prisma/client';
import { BusinessException } from '../middleware/errorHandler.js';
import {
  requirePermission,
  assertIsAssetAdmin,
  assertIsNotPermissionAdminForAsset,
} from '../services/permissionMatrixService.js';
import { ensureNotArchived } from '../middleware/versionMiddleware.js';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'asset', 'read');

    const { transferId, status } = req.query;
    const where: any = {};
    if (transferId) where.transferId = String(transferId);
    if (status) where.status = String(status) as AssetStatus;

    const assets = await prisma.assetHandover.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { confirmedBy: true },
    });
    res.json({ success: true, data: assets });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'asset', 'read');

    const asset = await prisma.assetHandover.findUnique({
      where: { id: req.params.id },
      include: { confirmedBy: true, transfer: true },
    });
    if (!asset) return res.status(404).json({ success: false, message: '资产不存在' });
    res.json({ success: true, data: asset });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'asset', 'create');

    const items = Array.isArray(req.body) ? req.body : [req.body];
    if (!items.every((it: any) => it.transferId && it.assetCode && it.assetName)) {
      return res.status(400).json({ success: false, message: '每条记录必须包含 transferId, assetCode, assetName' });
    }
    const created = await prisma.$transaction(
      items.map((it: any) => prisma.assetHandover.create({ data: it }))
    );
    res.status(201).json({ success: true, data: created });
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'asset', 'update');

    const assetId = req.params.id;
    const existing = await prisma.assetHandover.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        transferId: true,
        assetName: true,
        assetCode: true,
        status: true,
        confirmedVersion: true,
        returnedReason: true,
      },
    });
    if (!existing) return res.status(404).json({ success: false, message: '资产不存在' });
    await ensureNotArchived(existing.transferId);

    const transfer = await prisma.transferApplication.findUnique({
      where: { id: existing.transferId },
      select: { status: true, version: true },
    });
    if (!transfer) throw new BusinessException('申请不存在', 404);

    const { status, confirmedById, compensationNote, compensationFee, remark, ...rest } = req.body;
    const updateData: any = { ...rest };
    delete updateData.version;
    delete updateData.expectedVersion;

    if (transfer.status === TransferStatus.RETURNED_FOR_CORRECTION) {
      if (!existing.returnedReason && existing.confirmedVersion) {
        throw new BusinessException('退回补正阶段仅可修改被退回的资产，已确认项不可修改');
      }
    }

    if (status !== undefined) {
      const validStatuses = Object.values(AssetStatus);
      if (!validStatuses.includes(status as AssetStatus)) {
        throw new BusinessException(`状态值无效，必须为: ${validStatuses.join(', ')}`);
      }

      if (status === AssetStatus.MISSING) {
        if (!compensationNote || String(compensationNote).trim() === '') {
          throw new BusinessException('标记资产缺失时必须填写 compensationNote 赔付备注');
        }
        updateData.compensationNote = compensationNote;
        if (compensationFee !== undefined && compensationFee !== null) {
          updateData.compensationFee = compensationFee;
        }
        if (remark !== undefined) updateData.remark = remark;
        updateData.status = status;
      } else if (status === AssetStatus.COMPENSATED) {
        await assertIsAssetAdmin(req.user.role);
        await assertIsNotPermissionAdminForAsset(req.user.role);
        if (compensationFee === undefined || compensationFee === null) {
          throw new BusinessException('标记已赔付时必须提供 compensationFee 赔付金额');
        }
        updateData.compensationFee = compensationFee;
        if (compensationNote !== undefined) updateData.compensationNote = compensationNote;
        if (!confirmedById) throw new BusinessException('已赔付确认必须提供 confirmedById');
        updateData.confirmedById = confirmedById;
        updateData.confirmedAt = new Date();
        updateData.confirmedVersion = transfer.version;
        if (remark !== undefined) updateData.remark = remark;
        updateData.status = status;
      } else if (status === AssetStatus.RETURNED) {
        if (!confirmedById) throw new BusinessException('归还确认必须提供 confirmedById');
        updateData.confirmedById = confirmedById;
        updateData.confirmedAt = new Date();
        updateData.confirmedVersion = transfer.version;
        if (remark !== undefined) updateData.remark = remark;
        updateData.status = status;
      } else {
        updateData.status = status;
        if (remark !== undefined) updateData.remark = remark;
      }
    } else {
      if (compensationNote !== undefined) {
        await assertIsAssetAdmin(req.user.role);
        await assertIsNotPermissionAdminForAsset(req.user.role);
        updateData.compensationNote = compensationNote;
      }
      if (compensationFee !== undefined) {
        await assertIsAssetAdmin(req.user.role);
        await assertIsNotPermissionAdminForAsset(req.user.role);
        updateData.compensationFee = compensationFee;
      }
      if (remark !== undefined) updateData.remark = remark;
    }

    await prisma.$transaction([
      prisma.assetHandover.update({ where: { id: assetId }, data: updateData }),
      prisma.transferApplication.update({
        where: { id: existing.transferId },
        data: { version: { increment: 1 } },
      }),
      prisma.auditLog.create({
        data: {
          transferId: existing.transferId,
          userId: req.user.id,
          action: status === AssetStatus.RETURNED || status === AssetStatus.COMPENSATED ? 'CONFIRM' : 'UPDATE',
          entityType: 'AssetHandover',
          entityId: assetId,
          detail: `资产: ${existing.assetName}(${existing.assetCode}) 状态变更为 ${status || 'UPDATE'}`,
          version: transfer.version + 1,
        },
      }),
    ]);

    const updated = await prisma.assetHandover.findUnique({
      where: { id: assetId },
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
    requirePermission(req.user.role, 'asset', 'delete');

    const asset = await prisma.assetHandover.findUnique({
      where: { id: req.params.id },
      select: { transferId: true },
    });
    if (!asset) return res.status(404).json({ success: false, message: '资产不存在' });
    await ensureNotArchived(asset.transferId);

    await prisma.assetHandover.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: '删除成功' });
  } catch (e) {
    next(e);
  }
});

export default router;
