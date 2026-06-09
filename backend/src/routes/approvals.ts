import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../index.js';
import { ApprovalDecision, TransferStatus, UserRole } from '@prisma/client';
import { BusinessException } from '../middleware/errorHandler.js';
import { requirePermission } from '../services/permissionMatrixService.js';
import { ensureNotArchived } from '../middleware/versionMiddleware.js';
import { saveIdempotencyResponse } from '../middleware/idempotencyMiddleware.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/:transferId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'approval', 'read');

    const approvals = await prisma.approvalRecord.findMany({
      where: { transferId: req.params.transferId },
      orderBy: { approvedAt: 'desc' },
      include: { approver: true },
    });
    res.json({ success: true, data: approvals });
  } catch (e) {
    next(e);
  }
});

router.post('/:transferId/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'approval', 'approve');

    const { transferId } = req.params;
    const { comment, version } = req.body;
    const approverId = req.user.id;

    await ensureNotArchived(transferId);

    const transfer = await prisma.transferApplication.findUnique({
      where: { id: transferId },
      select: { status: true, version: true },
    });
    if (!transfer) return res.status(404).json({ success: false, message: '转岗申请不存在' });

    if (
      transfer.status !== TransferStatus.MANAGER_APPROVAL &&
      transfer.status !== TransferStatus.PENDING_ARCHIVE
    ) {
      throw new BusinessException(
        `当前状态为 ${transfer.status}，仅 MANAGER_APPROVAL / PENDING_ARCHIVE 状态可审批`
      );
    }

    if (version !== undefined && Number(version) !== transfer.version) {
      throw new BusinessException(
        `版本不匹配: 当前=${transfer.version}, 传入=${version}`,
        409,
        'VERSION_MISMATCH'
      );
    }

    const idempotencyKey = req.idempotencyKey || uuidv4();

    const existing = await prisma.approvalRecord.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      const updated = await prisma.transferApplication.findUnique({
        where: { id: transferId },
        include: { approvals: { orderBy: { approvedAt: 'desc' }, include: { approver: true } } },
      });
      return res.json({
        success: true,
        data: updated,
        message: '审批通过，已归档（幂等返回）',
        idempotent: true,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const approval = await tx.approvalRecord.create({
        data: {
          transferId,
          approverId,
          comment: comment || null,
          decision: ApprovalDecision.APPROVED,
          idempotencyKey,
          version: transfer.version + 1,
        },
      });

      const updated = await tx.transferApplication.update({
        where: { id: transferId, version: transfer.version },
        data: {
          approverId,
          status:
            transfer.status === TransferStatus.MANAGER_APPROVAL
              ? TransferStatus.PENDING_ARCHIVE
              : TransferStatus.ARCHIVED,
          version: { increment: 1 },
          archivedAt:
            transfer.status === TransferStatus.PENDING_ARCHIVE ? new Date() : undefined,
        },
        include: { approvals: { orderBy: { approvedAt: 'desc' }, include: { approver: true } } },
      });

      await tx.auditLog.create({
        data: {
          transferId,
          userId: approverId,
          action: 'APPROVE',
          entityType: 'ApprovalRecord',
          entityId: approval.id,
          detail: `主管审批通过: ${comment || ''}`,
          version: transfer.version + 1,
        },
      });

      return { approval, updated };
    });

    const response = {
      success: true,
      data: result.updated,
      message:
        transfer.status === TransferStatus.MANAGER_APPROVAL
          ? '审批通过，进入待归档'
          : '审批通过，已归档',
    };

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

router.post('/:transferId/reject', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'approval', 'reject');

    const { transferId } = req.params;
    const { comment, version } = req.body;
    const approverId = req.user.id;

    if (!comment || String(comment).trim() === '') {
      throw new BusinessException('驳回必须填写 comment 驳回原因');
    }

    await ensureNotArchived(transferId);

    const transfer = await prisma.transferApplication.findUnique({
      where: { id: transferId },
      select: { status: true, version: true, remark: true },
    });
    if (!transfer) return res.status(404).json({ success: false, message: '转岗申请不存在' });

    if (transfer.status !== TransferStatus.MANAGER_APPROVAL) {
      throw new BusinessException(`当前状态为 ${transfer.status}，仅 MANAGER_APPROVAL 可驳回`);
    }

    if (version !== undefined && Number(version) !== transfer.version) {
      throw new BusinessException(
        `版本不匹配: 当前=${transfer.version}, 传入=${version}`,
        409,
        'VERSION_MISMATCH'
      );
    }

    const idempotencyKey = req.idempotencyKey || uuidv4();
    const existing = await prisma.approvalRecord.findUnique({ where: { idempotencyKey } });
    if (existing) {
      const updated = await prisma.transferApplication.findUnique({
        where: { id: transferId },
        include: { approvals: { orderBy: { approvedAt: 'desc' }, include: { approver: true } } },
      });
      return res.json({
        success: true,
        data: updated,
        message: '已驳回（幂等返回）',
        idempotent: true,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const approval = await tx.approvalRecord.create({
        data: {
          transferId,
          approverId,
          comment,
          decision: ApprovalDecision.REJECTED,
          idempotencyKey,
          version: transfer.version + 1,
        },
      });

      const updated = await tx.transferApplication.update({
        where: { id: transferId, version: transfer.version },
        data: {
          approverId,
          status: TransferStatus.RETURNED_FOR_CORRECTION,
          version: { increment: 1 },
          returnedReason: comment,
          returnedAt: new Date(),
          remark: transfer.remark
            ? `${transfer.remark}; 驳回原因: ${comment}`
            : `驳回原因: ${comment}`,
        },
        include: { approvals: { orderBy: { approvedAt: 'desc' }, include: { approver: true } } },
      });

      await tx.auditLog.create({
        data: {
          transferId,
          userId: approverId,
          action: 'RETURN',
          entityType: 'ApprovalRecord',
          entityId: approval.id,
          detail: `主管退回补正: ${comment}`,
          version: transfer.version + 1,
        },
      });

      return { approval, updated };
    });

    const response = {
      success: true,
      data: result.updated,
      message: '已退回补正，请根据退回意见修改',
    };
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

export default router;
