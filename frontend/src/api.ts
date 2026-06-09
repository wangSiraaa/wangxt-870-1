import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

export const api: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

export type UserRole =
  | 'APPLICANT'
  | 'HANDOVER'
  | 'RECEIVER'
  | 'ASSET_ADMIN'
  | 'PERMISSION_ADMIN'
  | 'MANAGER'
  | 'AUDITOR';

export interface User {
  id: string;
  name: string;
  employeeCode: string;
  email: string;
  department: string;
  position: string;
  role: UserRole;
  createdAt: string;
}

export type TransferStatus =
  | 'DRAFT'
  | 'PENDING_HANDOVER'
  | 'ASSET_VERIFICATION'
  | 'PERMISSION_CONFIRMATION'
  | 'MANAGER_APPROVAL'
  | 'RETURNED_FOR_CORRECTION'
  | 'PENDING_ARCHIVE'
  | 'ARCHIVED';

export type ChecklistItemStatus = 'PENDING' | 'CONFIRMED' | 'NOT_APPLICABLE' | 'REJECTED';
export type AssetStatus = 'IN_POSSESSION' | 'RETURNED' | 'MISSING' | 'COMPENSATED' | 'SOLD';
export type PermissionStatus = 'TO_BE_TRANSFERRED' | 'FIRST_CONFIRMED' | 'TRANSFERRED' | 'REVOKED';

export interface Transfer {
  id: string;
  title: string;
  transferNo: string;
  status: TransferStatus;
  fromEmployee: User;
  toEmployee: User;
  creator: User;
  approver: User;
  fromDepartment: string;
  toDepartment: string;
  fromPosition: string;
  toPosition: string;
  effectiveDate: string;
  reason?: string;
  remark?: string;
  returnedReason?: string;
  archivedAt?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  checklistItems: ChecklistItem[];
  assets: Asset[];
  permissions: Permission[];
  approvals: Approval[];
  auditLogs: AuditLog[];
}

export interface ChecklistItem {
  id: string;
  transferId: string;
  category: string;
  itemName: string;
  description?: string;
  isCritical: boolean;
  status: ChecklistItemStatus;
  confirmedById?: string;
  confirmedBy?: User;
  confirmedAt?: string;
  confirmedVersion?: number;
  confirmedRemark?: string;
  returnedReason?: string;
  sortOrder: number;
}

export interface Asset {
  id: string;
  transferId: string;
  assetCode: string;
  assetName: string;
  category: string;
  specification?: string;
  quantity: number;
  status: AssetStatus;
  confirmedById?: string;
  confirmedBy?: User;
  confirmedAt?: string;
  confirmedVersion?: number;
  compensationNote?: string;
  compensationFee?: number;
  remark?: string;
}

export interface Permission {
  id: string;
  transferId: string;
  systemName: string;
  permissionName: string;
  permissionScope?: string;
  status: PermissionStatus;
  firstConfirmerId?: string;
  firstConfirmer?: User;
  firstConfirmedAt?: string;
  firstConfirmVersion?: number;
  secondConfirmerId?: string;
  secondConfirmer?: User;
  secondConfirmedAt?: string;
  secondConfirmVersion?: number;
  transferredToId?: string;
  transferredTo?: User;
  revokedBy?: User;
  revokedAt?: string;
}

export interface Approval {
  id: string;
  transferId: string;
  approverId: string;
  approver: User;
  decision: 'APPROVED' | 'RETURNED' | 'REJECTED';
  comment?: string;
  approvedAt: string;
  version: number;
  idempotencyKey: string;
}

export interface AuditLog {
  id: string;
  transferId?: string;
  userId?: string;
  user?: User;
  action: string;
  entityType: string;
  entityId?: string;
  detail?: string;
  oldValue?: any;
  newValue?: any;
  version: number;
  createdAt: string;
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('token');
  const uid = localStorage.getItem('userId');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else if (uid) {
    config.headers['x-test-user-id'] = uid;
  }
  if (config.method !== 'get') {
    const ik = localStorage.getItem('idempotencyKey');
    if (ik) config.headers['x-idempotency-key'] = ik;
  }
  return config;
});

api.interceptors.response.use(
  (r) => {
    if (r.data?.success === false) {
      return Promise.reject(new Error(r.data?.message || r.data?.error || '请求失败'));
    }
    return r;
  },
  (e) => {
    const msg = e.response?.data?.message || e.response?.data?.error || e.message || '网络错误';
    return Promise.reject(new Error(msg));
  }
);

export const genIk = () => `ik-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const withIk = (fn: (ik: string) => Promise<any>) => {
  const ik = genIk();
  localStorage.setItem('idempotencyKey', ik);
  return fn(ik).finally(() => localStorage.removeItem('idempotencyKey'));
};

export const authApi = {
  login: (employeeCode: string) =>
    api.post('/auth/login', { employeeCode }).then((r) => r.data.data),
  users: () => api.get('/users').then((r) => r.data.data),
  me: () => api.get('/users/me').then((r) => r.data.data),
};

export const transferApi = {
  list: (params?: any) => api.get('/transfers', { params }).then((r) => r.data.data),
  get: (id: string) => api.get(`/transfers/${id}`).then((r) => r.data.data),
  create: (data: any) => api.post('/transfers', data).then((r) => r.data.data),
  update: (id: string, data: any) => api.put(`/transfers/${id}`, data).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/transfers/${id}`).then((r) => r.data.data),
  advance: (id: string, data: any) =>
    api.post(`/transfers/${id}/advance`, data).then((r) => r.data.data),
  archive: (id: string, data: any) =>
    api.post(`/transfers/${id}/archive`, data).then((r) => r.data.data),
};

export const checklistApi = {
  list: (params?: any) => api.get('/checklist', { params }).then((r) => r.data.data),
  update: (id: string, data: any) => api.put(`/checklist/${id}`, data).then((r) => r.data.data),
  relatedQuery: (params?: any) =>
    api.get('/checklist/related-query', { params }).then((r) => r.data.data),
  batchComplete: (data: any) =>
    api.post('/checklist/batch-complete', data).then((r) => r.data),
};

export const assetsApi = {
  list: (params?: any) => api.get('/assets', { params }).then((r) => r.data.data),
  update: (id: string, data: any) =>
    api.put(`/assets/${id}`, data).then((r) => r.data.data),
};

export const permissionsApi = {
  list: (params?: any) =>
    api.get('/permissions', { params }).then((r) => r.data.data),
  firstConfirm: (id: string, data: any) =>
    api.post(`/permissions/${id}/first-confirm`, data).then((r) => r.data.data),
  secondConfirm: (id: string, data: any) =>
    api.post(`/permissions/${id}/second-confirm`, data).then((r) => r.data.data),
};

export const approvalApi = {
  approve: (id: string, data: any) =>
    api.post(`/approvals/${id}/approve`, data).then((r) => r.data.data),
  reject: (id: string, data: any) =>
    api.post(`/approvals/${id}/reject`, data).then((r) => r.data.data),
};

export const auditApi = {
  logs: (params?: any) => api.get('/audit/logs', { params }).then((r) => r.data.data),
  timeline: (id: string) => api.get(`/audit/timeline/${id}`).then((r) => r.data.data),
  exportOne: (id: string) => (window.location.href = `/api/audit/export/${id}`),
  exportAll: (params?: any) => {
    const qs = new URLSearchParams(params || {}).toString();
    window.location.href = `/api/audit/export-all${qs ? '?' + qs : ''}`;
  },
  stats: () => api.get('/audit/stats').then((r) => r.data.data),
  templates: () => api.get('/audit/templates').then((r) => r.data.data),
};

export const STATUS_LABEL: Record<TransferStatus, string> = {
  DRAFT: '草稿',
  PENDING_HANDOVER: '待交接',
  ASSET_VERIFICATION: '资产核对中',
  PERMISSION_CONFIRMATION: '权限确认中',
  MANAGER_APPROVAL: '待主管审批',
  RETURNED_FOR_CORRECTION: '退回补正',
  PENDING_ARCHIVE: '待归档',
  ARCHIVED: '已归档',
};

export const STATUS_COLOR: Record<TransferStatus, string> = {
  DRAFT: 'default',
  PENDING_HANDOVER: 'processing',
  ASSET_VERIFICATION: 'warning',
  PERMISSION_CONFIRMATION: 'warning',
  MANAGER_APPROVAL: 'orange',
  RETURNED_FOR_CORRECTION: 'red',
  PENDING_ARCHIVE: 'cyan',
  ARCHIVED: 'success',
};

export const ROLE_LABEL: Record<UserRole, string> = {
  APPLICANT: '申请人',
  HANDOVER: '交出人',
  RECEIVER: '接收人',
  ASSET_ADMIN: '资产管理员',
  PERMISSION_ADMIN: '权限管理员',
  MANAGER: '主管',
  AUDITOR: '审计员',
};
