import { PrismaClient, UserRole, TransferStatus } from '@prisma/client';
import { ForbiddenException, BusinessException } from '../middleware/errorHandler.js';

const prisma = new PrismaClient();

type ResourceType =
  | 'transfer'
  | 'checklist'
  | 'asset'
  | 'permission'
  | 'approval'
  | 'audit';

type ActionType = 'create' | 'read' | 'update' | 'delete' | 'confirm' | 'advance' | 'approve' | 'reject' | 'return' | 'archive' | 'export';

const MATRIX: Record<ResourceType, Record<ActionType, UserRole[]>> = {
  transfer: {
    create: [UserRole.APPLICANT, UserRole.MANAGER],
    read: [UserRole.APPLICANT, UserRole.HANDOVER, UserRole.RECEIVER, UserRole.ASSET_ADMIN, UserRole.PERMISSION_ADMIN, UserRole.MANAGER, UserRole.AUDITOR],
    update: [UserRole.APPLICANT, UserRole.HANDOVER, UserRole.MANAGER],
    delete: [UserRole.APPLICANT, UserRole.MANAGER],
    confirm: [UserRole.HANDOVER, UserRole.RECEIVER],
    advance: [UserRole.APPLICANT, UserRole.HANDOVER, UserRole.RECEIVER, UserRole.MANAGER],
    approve: [UserRole.MANAGER],
    reject: [UserRole.MANAGER],
    return: [UserRole.MANAGER],
    archive: [UserRole.MANAGER],
    export: [UserRole.MANAGER, UserRole.AUDITOR],
  },
  checklist: {
    create: [UserRole.APPLICANT, UserRole.HANDOVER],
    read: [UserRole.APPLICANT, UserRole.HANDOVER, UserRole.RECEIVER, UserRole.ASSET_ADMIN, UserRole.PERMISSION_ADMIN, UserRole.MANAGER, UserRole.AUDITOR],
    update: [UserRole.APPLICANT, UserRole.HANDOVER, UserRole.RECEIVER],
    delete: [UserRole.APPLICANT, UserRole.HANDOVER],
    confirm: [UserRole.HANDOVER, UserRole.RECEIVER],
    advance: [],
    approve: [],
    reject: [],
    return: [],
    archive: [],
    export: [],
  },
  asset: {
    create: [UserRole.ASSET_ADMIN, UserRole.HANDOVER],
    read: [UserRole.APPLICANT, UserRole.HANDOVER, UserRole.RECEIVER, UserRole.ASSET_ADMIN, UserRole.PERMISSION_ADMIN, UserRole.MANAGER, UserRole.AUDITOR],
    update: [UserRole.ASSET_ADMIN, UserRole.HANDOVER],
    delete: [UserRole.ASSET_ADMIN],
    confirm: [UserRole.ASSET_ADMIN, UserRole.HANDOVER, UserRole.RECEIVER],
    advance: [],
    approve: [],
    reject: [],
    return: [],
    archive: [],
    export: [],
  },
  permission: {
    create: [UserRole.PERMISSION_ADMIN],
    read: [UserRole.APPLICANT, UserRole.HANDOVER, UserRole.RECEIVER, UserRole.ASSET_ADMIN, UserRole.PERMISSION_ADMIN, UserRole.MANAGER, UserRole.AUDITOR],
    update: [UserRole.PERMISSION_ADMIN],
    delete: [UserRole.PERMISSION_ADMIN],
    confirm: [UserRole.PERMISSION_ADMIN, UserRole.HANDOVER, UserRole.RECEIVER],
    advance: [],
    approve: [],
    reject: [],
    return: [],
    archive: [],
    export: [],
  },
  approval: {
    create: [UserRole.MANAGER],
    read: [UserRole.APPLICANT, UserRole.HANDOVER, UserRole.RECEIVER, UserRole.ASSET_ADMIN, UserRole.PERMISSION_ADMIN, UserRole.MANAGER, UserRole.AUDITOR],
    update: [],
    delete: [],
    confirm: [],
    advance: [],
    approve: [UserRole.MANAGER],
    reject: [UserRole.MANAGER],
    return: [UserRole.MANAGER],
    archive: [],
    export: [],
  },
  audit: {
    create: [],
    read: [UserRole.AUDITOR, UserRole.MANAGER],
    update: [],
    delete: [],
    confirm: [],
    advance: [],
    approve: [],
    reject: [],
    return: [],
    archive: [],
    export: [UserRole.AUDITOR],
  },
};

export function checkPermission(
  role: UserRole,
  resource: ResourceType,
  action: ActionType
): boolean {
  const allowedRoles = MATRIX[resource]?.[action] || [];
  return allowedRoles.includes(role);
}

export function requirePermission(
  role: UserRole,
  resource: ResourceType,
  action: ActionType
) {
  if (!checkPermission(role, resource, action)) {
    throw new ForbiddenException(
      `角色 [${role}] 无权对 [${resource}] 执行 [${action}]`
    );
  }
}

export async function assertIsHandoverOrReceiver(
  userId: string,
  transferId: string
) {
  const transfer = await prisma.transferApplication.findUnique({
    where: { id: transferId },
    select: { fromEmployeeId: true, toEmployeeId: true },
  });
  if (!transfer) return;
  if (
    userId !== transfer.fromEmployeeId &&
    userId !== transfer.toEmployeeId
  ) {
    throw new ForbiddenException('仅交出人或接收人可操作此项');
  }
}

export async function assertIsAssetAdmin(role: UserRole) {
  if (role !== UserRole.ASSET_ADMIN && role !== UserRole.MANAGER) {
    throw new ForbiddenException('仅资产管理员可修改资产赔付信息');
  }
}

export async function assertIsNotAssetAdminForPermission(role: UserRole) {
  if (role === UserRole.ASSET_ADMIN) {
    throw new ForbiddenException('资产管理员不可确认权限移交项');
  }
}

export async function assertIsNotPermissionAdminForAsset(role: UserRole) {
  if (role === UserRole.PERMISSION_ADMIN) {
    throw new ForbiddenException('权限管理员不可修改资产赔付信息');
  }
}

export async function assertDifferentUsers(
  firstId: string | null | undefined,
  secondId: string | null | undefined
) {
  if (firstId && secondId && firstId === secondId) {
    throw new BusinessException('同一账号不能同时扮演交出人和接收人');
  }
}
