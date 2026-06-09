import {
  PrismaClient,
  TransferStatus,
  ChecklistItemStatus,
  AssetStatus,
  PermissionStatus,
  UserRole,
  ApprovalDecision,
  AuditAction,
} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 开始创建种子数据...');

  const applicant = await prisma.user.upsert({
    where: { employeeCode: 'EMP001' },
    update: {},
    create: {
      name: '赵申请人',
      employeeCode: 'EMP001',
      email: 'applicant@company.com',
      department: '人力行政部',
      position: 'HR专员',
      role: UserRole.APPLICANT,
    },
  });

  const handover = await prisma.user.upsert({
    where: { employeeCode: 'EMP002' },
    update: {},
    create: {
      name: '钱交出',
      employeeCode: 'EMP002',
      email: 'handover@company.com',
      department: '研发一部',
      position: '高级开发工程师',
      role: UserRole.HANDOVER,
    },
  });

  const receiver = await prisma.user.upsert({
    where: { employeeCode: 'EMP003' },
    update: {},
    create: {
      name: '孙接收',
      employeeCode: 'EMP003',
      email: 'receiver@company.com',
      department: '研发一部',
      position: '开发工程师',
      role: UserRole.RECEIVER,
    },
  });

  const assetAdmin = await prisma.user.upsert({
    where: { employeeCode: 'EMP004' },
    update: {},
    create: {
      name: '周资产',
      employeeCode: 'EMP004',
      email: 'asset@company.com',
      department: '行政部',
      position: '资产管理员',
      role: UserRole.ASSET_ADMIN,
    },
  });

  const permAdmin = await prisma.user.upsert({
    where: { employeeCode: 'EMP005' },
    update: {},
    create: {
      name: '吴权限',
      employeeCode: 'EMP005',
      email: 'perm@company.com',
      department: 'IT部',
      position: '权限管理员',
      role: UserRole.PERMISSION_ADMIN,
    },
  });

  const manager = await prisma.user.upsert({
    where: { employeeCode: 'EMP006' },
    update: {},
    create: {
      name: '郑主管',
      employeeCode: 'EMP006',
      email: 'manager@company.com',
      department: '研发中心',
      position: '研发总监',
      role: UserRole.MANAGER,
    },
  });

  const auditor = await prisma.user.upsert({
    where: { employeeCode: 'EMP007' },
    update: {},
    create: {
      name: '王审计',
      employeeCode: 'EMP007',
      email: 'auditor@company.com',
      department: '内审部',
      position: '审计专员',
      role: UserRole.AUDITOR,
    },
  });

  console.log('✅ 用户创建完成:', {
    applicant: applicant.id.slice(0, 8),
    handover: handover.id.slice(0, 8),
    receiver: receiver.id.slice(0, 8),
    assetAdmin: assetAdmin.id.slice(0, 8),
    permAdmin: permAdmin.id.slice(0, 8),
    manager: manager.id.slice(0, 8),
    auditor: auditor.id.slice(0, 8),
  });

  const templates = [
    { position: '高级开发工程师', department: '研发一部', category: '工作交接', itemName: '已完成项目文档整理', description: '整理已完成项目的设计、接口、部署文档', isCritical: true, sortOrder: 1 },
    { position: '高级开发工程师', department: '研发一部', category: '工作交接', itemName: '未完成任务清单移交', description: '列出所有未完成任务及进度', isCritical: true, sortOrder: 2 },
    { position: '高级开发工程师', department: '研发一部', category: '文档资料', itemName: '代码仓库权限移交', description: 'GitLab仓库、SSH Key、Token', isCritical: true, sortOrder: 3 },
    { position: '开发工程师', department: '研发一部', category: '工作交接', itemName: '日常工作流程说明', description: '开发流程、代码规范、例会安排', isCritical: false, sortOrder: 1 },
    { position: '*', department: '*', category: '行政事务', itemName: '工位及办公物品清点', description: '工位、家具、钥匙清点', isCritical: false, sortOrder: 100 },
    { position: '*', department: '*', category: '行政事务', itemName: '门禁卡归还', description: '归还公司门禁卡', isCritical: true, sortOrder: 101 },
    { position: '测试工程师', department: '测试部', category: '工作交接', itemName: '测试用例库交接', description: '测试用例、自动化脚本', isCritical: true, sortOrder: 1 },
  ];

  for (const t of templates) {
    await prisma.positionTemplate.upsert({
      where: { position_department_itemName: { position: t.position, department: t.department, itemName: t.itemName } },
      update: {},
      create: t,
    });
  }
  console.log('✅ 岗位模板创建完成:', templates.length, '条');

  const draftTransfer = await prisma.transferApplication.create({
    data: {
      title: '钱交出转岗测试部（草稿）',
      transferNo: 'HG-20260600-001',
      fromEmployeeId: handover.id,
      toEmployeeId: receiver.id,
      creatorId: applicant.id,
      approverId: manager.id,
      effectiveDate: new Date('2026-07-15'),
      status: TransferStatus.DRAFT,
      fromDepartment: '研发一部',
      toDepartment: '测试部',
      fromPosition: '高级开发工程师',
      toPosition: '测试工程师主管',
      reason: '业务调整，测试部需要有开发经验人员',
      remark: '草稿状态样例',
      checklistItems: {
        create: [
          { category: '工作交接', itemName: '项目文档整理', description: '整理设计文档', isCritical: true, status: ChecklistItemStatus.PENDING, sortOrder: 1 },
          { category: '工作交接', itemName: '未完成任务移交', description: '列出未完成任务', isCritical: true, status: ChecklistItemStatus.PENDING, sortOrder: 2 },
        ],
      },
      assets: {
        create: [
          { assetCode: 'ASSET-LAP-001', assetName: '笔记本电脑', category: '电子设备', specification: 'MacBook Pro 16', quantity: 1, status: AssetStatus.IN_POSSESSION },
        ],
      },
      permissions: {
        create: [
          { systemName: 'GitLab', permissionName: '研发一部代码库', permissionScope: '读写', status: PermissionStatus.TO_BE_TRANSFERRED },
        ],
      },
    },
    include: { checklistItems: true, assets: true, permissions: true },
  });
  console.log('✅ 草稿申请创建:', draftTransfer.id.slice(0, 8));

  const pendingTransfer = await prisma.transferApplication.create({
    data: {
      title: '钱交出转岗测试部（待交接）',
      transferNo: 'HG-20260600-002',
      fromEmployeeId: handover.id,
      toEmployeeId: receiver.id,
      creatorId: applicant.id,
      approverId: manager.id,
      effectiveDate: new Date('2026-07-10'),
      status: TransferStatus.PENDING_HANDOVER,
      fromDepartment: '研发一部',
      toDepartment: '测试部',
      fromPosition: '高级开发工程师',
      toPosition: '测试工程师主管',
      reason: '业务调整',
      version: 2,
      checklistItems: {
        create: [
          {
            category: '工作交接', itemName: '已完成项目文档整理', description: '整理文档', isCritical: true,
            status: ChecklistItemStatus.CONFIRMED, confirmedById: handover.id, confirmedAt: new Date('2026-06-05T10:00:00'),
            confirmedVersion: 1, sortOrder: 1, confirmedRemark: '文档已上传至共享盘',
          },
          {
            category: '工作交接', itemName: '未完成任务清单移交', description: '任务清单', isCritical: true,
            status: ChecklistItemStatus.CONFIRMED, confirmedById: receiver.id, confirmedAt: new Date('2026-06-05T14:00:00'),
            confirmedVersion: 1, sortOrder: 2,
          },
          {
            category: '工作交接', itemName: '日常工作流程说明', description: '流程说明', isCritical: false,
            status: ChecklistItemStatus.PENDING, sortOrder: 3,
          },
        ],
      },
      assets: {
        create: [
          {
            assetCode: 'ASSET-LAP-002', assetName: '笔记本电脑', category: '电子设备', specification: 'MacBook Pro 14', quantity: 1,
            status: AssetStatus.RETURNED, confirmedById: assetAdmin.id, confirmedAt: new Date('2026-06-06T09:00:00'), confirmedVersion: 1,
          },
          {
            assetCode: 'ASSET-MON-002', assetName: '办公显示器', category: '电子设备', specification: 'Dell 27寸', quantity: 1,
            status: AssetStatus.MISSING, compensationNote: '显示器遗失，按折旧价格赔偿', compensationFee: 800, remark: '用于演示资产缺失赔付',
          },
          {
            assetCode: 'ASSET-CARD-003', assetName: '门禁卡', category: '办公用品', specification: '公司门禁', quantity: 1,
            status: AssetStatus.IN_POSSESSION,
          },
        ],
      },
      permissions: {
        create: [
          {
            systemName: 'GitLab', permissionName: '研发一部代码仓库', permissionScope: '读写权限',
            status: PermissionStatus.FIRST_CONFIRMED,
            firstConfirmerId: handover.id, firstConfirmedAt: new Date('2026-06-06T10:00:00'), firstConfirmVersion: 1,
          },
          {
            systemName: 'Jira', permissionName: '项目管理编辑权限', permissionScope: '所有研发项目',
            status: PermissionStatus.TO_BE_TRANSFERRED,
          },
          {
            systemName: 'Confluence', permissionName: 'Wiki编辑权限', permissionScope: '研发空间',
            status: PermissionStatus.TRANSFERRED,
            firstConfirmerId: handover.id, firstConfirmedAt: new Date('2026-06-06T11:00:00'), firstConfirmVersion: 1,
            secondConfirmerId: receiver.id, secondConfirmedAt: new Date('2026-06-06T13:00:00'), secondConfirmVersion: 1,
            transferredToId: receiver.id,
          },
        ],
      },
      approvals: {
        create: [
          {
            approverId: manager.id, decision: ApprovalDecision.RETURNED, comment: '缺少资产赔付确认，请补充',
            approvedAt: new Date('2026-06-07T09:00:00'), idempotencyKey: 'demo-return-002', version: 2,
          },
        ],
      },
      auditLogs: {
        create: [
          { userId: applicant.id, action: AuditAction.CREATE, entityType: 'TransferApplication', detail: '创建转岗申请', version: 1 },
          { userId: handover.id, action: AuditAction.CONFIRM, entityType: 'ChecklistItem', detail: '确认项目文档整理', version: 1 },
          { userId: manager.id, action: AuditAction.RETURN, entityType: 'ApprovalRecord', detail: '主管退回补正: 缺少资产赔付确认', version: 2 },
        ],
      },
      idempotencyKeys: {
        create: [
          {
            idempotencyKey: 'demo-create-002', endpoint: '/api/transfers', method: 'POST',
            statusCode: 201, responseBody: { success: true }, expiresAt: new Date(Date.now() + 86400000),
          },
        ],
      },
    },
    include: { checklistItems: true, assets: true, permissions: true, approvals: true, auditLogs: true },
  });
  console.log('✅ 待交接状态申请创建:', pendingTransfer.id.slice(0, 8));

  const approvalTransfer = await prisma.transferApplication.create({
    data: {
      title: '钱交出转岗测试部（待审批）',
      transferNo: 'HG-20260600-003',
      fromEmployeeId: handover.id,
      toEmployeeId: receiver.id,
      creatorId: applicant.id,
      approverId: manager.id,
      effectiveDate: new Date('2026-07-01'),
      status: TransferStatus.MANAGER_APPROVAL,
      fromDepartment: '研发一部',
      toDepartment: '测试部',
      fromPosition: '高级开发工程师',
      toPosition: '测试工程师主管',
      reason: '业务调整',
      version: 3,
      checklistItems: {
        create: [
          { category: '工作交接', itemName: '项目文档整理', isCritical: true, status: ChecklistItemStatus.CONFIRMED, confirmedById: handover.id, confirmedAt: new Date('2026-06-01'), confirmedVersion: 1, sortOrder: 1 },
          { category: '工作交接', itemName: '任务移交', isCritical: true, status: ChecklistItemStatus.CONFIRMED, confirmedById: receiver.id, confirmedAt: new Date('2026-06-01'), confirmedVersion: 1, sortOrder: 2 },
          { category: '行政事务', itemName: '工位清点', isCritical: false, status: ChecklistItemStatus.NOT_APPLICABLE, confirmedById: handover.id, confirmedAt: new Date('2026-06-02'), confirmedVersion: 2, sortOrder: 3 },
        ],
      },
      assets: {
        create: [
          { assetCode: 'LAPTOP-A001', assetName: '笔记本电脑', category: '电子', specification: 'MacBook Pro', quantity: 1, status: AssetStatus.COMPENSATED, confirmedById: assetAdmin.id, confirmedAt: new Date('2026-06-03'), confirmedVersion: 2, compensationNote: '屏幕损坏，按残值赔付', compensationFee: 1500 },
          { assetCode: 'CARD-A002', assetName: '门禁卡', category: '办公', specification: '门禁', quantity: 1, status: AssetStatus.RETURNED, confirmedById: assetAdmin.id, confirmedAt: new Date('2026-06-03'), confirmedVersion: 2 },
        ],
      },
      permissions: {
        create: [
          { systemName: 'GitLab', permissionName: '代码库', status: PermissionStatus.TRANSFERRED, firstConfirmerId: handover.id, firstConfirmedAt: new Date('2026-06-04'), firstConfirmVersion: 2, secondConfirmerId: receiver.id, secondConfirmedAt: new Date('2026-06-04'), secondConfirmVersion: 2, transferredToId: receiver.id },
          { systemName: 'VPN', permissionName: '远程办公', status: PermissionStatus.TRANSFERRED, firstConfirmerId: permAdmin.id, firstConfirmedAt: new Date('2026-06-04'), firstConfirmVersion: 2, secondConfirmerId: receiver.id, secondConfirmedAt: new Date('2026-06-04'), secondConfirmVersion: 2, transferredToId: receiver.id },
        ],
      },
    },
    include: { checklistItems: true, assets: true, permissions: true },
  });
  console.log('✅ 待主管审批状态申请创建:', approvalTransfer.id.slice(0, 8));

  const archivedTransfer = await prisma.transferApplication.create({
    data: {
      title: '孙接收转岗（已归档）',
      transferNo: 'HG-20260500-001',
      fromEmployeeId: receiver.id,
      toEmployeeId: handover.id,
      creatorId: applicant.id,
      approverId: manager.id,
      effectiveDate: new Date('2026-05-01'),
      status: TransferStatus.ARCHIVED,
      fromDepartment: '测试部',
      toDepartment: '研发一部',
      fromPosition: '测试工程师',
      toPosition: '开发工程师',
      reason: '轮岗计划',
      version: 5,
      archivedAt: new Date('2026-05-15'),
      checklistItems: {
        create: [
          { category: '工作交接', itemName: '测试用例交接', isCritical: true, status: ChecklistItemStatus.CONFIRMED, confirmedById: receiver.id, confirmedAt: new Date('2026-05-10'), confirmedVersion: 3, sortOrder: 1 },
        ],
      },
      assets: {
        create: [
          { assetCode: 'LAPTOP-B001', assetName: '笔记本电脑', category: '电子', specification: 'ThinkPad', quantity: 1, status: AssetStatus.RETURNED, confirmedById: assetAdmin.id, confirmedAt: new Date('2026-05-12'), confirmedVersion: 3 },
        ],
      },
      permissions: {
        create: [
          { systemName: 'Jira', permissionName: '测试项目', status: PermissionStatus.TRANSFERRED, firstConfirmerId: receiver.id, firstConfirmedAt: new Date('2026-05-12'), firstConfirmVersion: 4, secondConfirmerId: permAdmin.id, secondConfirmedAt: new Date('2026-05-12'), secondConfirmVersion: 4 },
        ],
      },
      approvals: {
        create: [
          { approverId: manager.id, decision: ApprovalDecision.APPROVED, comment: '同意', approvedAt: new Date('2026-05-14'), version: 5, idempotencyKey: 'archive-approve-001' },
        ],
      },
      auditLogs: {
        create: [
          { userId: applicant.id, action: AuditAction.CREATE, entityType: 'TransferApplication', detail: '创建申请', version: 1 },
          { userId: manager.id, action: AuditAction.APPROVE, entityType: 'ApprovalRecord', detail: '主管审批通过', version: 5 },
          { userId: manager.id, action: AuditAction.ARCHIVE, entityType: 'TransferApplication', detail: '归档完成', version: 5 },
        ],
      },
    },
    include: { checklistItems: true, assets: true, permissions: true, approvals: true, auditLogs: true },
  });
  console.log('✅ 已归档状态申请创建:', archivedTransfer.id.slice(0, 8));

  console.log('\n📋 种子数据汇总:');
  console.log('  - 用户:', 7, '个 (7种角色)');
  console.log('  - 岗位模板:', templates.length, '条');
  console.log('  - 转岗申请:', 4, '个 (草稿/待交接/待审批/已归档)');

  const users = {
    APPLICANT: { id: applicant.id, code: 'EMP001', name: applicant.name, role: applicant.role },
    HANDOVER: { id: handover.id, code: 'EMP002', name: handover.name, role: handover.role },
    RECEIVER: { id: receiver.id, code: 'EMP003', name: receiver.name, role: receiver.role },
    ASSET_ADMIN: { id: assetAdmin.id, code: 'EMP004', name: assetAdmin.name, role: assetAdmin.role },
    PERMISSION_ADMIN: { id: permAdmin.id, code: 'EMP005', name: permAdmin.name, role: permAdmin.role },
    MANAGER: { id: manager.id, code: 'EMP006', name: manager.name, role: manager.role },
    AUDITOR: { id: auditor.id, code: 'EMP007', name: auditor.name, role: auditor.role },
  };
  const transfers = {
    DRAFT: { id: draftTransfer.id, no: draftTransfer.transferNo, status: draftTransfer.status },
    PENDING_HANDOVER: { id: pendingTransfer.id, no: pendingTransfer.transferNo, status: pendingTransfer.status },
    MANAGER_APPROVAL: { id: approvalTransfer.id, no: approvalTransfer.transferNo, status: approvalTransfer.status },
    ARCHIVED: { id: archivedTransfer.id, no: archivedTransfer.transferNo, status: archivedTransfer.status },
  };

  const fs = await import('fs');
  const path = await import('path');
  const file = await import('url');
  const __dirname = path.dirname(file.fileURLToPath(import.meta.url));
  fs.writeFileSync(
    path.join(__dirname, 'seed-result.json'),
    JSON.stringify({ users, transfers }, null, 2)
  );
  console.log('\n💾 账号数据已保存至 prisma/seed-result.json');
  console.log('\n👤 测试账号（employeeCode登录）:');
  Object.values(users).forEach(u => console.log(`  ${u.code.padEnd(8)} | ${u.role.padEnd(16)} | ${u.name}`));
}

main()
  .catch((e) => {
    console.error('❌ 种子数据创建失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
