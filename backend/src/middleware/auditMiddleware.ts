import { Request, Response, NextFunction } from 'express';
import { PrismaClient, AuditAction } from '@prisma/client';

const prisma = new PrismaClient();

const ACTION_MAP: Record<string, AuditAction> = {
  POST: AuditAction.CREATE,
  PUT: AuditAction.UPDATE,
  DELETE: AuditAction.DELETE,
};

export function auditMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  if (req.method === 'GET') return next();

  const originalJson = _res.json.bind(_res);
  let responseBody: any;

  _res.json = ((body: any) => {
    responseBody = body;
    return originalJson(body);
  }) as any;

  _res.on('finish', async () => {
    try {
      if (!req.user) return;
      if (_res.statusCode >= 400) return;

      const method = req.method;
      if (!['POST', 'PUT', 'DELETE'].includes(method)) return;

      const url = req.baseUrl + req.path;
      let entityType = 'Unknown';
      let transferId: string | undefined;
      let entityId: string | undefined;

      if (url.includes('/transfers')) {
        entityType = 'TransferApplication';
        transferId = req.params.id;
        entityId = responseBody?.data?.id || transferId;
      } else if (url.includes('/checklist')) {
        entityType = 'ChecklistItem';
        entityId = req.params.id;
        transferId = (req.body?.transferId) || (responseBody?.data?.transferId);
      } else if (url.includes('/assets')) {
        entityType = 'AssetHandover';
        entityId = req.params.id;
        transferId = (req.body?.transferId) || (responseBody?.data?.transferId);
      } else if (url.includes('/permissions')) {
        entityType = 'PermissionConfirmation';
        entityId = req.params.id;
        transferId = (req.body?.transferId) || (responseBody?.data?.transferId);
      } else if (url.includes('/approvals')) {
        entityType = 'ApprovalRecord';
        transferId = req.params.transferId;
        entityId = responseBody?.data?.approvals?.[0]?.id;
      }

      if (!entityId && !transferId && url.includes('/transfers') && method === 'POST') {
        entityId = responseBody?.data?.id;
        transferId = entityId;
      }

      await prisma.auditLog.create({
        data: {
          transferId: transferId || null,
          userId: req.user.id,
          action: ACTION_MAP[method] || AuditAction.UPDATE,
          entityType,
          entityId: entityId || null,
          oldValue: null,
          newValue: (responseBody?.data as any) || null,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] || null,
          detail: `${method} ${url}`,
          version: responseBody?.data?.version ? Number(responseBody.data.version) : null,
        },
      });
    } catch (e) {
      console.error('Audit log error:', e);
    }
  });

  next();
}
