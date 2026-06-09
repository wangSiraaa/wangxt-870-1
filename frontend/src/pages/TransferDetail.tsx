import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Descriptions,
  Tag,
  Button,
  Space,
  Row,
  Col,
  Tabs,
  Table,
  Modal,
  Form,
  Input,
  Select,
  message,
  Popconfirm,
  Card,
  Steps,
  Divider,
  Badge,
  Avatar,
  Timeline,
  InputNumber,
  Tooltip,
  Empty,
  Statistic,
} from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  ForwardOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  RollbackOutlined,
  InboxOutlined,
  DownloadOutlined,
  SafetyCertificateOutlined,
  WalletOutlined,
  KeyOutlined,
  AuditOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
  UserOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  Transfer,
  User,
  TransferStatus,
  transferApi,
  STATUS_LABEL,
  STATUS_COLOR,
  ROLE_LABEL,
  withIk,
  checklistApi,
  assetsApi,
  permissionsApi,
  approvalApi,
  auditApi,
  ChecklistItemStatus,
  AssetStatus,
  PermissionStatus,
} from '../api';

interface Props {
  user: User;
}

const STEPS = [
  { title: '草稿', status: 'DRAFT' },
  { title: '待交接', status: 'PENDING_HANDOVER' },
  { title: '资产核对', status: 'ASSET_VERIFICATION' },
  { title: '权限确认', status: 'PERMISSION_CONFIRMATION' },
  { title: '主管审批', status: 'MANAGER_APPROVAL' },
  { title: '归档', status: 'ARCHIVED' },
];

const TransferDetail: React.FC<Props> = ({ user }) => {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [data, setData] = useState<Transfer | null>(null);
  const [loading, setLoading] = useState(false);
  const [editTitle, setEditTitle] = useState(false);
  const [titleForm] = Form.useForm();
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loadingTl, setLoadingTl] = useState(false);

  const refresh = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const t = await transferApi.get(id);
      setData(t);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTimeline = async () => {
    if (!id) return;
    setLoadingTl(true);
    try {
      const tl = await auditApi.timeline(id);
      setTimeline(tl || []);
    } catch (_) {} finally {
      setLoadingTl(false);
    }
  };

  useEffect(() => {
    refresh();
    fetchTimeline();
  }, [id]);

  if (!data) return <Card loading={loading}><Empty description="加载中..." /></Card>;

  const stepIdx = STEPS.findIndex((s) => s.status === data.status);
  const isArchived = data.status === 'ARCHIVED';
  const isReturned = data.status === 'RETURNED_FOR_CORRECTION';
  const canEdit = !isArchived && ['DRAFT', 'RETURNED_FOR_CORRECTION'].includes(data.status);
  const canAdvance = !isArchived && !['PENDING_ARCHIVE', 'ARCHIVED'].includes(data.status)
    && (user.role === 'APPLICANT' || user.role === 'MANAGER' || user.role === 'HANDOVER');
  const canApprove = (data.status === 'MANAGER_APPROVAL' || data.status === 'PENDING_ARCHIVE') && user.role === 'MANAGER';
  const canReject = (data.status === 'MANAGER_APPROVAL' || data.status === 'PENDING_ARCHIVE') && user.role === 'MANAGER';
  const canArchive = (data.status === 'PENDING_ARCHIVE' || data.status === 'MANAGER_APPROVAL') && (user.role === 'MANAGER' || user.role === 'APPLICANT');

  const criticalStats = data.checklistItems.reduce(
    (acc, it) => {
      if (it.isCritical) {
        acc.total++;
        if (it.status === 'CONFIRMED' || it.status === 'NOT_APPLICABLE') acc.done++;
        else acc.pending++;
      }
      return acc;
    },
    { total: 0, done: 0, pending: 0 }
  );
  const assetMissing = data.assets.filter((a) => a.status === 'MISSING').length;
  const permDone = data.permissions.filter(
    (p) => p.status === 'TRANSFERRED' || p.status === 'REVOKED'
  ).length;

  const updateTitle = async (v: any) => {
    try {
      await withIk((ik) => transferApi.update(id!, { ...v, expectedVersion: data!.version, idempotencyKey: ik }));
      setEditTitle(false);
      message.success('已更新');
      refresh();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const advance = async () => {
    try {
      await withIk((ik) => transferApi.advance(id!, { expectedVersion: data!.version, idempotencyKey: ik }));
      message.success('状态已推进');
      refresh();
      fetchTimeline();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const archive = async () => {
    try {
      await withIk((ik) => transferApi.archive(id!, { expectedVersion: data!.version, idempotencyKey: ik }));
      message.success('已归档');
      refresh();
      fetchTimeline();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const showReject = () => {
    Modal.confirm({
      title: '退回补正',
      icon: <RollbackOutlined />,
      content: (
        <Input.TextArea
          id="reject-reason"
          placeholder="请填写退回原因（必填）"
          rows={4}
          onChange={(e) => ((window as any).__rejectReason = e.target.value)}
        />
      ),
      okText: '确认退回',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const reason = (window as any).__rejectReason;
        if (!reason) {
          message.warning('请填写退回原因');
          return Promise.reject();
        }
        try {
          await withIk((ik) =>
            approvalApi.reject(id!, {
              comment: reason,
              expectedVersion: data!.version,
              idempotencyKey: ik,
            })
          );
          message.success('已退回');
          refresh();
          fetchTimeline();
        } catch (e: any) {
          message.error(e.message);
          return Promise.reject();
        }
      },
    });
  };

  const showApprove = () => {
    Modal.confirm({
      title: `审批通过（${data.status === 'MANAGER_APPROVAL' ? '→待归档' : '→已归档'}）`,
      icon: <CheckCircleOutlined />,
      content: (
        <Input.TextArea
          id="approve-comment"
          placeholder="审批意见（选填）"
          rows={3}
          onChange={(e) => ((window as any).__approveComment = e.target.value)}
        />
      ),
      okText: '确认审批',
      okButtonProps: { type: 'primary' },
      onOk: async () => {
        const comment = (window as any).__approveComment || '';
        try {
          await withIk((ik) =>
            approvalApi.approve(id!, {
              comment,
              expectedVersion: data!.version,
              idempotencyKey: ik,
            })
          );
          message.success('已审批通过');
          refresh();
          fetchTimeline();
        } catch (e: any) {
          message.error(e.message);
          return Promise.reject();
        }
      },
    });
  };

  const confirmChecklist = (item: any, status: ChecklistItemStatus) => {
    Modal.confirm({
      title: `确认交接项 - ${item.itemName}`,
      content: (
        <div>
          <p>
            当前状态: <Tag>{item.status}</Tag> → 新状态:
            <Tag color={status === 'CONFIRMED' ? 'green' : 'default'}>{status}</Tag>
          </p>
          <Input.TextArea
            placeholder="备注说明"
            rows={3}
            onChange={(e) => ((window as any).__ciRemark = e.target.value)}
          />
        </div>
      ),
      onOk: async () => {
        try {
          await withIk((ik) =>
            checklistApi.update(item.id, {
              status,
              confirmedRemark: (window as any).__ciRemark || '',
              expectedVersion: data!.version,
              idempotencyKey: ik,
            })
          );
          message.success('已确认');
          refresh();
          fetchTimeline();
        } catch (e: any) {
          message.error(e.message);
          return Promise.reject();
        }
      },
    });
  };

  const confirmAsset = (a: any, status: AssetStatus) => {
    Modal.confirm({
      title: `资产确认 - ${a.assetName} (${a.assetCode})`,
      content: (
        <div>
          <p>
            当前状态: <Tag>{a.status}</Tag> → 新状态:
            <Tag color={status === 'MISSING' ? 'orange' : 'green'}>{status}</Tag>
          </p>
          {status === 'MISSING' && (
            <div>
              <Divider style={{ margin: '8px 0' }}>
                <Tag color="orange">资产缺失 - 必填赔付信息</Tag>
              </Divider>
              <Input.TextArea
                placeholder="赔付说明（缺失原因+赔付方式）"
                rows={3}
                onChange={(e) => ((window as any).__assNote = e.target.value)}
                style={{ marginBottom: 8 }}
              />
              <InputNumber
                placeholder="赔付金额(元)"
                style={{ width: '100%' }}
                onChange={(v) => ((window as any).__assFee = v)}
              />
            </div>
          )}
        </div>
      ),
      onOk: async () => {
        try {
          const payload: any = { status, expectedVersion: data!.version };
          if (status === 'MISSING') {
            payload.compensationNote = (window as any).__assNote;
            payload.compensationFee = (window as any).__assFee;
            if (!payload.compensationNote) throw new Error('请填写赔付说明');
          }
          await withIk((ik) => assetsApi.update(a.id, { ...payload, idempotencyKey: ik }));
          message.success('已更新资产状态');
          refresh();
          fetchTimeline();
        } catch (e: any) {
          message.error(e.message);
          return Promise.reject();
        }
      },
    });
  };

  const confirmPermission = (p: any, order: 'first' | 'second') => {
    Modal.confirm({
      title: `权限移交${order === 'first' ? '第一' : '第二'}确认 - ${p.systemName}:${p.permissionName}`,
      icon: <KeyOutlined />,
      content: (
        <div>
          <AlertMsg
            type="warning"
            msg={`⚠️ 第一确认和第二确认必须由不同账号完成。您当前为【${user.name}(${ROLE_LABEL[user.role]})】`}
          />
          {order === 'first' && (
            <AlertMsg
              type="error"
              msg={
                user.role === 'ASSET_ADMIN'
                  ? '🚫 资产管理员不能确认权限项（角色越权）'
                  : '✅ 当前角色可以确认权限'
              }
            />
          )}
        </div>
      ),
      onOk: async () => {
        try {
          await withIk((ik) =>
            (order === 'first' ? permissionsApi.firstConfirm : permissionsApi.secondConfirm)(
              p.id,
              { expectedVersion: data!.version, idempotencyKey: ik }
            )
          );
          message.success('已确认权限');
          refresh();
          fetchTimeline();
        } catch (e: any) {
          message.error(e.message);
          return Promise.reject();
        }
      },
    });
  };

  const checklistCols = [
    { title: '分类', dataIndex: 'category', width: 110 },
    {
      title: '交接项',
      dataIndex: 'itemName',
      render: (v: string, r: any) => (
        <div>
          {r.isCritical && (
            <Badge status="error" text={<Tag color="red">关键</Tag>} />
          )}{' '}
          {v}
          {r.description && <div style={{ color: '#888', fontSize: 12 }}>{r.description}</div>}
          {r.returnedReason && (
            <Tag color="red" icon={<RollbackOutlined />}>
              退回项: {r.returnedReason}
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (v: ChecklistItemStatus) => (
        <Tag
          color={
            v === 'CONFIRMED'
              ? 'green'
              : v === 'NOT_APPLICABLE'
                ? 'default'
                : v === 'REJECTED'
                  ? 'red'
                  : 'orange'
          }
        >
          {v === 'PENDING'
            ? '待确认'
            : v === 'CONFIRMED'
              ? '已确认'
              : v === 'NOT_APPLICABLE'
                ? '不适用'
                : '已拒绝'}
        </Tag>
      ),
    },
    {
      title: '确认信息',
      width: 220,
      render: (_: any, r: any) =>
        r.confirmedBy ? (
          <div style={{ fontSize: 12 }}>
            <div>
              <UserOutlined /> {r.confirmedBy.name} (v{r.confirmedVersion})
            </div>
            <div style={{ color: '#888' }}>
              <ClockCircleOutlined /> {dayjs(r.confirmedAt).format('YY-MM-DD HH:mm')}
            </div>
            {r.confirmedRemark && (
              <div style={{ color: '#1677ff' }}>📝 {r.confirmedRemark}</div>
            )}
          </div>
        ) : (
          <span style={{ color: '#bbb' }}>未确认</span>
        ),
    },
    {
      title: '操作',
      width: 180,
      render: (_: any, r: any) => {
        if (isArchived) return <Tag color="blue">已归档</Tag>;
        if (isReturned && !r.returnedReason && r.status !== 'PENDING')
          return <Tag color="default">已确认项保留</Tag>;
        const canChange =
          !isArchived &&
          (user.role === 'APPLICANT' ||
            user.role === 'HANDOVER' ||
            user.role === 'RECEIVER' ||
            user.role === 'MANAGER');
        if (!canChange) return null;
        return (
          <Space size={4}>
            <Button size="small" type="primary" ghost onClick={() => confirmChecklist(r, 'CONFIRMED')}>
              确认
            </Button>
            <Button size="small" onClick={() => confirmChecklist(r, 'NOT_APPLICABLE')}>
              不适用
            </Button>
          </Space>
        );
      },
    },
  ];

  const assetCols = [
    { title: '编号', dataIndex: 'assetCode', width: 130, render: (v: string) => <code>{v}</code> },
    {
      title: '资产',
      render: (_: any, r: any) => (
        <div>
          <div>
            {r.assetName}{' '}
            <Tag style={{ margin: 0 }}>{r.category}</Tag>
          </div>
          {r.specification && <div style={{ color: '#888', fontSize: 12 }}>规格: {r.specification}</div>}
        </div>
      ),
    },
    { title: '数量', dataIndex: 'quantity', width: 60 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (v: AssetStatus) => (
        <Tag
          color={
            v === 'RETURNED'
              ? 'green'
              : v === 'MISSING'
                ? 'orange'
                : v === 'COMPENSATED'
                  ? 'purple'
                  : v === 'SOLD'
                    ? 'cyan'
                    : 'blue'
          }
        >
          {v === 'IN_POSSESSION'
            ? '占管中'
            : v === 'RETURNED'
              ? '已归还'
              : v === 'MISSING'
                ? '缺失'
                : v === 'COMPENSATED'
                  ? '已赔付'
                  : '已处置'}
        </Tag>
      ),
    },
    {
      title: '赔付信息',
      width: 220,
      render: (_: any, r: any) =>
        r.status === 'MISSING' || r.status === 'COMPENSATED' ? (
          <div style={{ fontSize: 12 }}>
            <div>
              <WalletOutlined /> 赔付说明: {r.compensationNote || '—'}
            </div>
            {r.compensationFee != null && (
              <div style={{ color: '#d4380d', fontWeight: 600 }}>金额: ¥{r.compensationFee}</div>
            )}
          </div>
        ) : (
          <span style={{ color: '#bbb' }}>—</span>
        ),
    },
    {
      title: '确认信息',
      width: 200,
      render: (_: any, r: any) =>
        r.confirmedBy ? (
          <div style={{ fontSize: 12 }}>
            <div>
              <UserOutlined /> {r.confirmedBy.name} (v{r.confirmedVersion})
            </div>
            <div style={{ color: '#888' }}>
              {dayjs(r.confirmedAt).format('YY-MM-DD HH:mm')}
            </div>
            {r.remark && <div>📝 {r.remark}</div>}
          </div>
        ) : (
          <span style={{ color: '#bbb' }}>未确认</span>
        ),
    },
    {
      title: '操作',
      width: 200,
      render: (_: any, r: any) => {
        if (isArchived) return <Tag color="blue">已归档</Tag>;
        if (user.role === 'PERMISSION_ADMIN')
          return <Tag color="red">🚫 权限管理员不可修改</Tag>;
        if (user.role !== 'ASSET_ADMIN' && user.role !== 'MANAGER' && user.role !== 'APPLICANT')
          return null;
        return (
          <Space size={4} wrap>
            <Button size="small" type="primary" ghost onClick={() => confirmAsset(r, 'RETURNED')}>
              归还
            </Button>
            <Button size="small" danger ghost onClick={() => confirmAsset(r, 'MISSING')}>
              标记缺失
            </Button>
            {r.status === 'MISSING' && (
              <Button size="small" onClick={() => confirmAsset(r, 'COMPENSATED')}>
                赔付确认
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  const permCols = [
    { title: '系统', dataIndex: 'systemName', width: 130 },
    {
      title: '权限项',
      render: (_: any, r: any) => (
        <div>
          <div>
            <KeyOutlined /> {r.permissionName}
          </div>
          {r.permissionScope && (
            <div style={{ color: '#888', fontSize: 12 }}>范围: {r.permissionScope}</div>
          )}
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (v: PermissionStatus) => (
        <Tag
          color={
            v === 'TRANSFERRED'
              ? 'green'
              : v === 'FIRST_CONFIRMED'
                ? 'cyan'
                : v === 'REVOKED'
                  ? 'red'
                  : 'orange'
          }
        >
          {v === 'TO_BE_TRANSFERRED'
            ? '待移交'
            : v === 'FIRST_CONFIRMED'
              ? '一确通过'
              : v === 'TRANSFERRED'
                ? '已移交'
                : '已撤销'}
        </Tag>
      ),
    },
    {
      title: '双人确认',
      width: 260,
      render: (_: any, r: any) => (
        <div style={{ fontSize: 12 }}>
          <div style={{ color: r.firstConfirmer ? '#389e0d' : '#888' }}>
            ① 第一确认:{' '}
            {r.firstConfirmer
              ? `${r.firstConfirmer.name} · ${dayjs(r.firstConfirmedAt).format('YY-MM-DD HH:mm')} · v${r.firstConfirmVersion}`
              : '待确认'}
          </div>
          <div style={{ color: r.secondConfirmer ? '#389e0d' : '#888', marginTop: 4 }}>
            ② 第二确认:{' '}
            {r.secondConfirmer
              ? `${r.secondConfirmer.name} · ${dayjs(r.secondConfirmedAt).format('YY-MM-DD HH:mm')} · v${r.secondConfirmVersion}`
              : '待确认'}
          </div>
          {r.transferredTo && (
            <Tag color="green" style={{ marginTop: 4 }}>
              移交至 → {r.transferredTo.name}
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: '操作',
      width: 240,
      render: (_: any, r: any) => {
        if (isArchived) return <Tag color="blue">已归档</Tag>;
        if (user.role === 'ASSET_ADMIN')
          return <Tag color="red">🚫 资产管理员不可确认</Tag>;
        if (r.status === 'TRANSFERRED' || r.status === 'REVOKED')
          return <Tag color="green">已完成</Tag>;
        return (
          <Space size={4}>
            <Button
              size="small"
              type="primary"
              ghost
              disabled={r.status !== 'TO_BE_TRANSFERRED'}
              onClick={() => confirmPermission(r, 'first')}
            >
              第一确认
            </Button>
            <Button
              size="small"
              type="primary"
              disabled={r.status !== 'FIRST_CONFIRMED'}
              onClick={() => confirmPermission(r, 'second')}
            >
              第二确认
            </Button>
          </Space>
        );
      },
    },
  ];

  const approvalCols = [
    { title: '审批人', dataIndex: ['approver', 'name'], width: 100 },
    { title: '角色', dataIndex: ['approver', 'role'], width: 130, render: (v: any) => ROLE_LABEL[v] || v },
    {
      title: '决策',
      dataIndex: 'decision',
      width: 90,
      render: (v: any) =>
        v === 'APPROVED' ? (
          <Tag color="green" icon={<CheckCircleOutlined />}>通过</Tag>
        ) : v === 'RETURNED' ? (
          <Tag color="orange" icon={<RollbackOutlined />}>退回</Tag>
        ) : (
          <Tag color="red" icon={<CloseCircleOutlined />}>拒绝</Tag>
        ),
    },
    { title: '意见', dataIndex: 'comment', ellipsis: true },
    { title: '版本', dataIndex: 'version', width: 60 },
    { title: '幂等键', dataIndex: 'idempotencyKey', width: 160, render: (v: string) => <code style={{ fontSize: 11 }}>{v}</code> },
    {
      title: '时间',
      dataIndex: 'approvedAt',
      width: 160,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
    },
  ];

  const logCols = [
    { title: '时间', dataIndex: 'createdAt', width: 160, render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss') },
    { title: '操作人', dataIndex: ['user', 'name'], width: 90, render: (v: string) => v || 'System' },
    { title: '动作', dataIndex: 'action', width: 90, render: (v: string) => <Tag color="geekblue">{v}</Tag> },
    { title: '实体', dataIndex: 'entityType', width: 150 },
    { title: '实体ID', dataIndex: 'entityId', width: 120, render: (v: string) => v ? <code style={{ fontSize: 11 }}>{v.slice(0, 8)}...</code> : '-' },
    { title: '版本', dataIndex: 'version', width: 60 },
    { title: '详情', dataIndex: 'detail', ellipsis: true },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => nav(-1)}>返回</Button>
        <b style={{ fontSize: 16 }}>
          <Tag color={STATUS_COLOR[data.status as TransferStatus] as any}>{STATUS_LABEL[data.status as TransferStatus]}</Tag>
          {editTitle ? (
            <Form
              form={titleForm}
              layout="inline"
              style={{ display: 'inline-flex', marginLeft: 8 }}
              initialValues={{ title: data.title }}
              onFinish={updateTitle}
            >
              <Form.Item name="title" style={{ marginBottom: 0 }}>
                <Input style={{ width: 380 }} />
              </Form.Item>
              <Form.Item style={{ marginBottom: 0 }}>
                <Space>
                  <Button type="primary" size="small" htmlType="submit">保存</Button>
                  <Button size="small" onClick={() => setEditTitle(false)}>取消</Button>
                </Space>
              </Form.Item>
            </Form>
          ) : (
            <span style={{ marginLeft: 8 }}>
              {data.title}{' '}
              {canEdit && (
                <Button size="small" type="link" icon={<EditOutlined />} onClick={() => setEditTitle(true)}>编辑</Button>
              )}
            </span>
          )}
        </b>
        <span style={{ color: '#999' }}>版本 v{data.version}</span>
        <code style={{ color: '#999', fontFamily: 'monospace' }}>{data.transferNo}</code>
        <Space style={{ marginLeft: 'auto' }}>
          {data.returnedReason && (
            <Tag color="red" icon={<RollbackOutlined />}>退回: {data.returnedReason}</Tag>
          )}
          {canAdvance && (
            <Tooltip title="按状态机规则合法推进">
              <Button icon={<ForwardOutlined />} onClick={advance}>推进状态</Button>
            </Tooltip>
          )}
          {canApprove && (
            <Button type="primary" icon={<CheckCircleOutlined />} onClick={showApprove}>
              审批通过
            </Button>
          )}
          {canReject && (
            <Button danger icon={<RollbackOutlined />} onClick={showReject}>退回补正</Button>
          )}
          {canArchive && (
            <Popconfirm title="归档后不可修改，确认？" onConfirm={archive}>
              <Button type="primary" icon={<InboxOutlined />} style={{ background: '#13c2c2' }}>归档</Button>
            </Popconfirm>
          )}
          {user.role === 'AUDITOR' || user.role === 'MANAGER' ? (
            <Button icon={<DownloadOutlined />} onClick={() => auditApi.exportOne(id!)}>导出TXT</Button>
          ) : null}
        </Space>
      </Space>

      <Card style={{ marginBottom: 16 }}>
        <Steps
          current={stepIdx >= 0 ? stepIdx : 5}
          status={isReturned ? 'error' : undefined}
          items={STEPS.map((s) => ({
            title: s.title,
            description: s.status === data.status ? <Badge status="processing" /> : null,
          }))}
        />
        {isReturned && (
          <div style={{ marginTop: 12, padding: 12, background: '#fff1f0', borderLeft: '4px solid #ff4d4f', borderRadius: 4 }}>
            <RollbackOutlined /> <b>当前被退回补正</b>：{data.returnedReason}
          </div>
        )}
        {isArchived && (
          <div style={{ marginTop: 12, padding: 12, background: '#f6ffed', borderLeft: '4px solid #52c41a', borderRadius: 4 }}>
            <SafetyCertificateOutlined /> <b>已归档</b> 于 {dayjs(data.archivedAt).format('YYYY-MM-DD HH:mm')}，所有修改接口被禁用。
          </div>
        )}
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title={<span><SafetyCertificateOutlined /> 关键交接项 ({criticalStats.done}/{criticalStats.total})</span>}
              value={criticalStats.pending}
              valueStyle={{ color: criticalStats.pending > 0 ? '#cf1322' : '#52c41a' }}
              suffix={`项未确认`}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={<span><WarningOutlined /> 资产缺失</span>}
              value={assetMissing}
              valueStyle={{ color: assetMissing > 0 ? '#d46b08' : '#52c41a' }}
              suffix={`项`}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={<span><KeyOutlined /> 权限移交 ({permDone}/{data.permissions.length})</span>}
              value={data.permissions.length - permDone}
              valueStyle={{ color: data.permissions.length - permDone > 0 ? '#d46b08' : '#52c41a' }}
              suffix={`项未完成`}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title={<span><AuditOutlined /> 审批记录</span>} value={data.approvals.length} suffix={`次`} />
          </Card>
        </Col>
      </Row>

      <Descriptions title="基本信息" bordered column={2} style={{ marginBottom: 16 }} size="small">
        <Descriptions.Item label="转出岗位">{data.fromDepartment} / {data.fromPosition}</Descriptions.Item>
        <Descriptions.Item label="转入岗位">{data.toDepartment} / {data.toPosition}</Descriptions.Item>
        <Descriptions.Item label="交出人">
          <Avatar size="small" style={{ background: '#faad14', marginRight: 4 }}>
            {data.fromEmployee.name.slice(0, 1)}
          </Avatar>
          {data.fromEmployee.name}
          <Tag color="geekblue">{data.fromEmployee.employeeCode}</Tag>
          <Tag color="blue">{ROLE_LABEL[data.fromEmployee.role as any] || '—'}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="接收人">
          <Avatar size="small" style={{ background: '#722ed1', marginRight: 4 }}>
            {data.toEmployee.name.slice(0, 1)}
          </Avatar>
          {data.toEmployee.name}
          <Tag color="geekblue">{data.toEmployee.employeeCode}</Tag>
          <Tag color="blue">{ROLE_LABEL[data.toEmployee.role as any] || '—'}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="主管/审批人">
          {data.approver ? (
            <>
              <Avatar size="small" style={{ background: '#13c2c2', marginRight: 4 }}>
                {data.approver.name.slice(0, 1)}
              </Avatar>
              {data.approver.name}
              <Tag color="purple">{ROLE_LABEL[data.approver.role as any]}</Tag>
            </>
          ) : (
            '—'
          )}
        </Descriptions.Item>
        <Descriptions.Item label="创建人">{data.creator.name} <Tag>{ROLE_LABEL[data.creator.role as any]}</Tag></Descriptions.Item>
        <Descriptions.Item label="生效日期">{dayjs(data.effectiveDate).format('YYYY-MM-DD')}</Descriptions.Item>
        <Descriptions.Item label="创建/更新">
          {dayjs(data.createdAt).format('YYYY-MM-DD HH:mm')}
          <br />
          <span style={{ color: '#888' }}>{dayjs(data.updatedAt).format('YYYY-MM-DD HH:mm')}</span>
        </Descriptions.Item>
        {data.reason && <Descriptions.Item label="转岗原因" span={2}>{data.reason}</Descriptions.Item>}
        {data.remark && <Descriptions.Item label="备注" span={2}>{data.remark}</Descriptions.Item>}
      </Descriptions>

      <Tabs
        defaultActiveKey="checklist"
        items={[
          {
            key: 'checklist',
            label: `📋 交接清单 (${data.checklistItems.length})`,
            children: (
              <Table
                size="small"
                rowKey="id"
                columns={checklistCols as any}
                dataSource={data.checklistItems}
                pagination={false}
              />
            ),
          },
          {
            key: 'assets',
            label: `💻 资产盘点 (${data.assets.length})`,
            children: (
              <Table
                size="small"
                rowKey="id"
                columns={assetCols as any}
                dataSource={data.assets}
                pagination={false}
                expandable={{
                  expandedRowRender: (r: any) => (
                    <div style={{ color: '#555' }}>
                      <b>资产编号:</b> {r.assetCode}<br />
                      <b>确认版本:</b> v{r.confirmedVersion ?? '-'}<br />
                      {r.remark && <><b>备注:</b> {r.remark}<br /></>}
                    </div>
                  ),
                }}
              />
            ),
          },
          {
            key: 'permissions',
            label: `🔑 权限移交 (${data.permissions.length})`,
            children: (
              <Table
                size="small"
                rowKey="id"
                columns={permCols as any}
                dataSource={data.permissions}
                pagination={false}
              />
            ),
          },
          {
            key: 'approvals',
            label: `✅ 审批记录 (${data.approvals.length})`,
            children: (
              <Table
                size="small"
                rowKey="id"
                columns={approvalCols as any}
                dataSource={data.approvals}
                pagination={false}
              />
            ),
          },
          {
            key: 'timeline',
            label: '⏳ 操作时间线',
            children: (
              <div style={{ padding: '8px 20px', background: '#fafafa', borderRadius: 8 }}>
                {loadingTl ? (
                  <Empty description="加载时间线..." />
                ) : timeline.length === 0 ? (
                  <Empty description="暂无事件" />
                ) : (
                  <Timeline
                    mode="left"
                    items={timeline.map((e, idx) => ({
                      color:
                        e.type === 'error'
                          ? 'red'
                          : e.type === 'success'
                            ? 'green'
                            : e.type === 'warning'
                              ? 'orange'
                              : 'blue',
                      dot:
                        e.icon === 'approve'
                          ? <CheckCircleOutlined />
                          : e.icon === 'reject'
                            ? <CloseCircleOutlined />
                            : e.icon === 'archive'
                              ? <SafetyCertificateOutlined />
                              : e.icon === 'return'
                                ? <RollbackOutlined />
                                : e.icon === 'asset'
                                  ? <WalletOutlined />
                                  : e.icon === 'permission'
                                    ? <KeyOutlined />
                                    : undefined,
                      children: (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ fontWeight: 600 }}>{e.title}</div>
                          <div style={{ fontSize: 12, color: '#555' }}>{e.description}</div>
                          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                            {dayjs(e.time).format('YYYY-MM-DD HH:mm:ss')}
                            {e.user && ` · ${e.user}`}
                            {e.version != null && ` · v${e.version}`}
                          </div>
                        </div>
                      ),
                    }))}
                  />
                )}
              </div>
            ),
          },
          {
            key: 'audit',
            label: `📝 审计日志 (${data.auditLogs?.length || 0})`,
            children: (
              <Table
                size="small"
                rowKey="id"
                columns={logCols as any}
                dataSource={data.auditLogs || []}
                pagination={{ pageSize: 10 }}
              />
            ),
          },
        ]}
      />
    </div>
  );
};

const AlertMsg: React.FC<{ type: 'info' | 'success' | 'warning' | 'error'; msg: string }> = ({ type, msg }) => (
  <div
    style={{
      padding: '8px 12px',
      marginBottom: 6,
      borderRadius: 4,
      background:
        type === 'success'
          ? '#f6ffed'
          : type === 'warning'
            ? '#fffbe6'
            : type === 'error'
              ? '#fff1f0'
              : '#e6f4ff',
      borderLeft: `3px solid ${type === 'success' ? '#52c41a' : type === 'warning' ? '#faad14' : type === 'error' ? '#ff4d4f' : '#1677ff'}`,
      fontSize: 12,
    }}
  >
    {msg}
  </div>
);

export default TransferDetail;
