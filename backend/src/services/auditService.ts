import { PrismaClient, AuditAction } from '@prisma/client';

const prisma = new PrismaClient();

export async function logAudit(params: {
  transferId?: string;
  userId?: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  oldValue?: any;
  newValue?: any;
  ipAddress?: string;
  userAgent?: string;
  detail?: string;
  version?: number;
}) {
  try {
    return prisma.auditLog.create({
      data: {
        transferId: params.transferId || null,
        userId: params.userId || null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId || null,
        oldValue: params.oldValue || null,
        newValue: params.newValue || null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        detail: params.detail || null,
        version: params.version || null,
      },
    });
  } catch (e) {
    console.error('Audit log error:', e);
    return null;
  }
}

export async function getTimeline(transferId: string) {
  const [audits, approvals, confirmations] = await Promise.all([
    prisma.auditLog.findMany({
      where: { transferId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.approvalRecord.findMany({
      where: { transferId },
      include: { approver: true },
      orderBy: { approvedAt: 'asc' },
    }),
    prisma.transferApplication.findUnique({
      where: { id: transferId },
      include: {
        checklistItems: { include: { confirmedBy: true } },
        assets: { include: { confirmedBy: true } },
        permissions: {
          include: { firstConfirmer: true, secondConfirmer: true },
        },
      },
    }),
  ]);

  const events: any[] = [];

  audits.forEach((a) => {
    events.push({
      type: a.action,
      time: a.createdAt,
      user: a.user?.name || 'System',
      detail: a.detail || `${a.action} ${a.entityType}`,
      version: a.version,
    });
  });

  approvals.forEach((ap) => {
    events.push({
      type: ap.decision,
      time: ap.approvedAt,
      user: ap.approver.name,
      detail: `${ap.decision}: ${ap.comment || ''}`,
    });
  });

  if (confirmations) {
    confirmations.checklistItems.forEach((it) => {
      if (it.confirmedAt && it.confirmedBy) {
        events.push({
          type: 'CONFIRM_CHECKLIST',
          time: it.confirmedAt,
          user: it.confirmedBy.name,
          detail: `确认交接项: ${it.itemName}`,
        });
      }
    });
    confirmations.assets.forEach((a) => {
      if (a.confirmedAt && a.confirmedBy) {
        events.push({
          type: 'CONFIRM_ASSET',
          time: a.confirmedAt,
          user: a.confirmedBy.name,
          detail: `确认资产: ${a.assetName} (${a.status})`,
        });
      }
    });
    confirmations.permissions.forEach((p) => {
      if (p.firstConfirmedAt && p.firstConfirmer) {
        events.push({
          type: 'FIRST_CONFIRM_PERM',
          time: p.firstConfirmedAt,
          user: p.firstConfirmer.name,
          detail: `第一确认权限: ${p.systemName}-${p.permissionName}`,
        });
      }
      if (p.secondConfirmedAt && p.secondConfirmer) {
        events.push({
          type: 'SECOND_CONFIRM_PERM',
          time: p.secondConfirmedAt,
          user: p.secondConfirmer.name,
          detail: `第二确认权限: ${p.systemName}-${p.permissionName}`,
        });
      }
    });
  }

  events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  return events;
}
