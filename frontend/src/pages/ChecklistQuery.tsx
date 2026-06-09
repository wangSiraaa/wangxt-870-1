import React, { useEffect, useState, useMemo } from 'react';
import {
  Table,
  Form,
  Input,
  Select,
  Button,
  Space,
  Card,
  Row,
  Col,
  Tag,
  Badge,
  Statistic,
  Avatar,
  Tooltip,
  Collapse,
  Empty,
  message,
  Drawer,
  Descriptions,
  Divider,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  FileTextOutlined,
  UserOutlined,
  ClockCircleOutlined,
  SafetyCertificateOutlined,
  WalletOutlined,
  KeyOutlined,
  TeamOutlined,
  ApartmentOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import {
  checklistApi,
  ChecklistItemStatus,
  TransferStatus,
  ROLE_LABEL,
  STATUS_LABEL,
  STATUS_COLOR,
  User,
  authApi,
} from '../api';

interface ChecklistQueryParams {
  keyword?: string;
  fromDepartment?: string;
  toDepartment?: string;
  fromPosition?: string;
  toPosition?: string;
  fromEmployeeId?: string;
  toEmployeeId?: string;
  status?: ChecklistItemStatus;
  isCritical?: boolean;
  category?: string;
  confirmedById?: string;
}

interface RelatedChecklistItem {
  id: string;
  transferId: string;
  category: string;
  itemName: string;
  description?: string;
  isCritical: boolean;
  status: ChecklistItemStatus;
  sortOrder: number;
  confirmedById?: string;
  confirmedBy?: User;
  confirmedAt?: string;
  confirmedVersion?: number;
  confirmedRemark?: string;
  returnedReason?: string;
  transfer: {
    id: string;
    title: string;
    transferNo: string;
    status: TransferStatus;
    version: number;
    effectiveDate: string;
    fromEmployee: User;
    toEmployee: User;
    creator: User;
    approver?: User;
    assets: any[];
    permissions: any[];
  };
}

const ChecklistQuery: React.FC = () => {
  const nav = useNavigate();
  const [form] = Form.useForm<ChecklistQueryParams>();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RelatedChecklistItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [stats, setStats] = useState<any[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [detail, setDetail] = useState<RelatedChecklistItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    authApi.users().then(setUsers).catch(() => {});
  }, []);

  const fetchData = async (values?: ChecklistQueryParams) => {
    setLoading(true);
    try {
      const params = {
        ...(values || form.getFieldsValue()),
        page,
        pageSize,
      };
      const res = await checklistApi.relatedQuery(params);
      setData(res.list || []);
      setTotal(res.total || 0);
      setStats(res.stats || []);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, pageSize]);

  const onSearch = () => {
    setPage(1);
    fetchData();
  };

  const onReset = () => {
    form.resetFields();
    setPage(1);
    fetchData();
  };

  const statsSummary = useMemo(() => {
    const pending = stats
      .filter((s: any) => s.status === 'PENDING')
      .reduce((acc: number, s: any) => acc + s._count.id, 0);
    const confirmed = stats
      .filter((s: any) => s.status === 'CONFIRMED')
      .reduce((acc: number, s: any) => acc + s._count.id, 0);
    const criticalPending = stats
      .filter((s: any) => s.status === 'PENDING' && s.isCritical)
      .reduce((acc: number, s: any) => acc + s._count.id, 0);
    return { pending, confirmed, criticalPending, total };
  }, [stats, total]);

  const statusMap: Record<ChecklistItemStatus, { label: string; color: string }> = {
    PENDING: { label: '待确认', color: 'orange' },
    CONFIRMED: { label: '已确认', color: 'green' },
    NOT_APPLICABLE: { label: '不适用', color: 'default' },
    REJECTED: { label: '已退回', color: 'red' },
  };

  const columns = [
    {
      title: '交接项',
      dataIndex: 'itemName',
      key: 'itemName',
      render: (v: string, r: RelatedChecklistItem) => (
        <div>
          <Space>
            {r.isCritical && <Badge status="error" />}
            <Button
              type="link"
              style={{ padding: 0 }}
              onClick={() => {
                setDetail(r);
                setDrawerOpen(true);
              }}
            >
              {v}
            </Button>
          </Space>
          {r.description && (
            <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>{r.description}</div>
          )}
          {r.returnedReason && (
            <Tag color="red" style={{ marginTop: 4 }}>
              退回: {r.returnedReason}
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 110,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (v: ChecklistItemStatus) => (
        <Tag color={statusMap[v]?.color}>{statusMap[v]?.label}</Tag>
      ),
    },
    {
      title: '所属转岗申请',
      key: 'transfer',
      width: 220,
      render: (_: any, r: RelatedChecklistItem) => (
        <div>
          <Button
            type="link"
            style={{ padding: 0 }}
            onClick={() => nav(`/transfers/${r.transfer.id}`)}
          >
            {r.transfer.title}
          </Button>
          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
            <code>{r.transfer.transferNo}</code>
            <Tag
              color={STATUS_COLOR[r.transfer.status] as any}
              style={{ marginLeft: 4 }}
            >
              {STATUS_LABEL[r.transfer.status]}
            </Tag>
          </div>
        </div>
      ),
    },
    {
      title: '交出人 → 接收人',
      key: 'employees',
      width: 200,
      render: (_: any, r: RelatedChecklistItem) => (
        <div style={{ fontSize: 12 }}>
          <div>
            <Avatar size={16} style={{ backgroundColor: '#faad14', marginRight: 4 }}>
              {r.transfer.fromEmployee.name.slice(0, 1)}
            </Avatar>
            {r.transfer.fromEmployee.name}
            <span style={{ color: '#999' }}> ({r.transfer.fromPosition})</span>
          </div>
          <div style={{ color: '#666', marginTop: 4 }}>
            <Avatar size={16} style={{ backgroundColor: '#722ed1', marginRight: 4 }}>
              {r.transfer.toEmployee.name.slice(0, 1)}
            </Avatar>
            {r.transfer.toEmployee.name}
            <span style={{ color: '#999' }}> ({r.transfer.toPosition})</span>
          </div>
        </div>
      ),
    },
    {
      title: '关联资产/权限',
      key: 'related',
      width: 140,
      render: (_: any, r: RelatedChecklistItem) => (
        <Space size={8}>
          <Tooltip title={`${r.transfer.assets.length} 项资产`}>
            <Tag icon={<WalletOutlined />}>{r.transfer.assets.length}</Tag>
          </Tooltip>
          <Tooltip title={`${r.transfer.permissions.length} 项权限`}>
            <Tag icon={<KeyOutlined />} color="purple">{r.transfer.permissions.length}</Tag>
          </Tooltip>
        </Space>
      ),
    },
    {
      title: '确认信息',
      key: 'confirm',
      width: 180,
      render: (_: any, r: RelatedChecklistItem) =>
        r.confirmedBy ? (
          <div style={{ fontSize: 12 }}>
            <div>
              <UserOutlined /> {r.confirmedBy.name} · v{r.confirmedVersion}
            </div>
            <div style={{ color: '#888', marginTop: 2 }}>
              <ClockCircleOutlined /> {dayjs(r.confirmedAt).format('YY-MM-DD HH:mm')}
            </div>
            {r.confirmedRemark && (
              <Tooltip title={r.confirmedRemark}>
                <div style={{ color: '#1677ff', marginTop: 2 }}>📝 有备注</div>
              </Tooltip>
            )}
          </div>
        ) : (
          <span style={{ color: '#bbb' }}>未确认</span>
        ),
    },
    {
      title: '操作',
      key: 'action',
      width: 90,
      render: (_: any, r: RelatedChecklistItem) => (
        <Button type="link" onClick={() => nav(`/transfers/${r.transfer.id}`)}>
          详情
        </Button>
      ),
    },
  ];

  const categories = useMemo(() => {
    const set = new Set(data.map((d) => d.category));
    return Array.from(set);
  }, [data]);

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title={<span><FileTextOutlined /> 清单总数</span>}
              value={statsSummary.total}
              valueStyle={{ color: '#1677ff' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title={<span><SafetyCertificateOutlined /> 已确认</span>}
              value={statsSummary.confirmed}
              valueStyle={{ color: '#52c41a' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title={<span><ClockCircleOutlined /> 待确认</span>}
              value={statsSummary.pending}
              valueStyle={{ color: statsSummary.pending > 0 ? '#faad14' : '#52c41a' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title={<span><Badge status="error" /> 关键项待确认</span>}
              value={statsSummary.criticalPending}
              valueStyle={{ color: statsSummary.criticalPending > 0 ? '#cf1322' : '#52c41a' }}
            />
          </Col>
        </Row>
      </Card>

      <Card style={{ marginBottom: 16 }} title={<span><SearchOutlined /> 关联查询条件</span>}>
        <Form form={form} layout="inline" onFinish={onSearch}>
          <Row gutter={[16, 16]} style={{ width: '100%' }}>
            <Col span={8}>
              <Form.Item label="关键词" name="keyword">
                <Input placeholder="交接项/描述/分类" allowClear />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="交接分类" name="category">
                <Select
                  placeholder="选择分类"
                  allowClear
                  showSearch
                  options={categories.map((c) => ({ label: c, value: c }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="状态" name="status">
                <Select
                  placeholder="选择状态"
                  allowClear
                  options={Object.entries(statusMap).map(([k, v]) => ({
                    label: v.label,
                    value: k,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="是否关键项" name="isCritical">
                <Select
                  placeholder="全部/是/否"
                  allowClear
                  options={[
                    { label: '是', value: true },
                    { label: '否', value: false },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="交出人" name="fromEmployeeId">
                <Select
                  placeholder="选择交出人"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={users.map((u) => ({
                    label: `${u.name} (${u.employeeCode})`,
                    value: u.id,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="接收人" name="toEmployeeId">
                <Select
                  placeholder="选择接收人"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={users.map((u) => ({
                    label: `${u.name} (${u.employeeCode})`,
                    value: u.id,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="原部门" name="fromDepartment">
                <Input placeholder="原部门名称" allowClear />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="目标部门" name="toDepartment">
                <Input placeholder="目标部门名称" allowClear />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="原岗位" name="fromPosition">
                <Input placeholder="原岗位名称" allowClear />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="目标岗位" name="toPosition">
                <Input placeholder="目标岗位名称" allowClear />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="确认人" name="confirmedById">
                <Select
                  placeholder="选择确认人"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={users.map((u) => ({
                    label: `${u.name} (${u.employeeCode})`,
                    value: u.id,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Divider style={{ margin: '12px 0' }} />
          <Space>
            <Button type="primary" icon={<SearchOutlined />} htmlType="submit">
              查询
            </Button>
            <Button icon={<ReloadOutlined />} onClick={onReset}>
              重置
            </Button>
          </Space>
        </Form>
      </Card>

      <Card
        title={
          <Space>
            <FileTextOutlined />
            <span>交接清单关联查询结果</span>
            <Tag color="blue">共 {total} 条</Tag>
          </Space>
        }
      >
        <Table
          size="small"
          rowKey="id"
          loading={loading}
          columns={columns as any}
          dataSource={data}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
          locale={{ emptyText: <Empty description="暂无数据" /> }}
        />
      </Card>

      <Drawer
        title="交接项详情（含关联信息）"
        width={720}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      >
        {detail && (
          <div>
            <Descriptions title="交接项信息" bordered column={2} size="small">
              <Descriptions.Item label="分类">{detail.category}</Descriptions.Item>
              <Descriptions.Item label="关键项">
                {detail.isCritical ? <Tag color="red">是</Tag> : <Tag>否</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="交接项" span={2}>
                {detail.itemName}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusMap[detail.status]?.color}>
                  {statusMap[detail.status]?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="排序">{detail.sortOrder}</Descriptions.Item>
              {detail.description && (
                <Descriptions.Item label="描述" span={2}>
                  {detail.description}
                </Descriptions.Item>
              )}
              {detail.confirmedRemark && (
                <Descriptions.Item label="确认备注" span={2}>
                  {detail.confirmedRemark}
                </Descriptions.Item>
              )}
              {detail.confirmedBy && (
                <>
                  <Descriptions.Item label="确认人">
                    {detail.confirmedBy.name} ({detail.confirmedBy.employeeCode})
                  </Descriptions.Item>
                  <Descriptions.Item label="确认版本">
                    v{detail.confirmedVersion}
                  </Descriptions.Item>
                  <Descriptions.Item label="确认时间" span={2}>
                    {dayjs(detail.confirmedAt).format('YYYY-MM-DD HH:mm:ss')}
                  </Descriptions.Item>
                </>
              )}
            </Descriptions>

            <Divider orientation="left">
              <TeamOutlined /> 关联转岗申请
            </Divider>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="申请标题" span={2}>
                <Button type="link" onClick={() => nav(`/transfers/${detail.transfer.id}`)}>
                  {detail.transfer.title}
                </Button>
              </Descriptions.Item>
              <Descriptions.Item label="申请编号">
                <code>{detail.transfer.transferNo}</code>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_COLOR[detail.transfer.status] as any}>
                  {STATUS_LABEL[detail.transfer.status]}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="版本">v{detail.transfer.version}</Descriptions.Item>
              <Descriptions.Item label="生效日期">
                {dayjs(detail.transfer.effectiveDate).format('YYYY-MM-DD')}
              </Descriptions.Item>
              <Descriptions.Item label="交出人">
                <Avatar size="small" style={{ backgroundColor: '#faad14', marginRight: 4 }}>
                  {detail.transfer.fromEmployee.name.slice(0, 1)}
                </Avatar>
                {detail.transfer.fromEmployee.name}
                <Tag>{ROLE_LABEL[detail.transfer.fromEmployee.role as any]}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="接收人">
                <Avatar size="small" style={{ backgroundColor: '#722ed1', marginRight: 4 }}>
                  {detail.transfer.toEmployee.name.slice(0, 1)}
                </Avatar>
                {detail.transfer.toEmployee.name}
                <Tag>{ROLE_LABEL[detail.transfer.toEmployee.role as any]}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="原岗位">
                <ApartmentOutlined /> {detail.transfer.fromEmployee.department} /{' '}
                {detail.transfer.fromPosition}
              </Descriptions.Item>
              <Descriptions.Item label="目标岗位">
                <ApartmentOutlined /> {detail.transfer.toEmployee.department} /{' '}
                {detail.transfer.toPosition}
              </Descriptions.Item>
            </Descriptions>

            {detail.transfer.assets.length > 0 && (
              <>
                <Divider orientation="left">
                  <WalletOutlined /> 关联资产清单 ({detail.transfer.assets.length})
                </Divider>
                <Table
                  size="small"
                  rowKey="id"
                  pagination={false}
                  columns={[
                    { title: '编号', dataIndex: 'assetCode', render: (v) => <code>{v}</code> },
                    { title: '名称', dataIndex: 'assetName' },
                    { title: '分类', dataIndex: 'category' },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      render: (v) => <Tag>{v}</Tag>,
                    },
                    {
                      title: '确认人',
                      dataIndex: ['confirmedBy', 'name'],
                      render: (v) => v || '-',
                    },
                  ]}
                  dataSource={detail.transfer.assets}
                />
              </>
            )}

            {detail.transfer.permissions.length > 0 && (
              <>
                <Divider orientation="left">
                  <KeyOutlined /> 关联权限移交 ({detail.transfer.permissions.length})
                </Divider>
                <Table
                  size="small"
                  rowKey="id"
                  pagination={false}
                  columns={[
                    { title: '系统', dataIndex: 'systemName' },
                    { title: '权限', dataIndex: 'permissionName' },
                    { title: '范围', dataIndex: 'permissionScope' },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      render: (v) => <Tag color="purple">{v}</Tag>,
                    },
                    {
                      title: '第一确认',
                      dataIndex: ['firstConfirmer', 'name'],
                      render: (v) => v || '待确认',
                    },
                    {
                      title: '第二确认',
                      dataIndex: ['secondConfirmer', 'name'],
                      render: (v) => v || '待确认',
                    },
                  ]}
                  dataSource={detail.transfer.permissions}
                />
              </>
            )}

            <Divider />
            <Space>
              <Button type="primary" onClick={() => nav(`/transfers/${detail.transfer.id}`)}>
                跳转至转岗详情
              </Button>
              <Button onClick={() => setDrawerOpen(false)}>关闭</Button>
            </Space>
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default ChecklistQuery;
