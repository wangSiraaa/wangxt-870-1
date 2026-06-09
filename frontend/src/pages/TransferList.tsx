import React, { useEffect, useState } from 'react';
import {
  Table,
  Tag,
  Button,
  Space,
  Card,
  Row,
  Col,
  Statistic,
  Input,
  Select,
  Form,
  message,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  EyeOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Transfer,
  User,
  transferApi,
  auditApi,
  STATUS_LABEL,
  STATUS_COLOR,
  ROLE_LABEL,
} from '../api';

interface Props {
  user: User;
}

const TransferList: React.FC<Props> = ({ user }) => {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ list: Transfer[]; total: number }>({ list: [], total: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<any>({});
  const [stats, setStats] = useState<any>(null);
  const [form] = Form.useForm();

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await transferApi.list({
        ...filters,
        page,
        pageSize,
      });
      setData(res);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const s = await auditApi.stats();
      setStats(s);
    } catch (_) {}
  };

  useEffect(() => {
    fetchList();
    fetchStats();
  }, [filters, page, pageSize]);

  const columns = [
    {
      title: '申请编号',
      dataIndex: 'transferNo',
      width: 150,
      render: (v: string) => <b style={{ fontFamily: 'monospace' }}>{v}</b>,
    },
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
      render: (v: string, r: Transfer) => (
        <div>
          <div>{v}</div>
          <div style={{ fontSize: 12, color: '#888' }}>
            {r.fromDepartment}/{r.fromPosition} → {r.toDepartment}/{r.toPosition}
          </div>
        </div>
      ),
    },
    {
      title: '交出人 / 接收人',
      width: 180,
      render: (_: any, r: Transfer) => (
        <div style={{ fontSize: 13 }}>
          <div style={{ color: '#d4380d' }}>↗ {r.fromEmployee.name}</div>
          <div style={{ color: '#389e0d' }}>↘ {r.toEmployee.name}</div>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (v: Transfer['status'], r: Transfer) => (
        <Space direction="vertical" size={2}>
          <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag>
          {r.checklistItems?.filter((c) => c.isCritical && c.status === 'PENDING').length > 0 && (
            <Tag icon={<ExclamationCircleOutlined />} color="red">
              关键未确认
            </Tag>
          )}
          {r.assets?.some((a) => a.status === 'MISSING') && (
            <Tag icon={<WarningOutlined />} color="orange">
              资产缺失
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: '主管',
      dataIndex: ['approver', 'name'],
      width: 90,
      render: (v: string) => v || '-',
    },
    {
      title: '生效日',
      dataIndex: 'effectiveDate',
      width: 110,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
    {
      title: '版本',
      dataIndex: 'version',
      width: 60,
    },
    {
      title: '操作',
      width: 110,
      fixed: 'right' as const,
      render: (_: any, r: Transfer) => (
        <Space>
          <Tooltip title="查看详情">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => nav(`/detail/${r.id}`)}
            >
              详情
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={4}>
            <Card>
              <Statistic title="申请总数" value={stats.total || 0} />
            </Card>
          </Col>
          <Col span={4}>
            <Card>
              <Statistic
                title="关键事项未确认"
                value={stats.unconfirmedCritical || 0}
                valueStyle={{ color: '#cf1322' }}
              />
            </Card>
          </Col>
          <Col span={4}>
            <Card>
              <Statistic
                title="资产缺失"
                value={stats.missingAssets || 0}
                valueStyle={{ color: '#d46b08' }}
              />
            </Card>
          </Col>
          {Object.entries(stats.byStatus || []).map(([k, v]: any) => (
            <Col span={4} key={k}>
              <Card>
                <Statistic
                  title={STATUS_LABEL[k as keyof typeof STATUS_LABEL] || k}
                  value={v?._count?.id || 0}
                  prefix={<Tag color={STATUS_COLOR[k as keyof typeof STATUS_COLOR] || 'default'}> </Tag>}
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Card
        title="申请列表"
        extra={
          (user.role === 'APPLICANT' || user.role === 'MANAGER') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => nav('/create')}>
              新建申请
            </Button>
          )
        }
      >
        <Form
          form={form}
          layout="inline"
          style={{ marginBottom: 16 }}
          onFinish={(v) => {
            setFilters(v);
            setPage(1);
          }}
          initialValues={{ status: undefined, risk: undefined, keyword: '' }}
        >
          <Form.Item name="keyword" label="关键字">
            <Input placeholder="编号/标题" style={{ width: 180 }} allowClear />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              placeholder="全部"
              allowClear
              style={{ width: 150 }}
              options={Object.entries(STATUS_LABEL).map(([k, v]) => ({ value: k, label: v }))}
            />
          </Form.Item>
          <Form.Item name="risk" label="风险项">
            <Select
              placeholder="全部"
              allowClear
              style={{ width: 180 }}
              options={[
                { value: 'has_missing_asset', label: '资产缺失' },
                { value: 'has_unconfirmed_critical', label: '关键未确认' },
              ]}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
                筛选
              </Button>
              <Button
                onClick={() => {
                  form.resetFields();
                  setFilters({});
                  setPage(1);
                }}
              >
                重置
              </Button>
            </Space>
          </Form.Item>
          <Form.Item label="当前角色" style={{ marginLeft: 'auto' }}>
            <Tag color="blue">{ROLE_LABEL[user.role]}</Tag>
          </Form.Item>
        </Form>

        <Table<Transfer>
          loading={loading}
          rowKey="id"
          columns={columns as any}
          dataSource={data.list}
          pagination={{
            current: page,
            pageSize,
            total: data.total,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
          }}
        />
      </Card>
    </div>
  );
};

export default TransferList;
