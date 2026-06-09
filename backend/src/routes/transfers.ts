import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../index.js';
import { TransferStatus, UserRole } from '@prisma/client';
import {
  BusinessException,
  VersionMismatchException,
  ArchivedModificationException,
  NotFoundException,
} from '../middleware/errorHandler.js';
import { generateTransferNo, advanceStatus, getNextStatus } from '../services/transferService.js';
import { generateChecklistFromTemplate } from '../services/positionTemplateService.js';
import {
  requirePermission,
  assertIsHandoverOrReceiver,
} from '../services/permissionMatrixService.js';
import { checkTransferVersion, ensureNotArchived } from '../middleware/versionMiddleware.js';
import { saveIdempotencyResponse } from '../middleware/idempotencyMiddleware.js';

const router = Router();

const includeAll = {
  fromEmployee: true,
  toEmployee: true,
  creator: true,
  approver: true,
  checklistItems: { orderBy: { sortOrder: 'asc' }, include: { confirmedBy: true } },
  assets: { include: { confirmedBy: true } },
  permissions: {
    include: {
      firstConfirmer: true,
      secondConfirmer: true,
      transferredTo: true,
    },
  },
  approvals: { orderBy: { approvedAt: 'desc' }, include: { approver: true } },
  auditLogs: { orderBy: { createdAt: 'desc' }, take: 50, include: { user: true } },
};

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'transfer', 'read');

    const { status, fromEmployeeId, toEmployeeId, creatorId, risk, keyword, page, pageSize } =
      req.query;
    const where: any = {};
    if (status) where.status = String(status) as TransferStatus;
    if (fromEmployeeId) where.fromEmployeeId = String(fromEmployeeId);
    if (toEmployeeId) where.toEmployeeId = String(toEmployeeId);
    if (creatorId) where.creatorId = String(creatorId);
    if (keyword) {
      where.OR = [
        { title: { contains: String(keyword) } },
        { transferNo: { contains: String(keyword) } },
        { reason: { contains: String(keyword) } },
      ];
    }
    if (risk === 'has_missing_asset') {
      where.assets = { some: { status: 'MISSING' } };
    } else if (risk === 'has_unconfirmed_critical') {
      where.checklistItems = {
        some: { isCritical: true, status: { notIn: ['CONFIRMED', 'NOT_APPLICABLE'] } },
      };
    }

    if (req.user.role === UserRole.HANDOVER) {
      where.fromEmployeeId = req.user.id;
    } else if (req.user.role === UserRole.RECEIVER) {
      where.toEmployeeId = req.user.id;
    }

    const take = Number(pageSize) || 20;
    const skip = ((Number(page) || 1) - 1) * take;

    const [transfers, total] = await Promise.all([
      prisma.transferApplication.findMany({
        where,
        include: {
          fromEmployee: true,
          toEmployee: true,
          creator: true,
          approver: true,
          _count: { select: { checklistItems: true, assets: true, permissions: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.transferApplication.count({ where }),
    ]);

    res.json({ success: true, data: { list: transfers, total, page: page || 1, pageSize: take } });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'transfer', 'read');

    const transfer = await prisma.transferApplication.findUnique({
      where: { id: req.params.id },
      include: includeAll,
    });
    if (!transfer) {
      return res.status(404).json({ success: false, message: '转岗申请不存在' });
    }
    res.json({ success: true, data: transfer });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'transfer', 'create');

    const body = req.body;
    const required = [
      'title',
      'fromEmployeeId',
      'toEmployeeId',
      'effectiveDate',
      'fromDepartment',
      'toDepartment',
      'fromPosition',
      'toPosition',
    ];
    const missing = required.filter((f) => !body[f]);
    if (missing.length) {
      return res.status(400).json({ success: false, message: '缺少必填字段: ' + missing.join(',') });
    }

    if (body.fromEmployeeId === body.toEmployeeId) {
      throw new BusinessException('交出人和接收人不能为同一人');
    }

    const transferNo = await generateTransferNo();
    const creatorId = req.user.id;

    const transfer = await prisma.$transaction(async (tx) => {
      const created = await tx.transferApplication.create({
        data: {
          title: body.title,
          transferNo,
          fromEmployeeId: body.fromEmployeeId,
          toEmployeeId: body.toEmployeeId,
          creatorId,
          approverId: body.approverId || null,
          effectiveDate: new Date(body.effectiveDate),
          status: TransferStatus.DRAFT,
          fromDepartment: body.fromDepartment,
          toDepartment: body.toDepartment,
          fromPosition: body.fromPosition,
          toPosition: body.toPosition,
          reason: body.reason || null,
          remark: body.remark || null,
        },
      });

      if (body.useTemplate !== false) {
        await generateChecklistFromTemplate(
          created.id,
          body.toPosition,
          body.toDepartment,
          body.fromPosition,
          body.fromDepartment
        );
      }

      if (Array.isArray(body.checklistItems) && body.checklistItems.length) {
        await tx.checklistItem.createMany({ data: body.checklistItems.map((it: any, idx: number) => ({ ...it, transferId: created.id, sortOrder: (it.sortOrder || idx) + 100 })) });
      }
      if (Array.isArray(body.assets) && body.assets.length) {
        await tx.assetHandover.createMany({ data: body.assets.map((it: any) => ({ ...it, transferId: created.id })) });
      }
      if (Array.isArray(body.permissions) && body.permissions.length) {
        await tx.permissionConfirmation.createMany({ data: body.permissions.map((it: any) => ({ ...it, transferId: created.id })) });
      }

      await tx.auditLog.create({
        data: {
          transferId: created.id,
          userId: creatorId,
          action: 'CREATE',
          entityType: 'TransferApplication',
          entityId: created.id,
          detail: `创建转岗申请: ${transferNo}`,
          version: 1,
        },
      });

      return tx.transferApplication.findUnique({
        where: { id: created.id },
        include: includeAll,
      });
    });

    const response = { success: true, data: transfer };
    if (req.idempotencyKey) {
      await saveIdempotencyResponse(
        req.idempotencyKey,
        req.method,
        req.originalUrl,
        (transfer as any)?.id,
        201,
        response
      );
    }
    res.status(201).json(response);
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'transfer', 'update');

    const transferId = req.params.id;
    await ensureNotArchived(transferId);

    const body = req.body;
    const expectedVersion = body.expectedVersion != null ? Number(body.expectedVersion) : body.version != null ? Number(body.version) : undefined;
    await checkTransferVersion(transferId, expectedVersion);

    const transfer = await prisma.transferApplication.findUnique({
      where: { id: transferId },
      select: { status: true, version: true },
    });
    if (!transfer) throw new BusinessException('转岗申请不存在', 404);

    if (transfer.status === TransferStatus.RETURNED_FOR_CORRECTION) {
      const editable = ['title', 'reason', 'remark', 'effectiveDate'];
      Object.keys(body).forEach((k) => {
        if (k !== 'version' && k !== 'expectedVersion' && !editable.includes(k)) {
          delete (body as any)[k];
        }
      });
    }

    const updateData: any = { ...body };
    delete updateData.version;
    delete updateData.expectedVersion;
    delete updateData.status;
    if (body.effectiveDate) updateData.effectiveDate = new Date(body.effectiveDate);
    updateData.version = { increment: 1 };

    const updated = await prisma.transferApplication.update({
      where: { id: transferId },
      data: updateData,
      include: includeAll,
    });

    res.json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'transfer', 'delete');

    const transferId = req.params.id;
    await ensureNotArchived(transferId);

    await prisma.transferApplication.delete({ where: { id: transferId } });
    res.json({ success: true, message: '删除成功' });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/advance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'transfer', 'advance');

    const transferId = req.params.id;
    const { targetStatus, version } = req.body;
    await ensureNotArchived(transferId);
    await checkTransferVersion(transferId, version != null ? Number(version) : undefined);

    const current = await prisma.transferApplication.findUnique({
      where: { id: transferId },
      select: { status: true },
    });
    if (!current) throw new BusinessException('转岗申请不存在', 404);

    let next = targetStatus as TransferStatus;
    if (!next) {
      const s = getNextStatus(current.status);
      if (!s) throw new BusinessException('当前状态无法继续推进');
      next = s;
    }

    const updated = await advanceStatus(transferId, next, req.user.id);
    const response = { success: true, data: updated, message: `已推进至 ${next}` };

    if (req.idempotencyKey) {
      await saveIdempotencyResponse(
        req.idempotencyKey,
        req.method,
        req.originalUrl,
        transferId,
        200,
        response
      );
    }
    res.json(response);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/archive', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'transfer', 'archive');

    const transferId = req.params.id;
    const { version } = req.body;
    await checkTransferVersion(transferId, version != null ? Number(version) : undefined);
    const updated = await advanceStatus(transferId, TransferStatus.ARCHIVED, req.user.id);
    res.json({ success: true, data: updated, message: '已归档' });
  } catch (e) {
    next(e);
  }
});

export default router;
