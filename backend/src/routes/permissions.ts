import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../index.js';
import { PermissionStatus, UserRole, TransferStatus } from '@prisma/client';
import { BusinessException } from '../middleware/errorHandler.js';
import {
  requirePermission,
  assertDifferentUsers,
  assertIsNotAssetAdminForPermission,
} from '../services/permissionMatrixService.js';
import { ensureNotArchived } from '../middleware/versionMiddleware.js';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'permission', 'read');

    const { transferId, status } = req.query;
    const where: any = {};
    if (transferId) where.transferId = String(transferId);
    if (status) where.status = String(status) as PermissionStatus;

    const permissions = await prisma.permissionConfirmation.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        firstConfirmer: true,
        secondConfirmer: true,
        transferredTo: true,
      },
    });
    res.json({ success: true, data: permissions });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'permission', 'read');

    const permission = await prisma.permissionConfirmation.findUnique({
      where: { id: req.params.id },
      include: {
        firstConfirmer: true,
        secondConfirmer: true,
        transferredTo: true,
        transfer: true,
      },
    });
    if (!permission) return res.status(404).json({ success: false, message: '权限条目不存在' });
    res.json({ success: true, data: permission });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'permission', 'create');

    const items = Array.isArray(req.body) ? req.body : [req.body];
    if (!items.every((it: any) => it.transferId && it.systemName && it.permissionName)) {
      return res.status(400).json({ success: false, message: '每条记录必须包含 transferId, systemName, permissionName' });
    }
    const created = await prisma.$transaction(
      items.map((it: any) => prisma.permissionConfirmation.create({ data: it }))
    );
    res.status(201).json({ success: true, data: created });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/first-confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'permission', 'confirm');
    await assertIsNotAssetAdminForPermission(req.user.role);

    const { confirmerId, remark } = req.body;
    if (!confirmerId) throw new BusinessException('第一确认必须提供 confirmerId');

    const perm = await prisma.permissionConfirmation.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        transferId: true,
        status: true,
        systemName: true,
        permissionName: true,
        firstConfirmerId: true,
        firstConfirmVersion: true,
        returnedReason: true,
      },
    });
    if (!perm) return res.status(404).json({ success: false, message: '权限条目不存在' });
    await ensureNotArchived(perm.transferId);

    const transfer = await prisma.transferApplication.findUnique({
      where: { id: perm.transferId },
      select: { status: true, version: true, fromEmployeeId: true, toEmployeeId: true },
    });
    if (!transfer) throw new BusinessException('申请不存在', 404);

    if (
      transfer.status === TransferStatus.RETURNED_FOR_CORRECTION &&
      perm.firstConfirmVersion &&
      !perm.returnedReason
    ) {
      throw new BusinessException('退回补正阶段已确认项不可重新确认');
    }

    if (perm.status !== PermissionStatus.TO_BE_TRANSFERRED) {
      throw new BusinessException(
        `当前状态为 ${perm.status}，仅 TO_BE_TRANSFERRED 可第一确认`
      );
    }

    if (
      confirmerId !== transfer.fromEmployeeId &&
      confirmerId !== transfer.toEmployeeId &&
      req.user.role !== UserRole.PERMISSION_ADMIN
    ) {
      throw new BusinessException('第一确认必须为交出人、接收人或权限管理员');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.permissionConfirmation.update({
        where: { id: req.params.id },
        data: {
          status: PermissionStatus.FIRST_CONFIRMED,
          firstConfirmerId: confirmerId,
          firstConfirmedAt: new Date(),
          firstConfirmVersion: transfer.version,
          remark: remark !== undefined ? remark : undefined,
        },
        include: { firstConfirmer: true, secondConfirmer: true, transferredTo: true },
      });
      await tx.transferApplication.update({
        where: { id: perm.transferId },
        data: { version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          transferId: perm.transferId,
          userId: req.user!.id,
          action: 'CONFIRM',
          entityType: 'PermissionConfirmation',
          entityId: req.params.id,
          detail: `权限第一确认: ${perm.systemName}-${perm.permissionName}`,
          version: transfer.version + 1,
        },
      });
      return result;
    });

    res.json({ success: true, data: updated, message: '第一确认完成' });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/second-confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'permission', 'confirm');
    await assertIsNotAssetAdminForPermission(req.user.role);

    const { confirmerId: secondConfirmerId, transferredToId, remark } = req.body;
    if (!secondConfirmerId) throw new BusinessException('第二确认必须提供 confirmerId');

    const perm = await prisma.permissionConfirmation.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        transferId: true,
        status: true,
        systemName: true,
        permissionName: true,
        firstConfirmerId: true,
        secondConfirmVersion: true,
        returnedReason: true,
      },
    });
    if (!perm) return res.status(404).json({ success: false, message: '权限条目不存在' });
    await ensureNotArchived(perm.transferId);

    const transfer = await prisma.transferApplication.findUnique({
      where: { id: perm.transferId },
      select: { status: true, version: true, fromEmployeeId: true, toEmployeeId: true },
    });
    if (!transfer) throw new BusinessException('申请不存在', 404);

    if (perm.status !== PermissionStatus.FIRST_CONFIRMED) {
      throw new BusinessException(
        `当前状态为 ${perm.status}，仅 FIRST_CONFIRMED 可第二确认`
      );
    }

    await assertDifferentUsers(perm.firstConfirmerId, secondConfirmerId);

    if (
      secondConfirmerId !== transfer.fromEmployeeId &&
      secondConfirmerId !== transfer.toEmployeeId &&
      req.user.role !== UserRole.PERMISSION_ADMIN
    ) {
      throw new BusinessException('第二确认必须为交出人、接收人或权限管理员');
    }

    if (perm.firstConfirmerId === secondConfirmerId) {
      throw new BusinessException('第二确认人不能与第一确认人相同，需双人确认');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.permissionConfirmation.update({
        where: { id: req.params.id },
        data: {
          status: PermissionStatus.TRANSFERRED,
          secondConfirmerId,
          secondConfirmedAt: new Date(),
          secondConfirmVersion: transfer.version,
          transferredToId: transferredToId || transfer.toEmployeeId,
          remark: remark !== undefined ? remark : undefined,
        },
        include: { firstConfirmer: true, secondConfirmer: true, transferredTo: true },
      });
      await tx.transferApplication.update({
        where: { id: perm.transferId },
        data: { version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          transferId: perm.transferId,
          userId: req.user!.id,
          action: 'CONFIRM',
          entityType: 'PermissionConfirmation',
          entityId: req.params.id,
          detail: `权限第二确认(移交完成): ${perm.systemName}-${perm.permissionName}`,
          version: transfer.version + 1,
        },
      });
      return result;
    });

    res.json({ success: true, data: updated, message: '第二确认完成，权限已移交' });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'permission', 'delete');

    const perm = await prisma.permissionConfirmation.findUnique({
      where: { id: req.params.id },
      select: { transferId: true },
    });
    if (!perm) return res.status(404).json({ success: false, message: '权限条目不存在' });
    await ensureNotArchived(perm.transferId);

    await prisma.permissionConfirmation.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: '删除成功' });
  } catch (e) {
    next(e);
  }
});

export default router;
