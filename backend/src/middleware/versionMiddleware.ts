import { Request, Response, NextFunction } from 'express';
import { PrismaClient, TransferStatus } from '@prisma/client';
import {
  VersionMismatchException,
  ArchivedModificationException,
  BusinessException,
} from './errorHandler.js';

const prisma = new PrismaClient();

export function versionCheckMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  if (req.method !== 'PUT' && req.method !== 'DELETE') return next();
  next();
}

export async function checkTransferVersion(
  transferId: string,
  expectedVersion: number | undefined
) {
  const transfer = await prisma.transferApplication.findUnique({
    where: { id: transferId },
    select: { version: true, status: true },
  });
  if (!transfer) return;

  if (transfer.status === TransferStatus.ARCHIVED) {
    throw new ArchivedModificationException();
  }

  if (
    expectedVersion !== undefined &&
    expectedVersion !== null &&
    transfer.version !== expectedVersion
  ) {
    throw new VersionMismatchException(
      `当前版本: ${transfer.version}, 传入版本: ${expectedVersion}`
    );
  }
}

export async function incrementTransferVersion(transferId: string) {
  await prisma.transferApplication.update({
    where: { id: transferId },
    data: { version: { increment: 1 } },
  });
}

export async function ensureNotArchived(transferId: string) {
  const transfer = await prisma.transferApplication.findUnique({
    where: { id: transferId },
    select: { status: true },
  });
  if (!transfer) return;
  if (transfer.status === TransferStatus.ARCHIVED) {
    throw new ArchivedModificationException();
  }
}

export async function ensureReturnedCanEdit(
  transferId: string,
  itemType: 'checklist' | 'asset' | 'permission',
  itemId: string
) {
  const transfer = await prisma.transferApplication.findUnique({
    where: { id: transferId },
    select: { status: true },
  });
  if (!transfer) return;
  if (transfer.status !== TransferStatus.RETURNED_FOR_CORRECTION) return;

  if (itemType === 'checklist') {
    const item = await prisma.checklistItem.findUnique({
      where: { id: itemId },
      select: { returnedReason: true, status: true },
    });
    if (!item) return;
    if (
      !item.returnedReason &&
      item.status !== 'RETURNED' &&
      item.status !== 'PENDING'
    ) {
      throw new BusinessException(
        '退回补正阶段仅可修改被退回的项目，已确认项不可修改'
      );
    }
  }
}
