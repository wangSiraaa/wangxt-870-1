import React, { useEffect, useState } from 'react';
import {
  Table,
  Tag,
  Card,
  Row,
  Col,
  Statistic,
  DatePicker,
  Input,
  Select,
  Form,
  Button,
  Space,
  message,
  Modal,
  Drawer,
  Timeline,
  Badge,
} from 'antd';
import {
  SearchOutlined,
  DownloadOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
  AuditOutlined,
  FileTextOutlined,
  UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { auditApi, User, ROLE_LABEL, STATUS_LABEL, STATUS_COLOR, TransferStatus } from '../api';

interface Props {
  user: User;
}

const AuditPage: React.FC<Props> = ({ user }) => {
  const [form] = Form.useForm();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<{ list: any[]; total: number }>({ list: [], total: 0 });
  const [stats, setStats] = useState<any>(null);
  const [tlTransferId, setTlTransferId] = useState<string | null>(null);
  const [tlVisible, setTlVisible] = useState(false);
  const [timeline, setTimeline] = useState<any[]>([]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const p: any = { ...filters, page, pageSize };
      if (p.dateRange?.length) {
        p.startDate = p.dateRange[0].startOf('day').toISOString();
        p.endDate = p.dateRange[1].endOf('day').toISOString();
      }
      delete p.dateRange;
      const r = await auditApi.logs(p);
      setLogs(r);
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
    fetchStats();
    fetchLogs();
  }, [filters, page, pageSize]);

  const showTimeline = async (transferId: string) => {
    setTlTransferId(transferId);
    setTlVisible(true);
    try {
      const tl = await auditApi.timeline(transferId);
      setTimeline(tl || []);
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const logCols = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '操作人',
      width: 150,
      render: (_: any, r: any) =>
        r.user ? (
          <span>
            <UserOutlined /> {r.user.name}
            <Tag style={{ marginLeft: 4, fontSize: 11 }}>
              {ROLE_LABEL[r.user.role as any] || r.user.role}
            </Tag>
          </span>
        ) : (
          'System'
        ),
    },
    {
      title: '动作',
      dataIndex: 'action',
      width: 100,
      render: (v: string) => {
        const cm: any = {
          CREATE: 'green',
          UPDATE: 'blue',
          DELETE: 'red',
          CONFIRM: 'cyan',
          APPROVE: 'green',
          REJECT: 'orange',
          RETURN: 'orange',
          ARCHIVE: 'purple',
          EXPORT: 'geekblue',
          LOGIN: 'default',
          ADVANCE: 'cyan',
        };
        return <Tag color={cm[v] || 'default'}>{v}</Tag>;
      },
    },
    {
      title: '实体类型',
      dataIndex: 'entityType',
      width: 160,
      filters: [
        { text: '转岗申请', value: 'TransferApplication' },
        { text: '交接项', value: 'ChecklistItem' },
        { text: '资产', value: 'AssetHandover' },
        { text: '权限', value: 'PermissionConfirmation' },
        { text: '审批', value: 'ApprovalRecord' },
      ],
      onFilter: (v: any, r: any) => r.entityType === v,
    },
    {
      title: '关联申请',
      width: 180,
      render: (_: any, r: any) =>
        r.transfer ? (
          <a onClick={() => showTimeline(r.transferId)}>
            <FileTextOutlined /> {r.transfer.transferNo}
            <Tag
              color={STATUS_COLOR[r.transfer.status as TransferStatus] as any}
              style={{ marginLeft: 4 }}
            >
              {STATUS_LABEL[r.transfer.status as TransferStatus]}
            </Tag>
          </a>
        ) : (
          <span style={{ color: '#bbb' }}>—</span>
        ),
    },
    { title: '版本', dataIndex: 'version', width: 60, render: (v: number) => (v != null ? `v${v}` : '-') },
    {
      title: '详情',
      dataIndex: 'detail',
      ellipsis: true,
    },
    {
      title: '变更快照',
      width: 100,
      render: (_: any, r: any) => (
        <Button
          size="small"
          type="link"
          disabled={!r.oldValue && !r.newValue}
          onClick={() =>
            Modal.info({
              title: '字段变更快照',
              width: 760,
              content: (
                <Row gutter={12}>
                  <Col span={12}>
                    <Card size="small" title="变更前 oldValue">
                      <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 420, overflow: 'auto' }}>
                        {r.oldValue ? JSON.stringify(r.oldValue, null, 2) : '(无)'}
                      </pre>
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small" title="变更后 newValue">
                      <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 420, overflow: 'auto' }}>
                        {r.newValue ? JSON.stringify(r.newValue, null, 2) : '(无)'}
                      </pre>
                    </Card>
                  </Col>
                </Row>
              ),
            })
          }
        >
          查看
        </Button>
      ),
    },
  ];

  return (
    <div>
      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={4}>
            <Card>
              <Statistic title={<><AuditOutlined /> 申请总数</>} value={stats.total} />
            </Card>
          </Col>
          <Col span={4}>
            <Card>
              <Statistic
              title={<><ExclamationCircleOutlined /> 关键未确认</>}
              value={stats.unconfirmedCritical}
              valueStyle={{ color: '#cf1322' }}
            />
            </Card>
          </Col>
          <Col span={4}>
            <Card>
              <Statistic
                title={<><WarningOutlined /> 资产缺失</>}
                value={stats.missingAssets}
                valueStyle={{ color: '#d46b08' }}
              />
            </Card>
          </Col>
          {Object.entries(stats.byStatus || []).map(([k, v]: any) => (
            <Col span={4} key={k}>
              <Card>
                <Statistic
                  title={STATUS_LABEL[k as TransferStatus] || k}
                  value={v?._count?.id || 0}
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Card
        title={
          <Space>
            <AuditOutlined /> 审计追溯
            <Badge count={logs.total} offset={[4, -2]} />
          </Space>
        }
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchLogs}>
              刷新
            </Button>
            <Button icon={<DownloadOutlined />} type="primary" onClick={() => auditApi.exportAll(filters)}>
              导出CSV
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="inline" style={{ marginBottom: 16 }} onFinish={(v) => { setFilters(v); setPage(1); }}>
          <Form.Item name="action" label="动作">
            <Select
              placeholder="全部"
              allowClear
              style={{ width: 130 }}
              options={['CREATE', 'UPDATE', 'DELETE', 'CONFIRM', 'APPROVE', 'RETURN', 'ARCHIVE', 'ADVANCE'].map((v) => ({ value: v, label: v }))}
            />
          </Form.Item>
          <Form.Item name="entityType" label="实体">
            <Select
              placeholder="全部"
              allowClear
              style={{ width: 170 }}
              options={[
                { value: 'TransferApplication', label: '转岗申请' },
                { value: 'ChecklistItem', label: '交接项' },
                { value: 'AssetHandover', label: '资产' },
                { value: 'PermissionConfirmation', label: '权限' },
                { value: 'ApprovalRecord', label: '审批' },
              ].map((o) => ({ value: o.value, label: o.label }))}
            />
          </Form.Item>
          <Form.Item name="dateRange" label="时间">
            <DatePicker.RangePicker />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>查询</Button>
              <Button onClick={() => { form.resetFields(); setFilters({}); setPage(1); }}>重置</Button>
            </Space>
          </Form.Item>
        </Form>

        <Table
          size="small"
          rowKey="id"
          loading={loading}
          columns={logCols as any}
          dataSource={logs.list}
          pagination={{
            current: page,
            pageSize,
            total: logs.total,
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条审计记录`,
          }}
        />
      </Card>

      <Drawer
        title={
          <>
            <SafetyCertificateOutlined /> 操作时间线
            {tlTransferId && <Tag color="default">申请ID: {tlTransferId.slice(0, 8)}...</Tag>}
          </>
        }
        width={560}
        open={tlVisible}
        onClose={() => setTlVisible(false)}
      >
        {timeline.length === 0 ? (
          <span style={{ color: '#888' }}>暂无时间线事件</span>
        ) : (
          <Timeline
            mode="left"
            items={timeline.map((e) => ({
              color:
                e.type === 'error' ? 'red'
                : e.type === 'success' ? 'green'
                : e.type === 'warning' ? 'orange'
                : 'blue',
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
      </Drawer>
    </div>
  );
};

export default AuditPage;
