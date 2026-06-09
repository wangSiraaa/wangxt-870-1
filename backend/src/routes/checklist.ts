import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../index.js';
import { ChecklistItemStatus, TransferStatus, UserRole, AuditAction } from '@prisma/client';
import { BusinessException } from '../middleware/errorHandler.js';
import { requirePermission } from '../services/permissionMatrixService.js';
import { ensureNotArchived, ensureReturnedCanEdit } from '../middleware/versionMiddleware.js';

const router = Router();

router.get('/related-query', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'checklist', 'read');

    const {
      transferId,
      fromDepartment,
      toDepartment,
      fromPosition,
      toPosition,
      fromEmployeeId,
      toEmployeeId,
      status,
      isCritical,
      category,
      keyword,
      confirmedById,
      page,
      pageSize,
    } = req.query;

    const transferWhere: any = {};
    if (transferId) transferWhere.id = String(transferId);
    if (fromDepartment) transferWhere.fromDepartment = { contains: String(fromDepartment) };
    if (toDepartment) transferWhere.toDepartment = { contains: String(toDepartment) };
    if (fromPosition) transferWhere.fromPosition = { contains: String(fromPosition) };
    if (toPosition) transferWhere.toPosition = { contains: String(toPosition) };
    if (fromEmployeeId) transferWhere.fromEmployeeId = String(fromEmployeeId);
    if (toEmployeeId) transferWhere.toEmployeeId = String(toEmployeeId);

    const checklistWhere: any = {};
    if (status) checklistWhere.status = String(status) as ChecklistItemStatus;
    if (isCritical !== undefined) checklistWhere.isCritical = isCritical === 'true';
    if (category) checklistWhere.category = { contains: String(category) };
    if (confirmedById) checklistWhere.confirmedById = String(confirmedById);
    if (keyword) {
      checklistWhere.OR = [
        { itemName: { contains: String(keyword) } },
        { description: { contains: String(keyword) } },
        { category: { contains: String(keyword) } },
      ];
    }

    const take = Number(pageSize) || 20;
    const skip = ((Number(page) || 1) - 1) * take;

    const [items, total] = await Promise.all([
      prisma.checklistItem.findMany({
        where: {
          ...checklistWhere,
          transfer: transferWhere,
        },
        include: {
          confirmedBy: true,
          transfer: {
            include: {
              fromEmployee: {
                select: { id: true, name: true, employeeCode: true, department: true, position: true, role: true },
              },
              toEmployee: {
                select: { id: true, name: true, employeeCode: true, department: true, position: true, role: true },
              },
              creator: {
                select: { id: true, name: true, employeeCode: true, department: true, position: true, role: true },
              },
              approver: {
                select: { id: true, name: true, employeeCode: true, department: true, position: true, role: true },
              },
              assets: {
                select: {
                  id: true, assetCode: true, assetName: true, category: true, status: true,
                  confirmedBy: { select: { id: true, name: true, employeeCode: true } },
                },
              },
              permissions: {
                select: {
                  id: true, systemName: true, permissionName: true, permissionScope: true, status: true,
                  firstConfirmer: { select: { id: true, name: true, employeeCode: true } },
                  secondConfirmer: { select: { id: true, name: true, employeeCode: true } },
                },
              },
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        skip,
        take,
      }),
      prisma.checklistItem.count({
        where: {
          ...checklistWhere,
          transfer: transferWhere,
        },
      }),
    ]);

    const aggStats = await prisma.checklistItem.groupBy({
      by: ['status', 'isCritical'],
      where: {
        ...checklistWhere,
        transfer: transferWhere,
      },
      _count: { id: true },
    });

    res.json({
      success: true,
      data: {
        list: items,
        total,
        page: page || 1,
        pageSize: take,
        stats: aggStats,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.post('/batch-complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new BusinessException('未授权', 401);
    requirePermission(req.user.role, 'checklist', 'update');

    const { items, expectedVersion } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: '请提供至少一条待完成的清单项' });
    }

    const itemIds = items.map((it: any) => it.id).filter(Boolean);
    if (itemIds.length === 0) {
      return res.status(400).json({ success: false, message: '每条记录必须包含 id' });
    }

    const existingItems = await prisma.checklistItem.findMany({
      where: { id: { in: itemIds } },
      select: {
        id: true, transferId: true, status: true, confirmedById: true,
        confirmedVersion: true, returnedReason: true, isCritical: true, itemName: true,
      },
    });

    if (existingItems.length !== itemIds.length) {
      const missing = itemIds.filter((id: string) => !existingItems.some((e) => e.id === id));
      return res.status(404).json({
        success: false,
        message: '部分清单条目不存在',
        failedItems: missing.map((id: string) => ({ id, error: '清单条目不存在' })),
      });
    }

    const transferIds = [...new Set(existingItems.map((e) => e.transferId))];
    if (transferIds.length > 1) {
      return res.status(400).json({
        success: false,
        message: '批量完成仅支持同一个转岗申请下的清单项',
      });
    }
    const transferId = transferIds[0];

    await ensureNotArchived(transferId);

    const transfer = await prisma.transferApplication.findUnique({
      where: { id: transferId },
      select: { status: true, version: true },
    });
    if (!transfer) throw new BusinessException('转岗申请不存在', 404);

    if (expectedVersion != null && Number(expectedVersion) !== transfer.version) {
      return res.status(409).json({
        success: false,
        message: `版本冲突: 期望 v${expectedVersion}，当前 v${transfer.version}`,
      });
    }

    const failedItems: any[] = [];
    const validItems: any[] = [];

    for (const input of items) {
      const existing = existingItems.find((e) => e.id === input.id);
      if (!existing) continue;

      const errors: string[] = [];
      const targetStatus = input.status as ChecklistItemStatus;

      if (transfer.status === TransferStatus.RETURNED_FOR_CORRECTION) {
        if (!existing.returnedReason && existing.status === ChecklistItemStatus.CONFIRMED) {
          errors.push('退回补正阶段仅可修改被退回的项目，已确认项不可修改');
        }
        if (existing.status === ChecklistItemStatus.CONFIRMED && input.confirmedById) {
          if (existing.confirmedById && input.confirmedById !== existing.confirmedById) {
            errors.push('退回补正阶段已确认项的确认人不可修改');
          }
        }
      }

      if (targetStatus !== undefined) {
        const validStatuses = Object.values(ChecklistItemStatus);
        if (!validStatuses.includes(targetStatus)) {
          errors.push(`状态值无效，必须为: ${validStatuses.join(', ')}`);
        }

        if (
          (targetStatus === ChecklistItemStatus.CONFIRMED || targetStatus === ChecklistItemStatus.NOT_APPLICABLE) &&
          existing.status !== ChecklistItemStatus.CONFIRMED
        ) {
          if (!input.confirmedById && !req.user) {
            errors.push('确认操作必须提供 confirmedById');
          }
        }

        if (targetStatus === ChecklistItemStatus.PENDING) {
          if (existing.confirmedVersion && transfer.status !== TransferStatus.RETURNED_FOR_CORRECTION) {
            errors.push('已确认项不可退回为待确认');
          }
        }
      }

      if (errors.length > 0) {
        failedItems.push({
          id: existing.id,
          itemName: existing.itemName,
          errors,
        });
      } else {
        validItems.push({
          input,
          existing,
        });
      }
    }

    if (failedItems.length > 0 && validItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: '所有清单项校验失败',
        failedItems,
      });
    }

    let updatedItems: any[] = [];
    if (validItems.length > 0) {
      const transactionOps: any[] = [];

      for (const { input, existing } of validItems) {
        const { status, confirmedById: inputConfirmedById, confirmedRemark, ...rest } = input;
        const updateData: any = { ...rest };
        delete updateData.version;
        delete updateData.expectedVersion;
        delete updateData.id;

        const confirmedById = inputConfirmedById || req.user?.id;

        if (status !== undefined) {
          updateData.status = status;
          if (
            (status === ChecklistItemStatus.CONFIRMED || status === ChecklistItemStatus.NOT_APPLICABLE) &&
            existing.status !== ChecklistItemStatus.CONFIRMED
          ) {
            updateData.confirmedById = confirmedById;
            updateData.confirmedAt = new Date();
            updateData.confirmedVersion = transfer.version + 1;
            if (confirmedRemark !== undefined) updateData.confirmedRemark = confirmedRemark;
          } else if (status === ChecklistItemStatus.PENDING) {
            updateData.confirmedById = null;
            updateData.confirmedAt = null;
          }
        }

        transactionOps.push(
          prisma.checklistItem.update({
            where: { id: existing.id },
            data: updateData,
          })
        );

        transactionOps.push(
          prisma.auditLog.create({
            data: {
              transferId,
              userId: req.user?.id,
              action: status === ChecklistItemStatus.CONFIRMED ? AuditAction.CONFIRM : AuditAction.UPDATE,
              entityType: 'ChecklistItem',
              entityId: existing.id,
              detail: `批量完成: 交接项 ${existing.itemName} 状态变更为 ${status || 'UPDATE'}`,
              version: transfer.version + 1,
            },
          })
        );
      }

      transactionOps.push(
        prisma.transferApplication.update({
          where: { id: transferId },
          data: { version: { increment: 1 } },
        })
      );

      const txResults = await prisma.$transaction(transactionOps);
      updatedItems = txResults
        .filter((r: any) => r && r.transferId !== undefined && r.transferId === transferId)
        .slice(0, validItems.length);
    }

    const resultIds = validItems.map((v) => v.existing.id);
    const finalUpdated = await prisma.checklistItem.findMany({
      where: { id: { in: resultIds } },
      include: { confirmedBy: true },
      orderBy: [{ sortOrder: 'asc' }],
    });

    return res.status(failedItems.length > 0 ? 206 : 200).json({
      success: failedItems.length === 0,
      message:
        failedItems.length === 0
          ? `成功完成 ${finalUpdated.length} 项清单`
          : `部分完成: 成功 ${finalUpdated.length} 项，失败 ${failedItems.length} 项`,
      data: {
        successItems: finalUpdated,
        failedItems,
        version: transfer.version + 1,
      },
    });
  } catch (e) {
    next(e);
  }
});

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
