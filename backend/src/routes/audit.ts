import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../index.js';
import { AuditAction, UserRole } from '@prisma/client';
import { BusinessException } from '../middleware/errorHandler.js';
import { requirePermission } from '../services/permissionMatrixService.js';
import { getTimeline } from '../services/auditService.js';

const router = Router();

router.get('/logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'audit', 'read');

    const { transferId, userId, action, entityType, startDate, endDate, page, pageSize } =
      req.query;
    const where: any = {};
    if (transferId) where.transferId = String(transferId);
    if (userId) where.userId = String(userId);
    if (action) where.action = String(action) as AuditAction;
    if (entityType) where.entityType = String(entityType);
    if (startDate || endDate) {
      where.createdAt = {} as any;
      if (startDate) where.createdAt.gte = new Date(String(startDate));
      if (endDate) where.createdAt.lte = new Date(String(endDate));
    }

    const take = Number(pageSize) || 50;
    const skip = ((Number(page) || 1) - 1) * take;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: true, transfer: { select: { transferNo: true, title: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ success: true, data: { list: logs, total, page: page || 1, pageSize: take } });
  } catch (e) {
    next(e);
  }
});

router.get('/timeline/:transferId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'transfer', 'read');

    const events = await getTimeline(req.params.transferId);
    res.json({ success: true, data: events });
  } catch (e) {
    next(e);
  }
});

router.get('/export/:transferId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'audit', 'export');

    const transfer = await prisma.transferApplication.findUnique({
      where: { id: req.params.transferId },
      include: {
        fromEmployee: true,
        toEmployee: true,
        creator: true,
        approver: true,
        checklistItems: { orderBy: { sortOrder: 'asc' }, include: { confirmedBy: true } },
        assets: { include: { confirmedBy: true } },
        permissions: { include: { firstConfirmer: true, secondConfirmer: true, transferredTo: true } },
        approvals: { orderBy: { approvedAt: 'desc' }, include: { approver: true } },
        auditLogs: { orderBy: { createdAt: 'asc' }, include: { user: true } },
      },
    });
    if (!transfer) throw new BusinessException('转岗申请不存在', 404);

    const lines: string[] = [];
    lines.push('='.repeat(80));
    lines.push(`转岗交接清单导出 - ${transfer.transferNo}`);
    lines.push(`标题: ${transfer.title}`);
    lines.push(`状态: ${transfer.status} | 版本: ${transfer.version}`);
    lines.push(`生效日期: ${transfer.effectiveDate.toISOString().slice(0, 10)}`);
    lines.push(`交出人: ${transfer.fromEmployee.name}(${transfer.fromEmployee.employeeCode}) | ${transfer.fromDepartment} - ${transfer.fromPosition}`);
    lines.push(`接收人: ${transfer.toEmployee.name}(${transfer.toEmployee.employeeCode}) | ${transfer.toDepartment} - ${transfer.toPosition}`);
    lines.push(`创建人: ${transfer.creator.name} | 主管: ${transfer.approver?.name || '待定'}`);
    if (transfer.reason) lines.push(`转岗原因: ${transfer.reason}`);
    if (transfer.remark) lines.push(`备注: ${transfer.remark}`);
    if (transfer.returnedReason) lines.push(`退回原因: ${transfer.returnedReason}`);
    lines.push('='.repeat(80));
    lines.push('');
    lines.push('【一、交接清单】');
    transfer.checklistItems.forEach((it, idx) => {
      lines.push(
        `${idx + 1}. [${it.category}] ${it.itemName}${it.isCritical ? ' [关键]' : ''} - 状态: ${it.status}${it.confirmedBy ? ` | 确认人: ${it.confirmedBy.name} @ ${it.confirmedAt?.toISOString().slice(0, 19)}` : ''}`
      );
      if (it.description) lines.push(`   说明: ${it.description}`);
      if (it.confirmedRemark) lines.push(`   备注: ${it.confirmedRemark}`);
    });
    lines.push('');
    lines.push('【二、资产盘点】');
    transfer.assets.forEach((a, idx) => {
      lines.push(
        `${idx + 1}. ${a.assetName} (${a.assetCode}) | 类别: ${a.category} | 规格: ${a.specification || '-'} | 数量: ${a.quantity} | 状态: ${a.status}${a.confirmedBy ? ` | 确认人: ${a.confirmedBy.name} @ ${a.confirmedAt?.toISOString().slice(0, 19)}` : ''}`
      );
      if (a.status === 'MISSING' || a.status === 'COMPENSATED') {
        lines.push(`   赔付备注: ${a.compensationNote || '-'}`);
        if (a.compensationFee) lines.push(`   赔付金额: ¥${a.compensationFee}`);
      }
      if (a.remark) lines.push(`   备注: ${a.remark}`);
    });
    lines.push('');
    lines.push('【三、权限移交】');
    transfer.permissions.forEach((p, idx) => {
      lines.push(
        `${idx + 1}. ${p.systemName} - ${p.permissionName} (${p.permissionScope || '-'}) | 状态: ${p.status}`
      );
      if (p.firstConfirmer)
        lines.push(
          `   第一确认: ${p.firstConfirmer.name} @ ${p.firstConfirmedAt?.toISOString().slice(0, 19)}`
        );
      if (p.secondConfirmer)
        lines.push(
          `   第二确认: ${p.secondConfirmer.name} @ ${p.secondConfirmedAt?.toISOString().slice(0, 19)}`
        );
      if (p.transferredTo) lines.push(`   移交至: ${p.transferredTo.name}`);
    });
    lines.push('');
    lines.push('【四、审批记录】');
    transfer.approvals.forEach((a, idx) => {
      lines.push(
        `${idx + 1}. ${a.approver.name} @ ${a.approvedAt.toISOString().slice(0, 19)} | 决策: ${a.decision}${a.comment ? ` | 意见: ${a.comment}` : ''}`
      );
    });
    lines.push('');
    lines.push('【五、审计日志】');
    transfer.auditLogs.forEach((l, idx) => {
      lines.push(
        `${idx + 1}. ${l.createdAt.toISOString().slice(0, 19)} | ${l.user?.name || 'System'} | ${l.action} | ${l.entityType} | ${l.detail || ''}`
      );
    });
    lines.push('');
    lines.push('='.repeat(80));
    lines.push(`导出时间: ${new Date().toISOString()}`);
    lines.push('='.repeat(80));

    const csvContent = lines.join('\n');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="transfer-${transfer.transferNo}.txt"`
    );
    res.send(csvContent);
  } catch (e) {
    next(e);
  }
});

router.get('/export-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'audit', 'export');

    const { status, fromDate, toDate } = req.query;
    const where: any = {};
    if (status) where.status = String(status);
    if (fromDate || toDate) {
      where.createdAt = {} as any;
      if (fromDate) where.createdAt.gte = new Date(String(fromDate));
      if (toDate) where.createdAt.lte = new Date(String(toDate));
    }

    const transfers = await prisma.transferApplication.findMany({
      where,
      include: {
        fromEmployee: true,
        toEmployee: true,
        approver: true,
        _count: { select: { checklistItems: true, assets: true, permissions: true, approvals: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    let csv = '申请编号,标题,状态,交出人,接收人,主管,生效日期,创建日期,交接项数,资产数,权限数,审批数\n';
    transfers.forEach((t) => {
      csv += [
        t.transferNo,
        `"${t.title.replace(/"/g, '""')}"`,
        t.status,
        t.fromEmployee.name,
        t.toEmployee.name,
        t.approver?.name || '',
        t.effectiveDate.toISOString().slice(0, 10),
        t.createdAt.toISOString().slice(0, 10),
        t._count.checklistItems,
        t._count.assets,
        t._count.permissions,
        t._count.approvals,
      ].join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="transfers-export-${Date.now()}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (e) {
    next(e);
  }
});

router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'audit', 'read');

    const [byStatus, total, missingAssets, unconfirmedCritical] = await Promise.all([
      prisma.transferApplication.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.transferApplication.count(),
      prisma.assetHandover.count({ where: { status: 'MISSING' } }),
      prisma.checklistItem.count({
        where: { isCritical: true, status: { notIn: ['CONFIRMED', 'NOT_APPLICABLE'] } },
      }),
    ]);

    res.json({
      success: true,
      data: {
        total,
        byStatus,
        missingAssets,
        unconfirmedCritical,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.get('/templates', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const templates = await prisma.positionTemplate.findMany({
      orderBy: [{ position: 'asc' }, { category: 'asc' }, { sortOrder: 'asc' }],
    });
    res.json({ success: true, data: templates });
  } catch (e) {
    next(e);
  }
});

export default router;
