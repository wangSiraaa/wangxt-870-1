import React, { useEffect, useState } from 'react';
import { Form, Input, Select, DatePicker, Button, Card, message, Space, Row, Col, Descriptions, Tag } from 'antd';
import { ArrowLeftOutlined, SaveOutlined, ThunderboltOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { authApi, transferApi, withIk, User, ROLE_LABEL } from '../api';

interface Props {
  user: User;
}

interface UserOption {
  id: string;
  name: string;
  employeeCode: string;
  department: string;
  position: string;
  role: string;
}

const TransferCreate: React.FC<Props> = ({ user }) => {
  const nav = useNavigate();
  const [form] = Form.useForm();
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    authApi.users().then((u) => setUsers(u.list || u)).catch(() => {});
  }, []);

  const fromId = Form.useWatch('fromEmployeeId', form);
  const toId = Form.useWatch('toEmployeeId', form);
  const fromU = users.find((u) => u.id === fromId);
  const toU = users.find((u) => u.id === toId);

  const submit = async (saveAsDraft: boolean) => {
    try {
      const values = await form.validateFields();
      if (values.fromEmployeeId === values.toEmployeeId) {
        message.error('交出人和接收人不能是同一人');
        return;
      }
      setSubmitting(true);
      const payload = {
        ...values,
        effectiveDate: values.effectiveDate?.toISOString(),
        creatorId: user.id,
        saveAsDraft,
      };
      const r = await withIk((ik) => transferApi.create({ ...payload, idempotencyKey: ik }));
      message.success(saveAsDraft ? '已保存草稿' : '已创建申请（按岗位模板生成清单）');
      nav(`/detail/${r.id}`);
    } catch (e: any) {
      message.error(e.message || '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => nav(-1)}>返回</Button>
        <b style={{ fontSize: 16 }}>新建转岗交接申请</b>
        <span style={{ color: '#888' }}>创建后将根据转出/转入岗位模板自动生成交接清单</span>
      </Space>

      <Row gutter={16}>
        <Col span={15}>
          <Card title="申请信息" bordered={true}>
            <Form form={form} layout="vertical" initialValues={{ effectiveDate: dayjs().add(7, 'day') }}>
              <Row gutter={12}>
                <Col span={24}>
                  <Form.Item
                    label="申请标题"
                    name="title"
                    rules={[{ required: true, message: '请填写申请标题' }]}
                  >
                    <Input placeholder="例：张三从研发一部转岗至测试部" showCount maxLength={100} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    label={<><UserOutlined /> 交出人（转出员工）</>}
                    name="fromEmployeeId"
                    rules={[{ required: true, message: '请选择交出人' }]}
                  >
                    <Select
                      showSearch
                      placeholder="搜索员工姓名/工号"
                      optionFilterProp="label"
                      loading={loading}
                      options={users.map((u) => ({
                        value: u.id,
                        label: `${u.employeeCode} ${u.name} · ${u.department}/${u.position}`,
                      }))}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    label={<><UserOutlined /> 接收人（转入员工）</>}
                    name="toEmployeeId"
                    rules={[{ required: true, message: '请选择接收人' }]}
                  >
                    <Select
                      showSearch
                      placeholder="搜索员工姓名/工号"
                      optionFilterProp="label"
                      loading={loading}
                      options={users
                        .filter((u) => u.id !== fromId)
                        .map((u) => ({
                          value: u.id,
                          label: `${u.employeeCode} ${u.name} · ${u.department}/${u.position}`,
                        }))}
                    />
                  </Form.Item>
                </Col>
                {fromU && (
                  <Col span={12}>
                    <Descriptions size="small" column={1} style={{ marginTop: -10 }}>
                      <Descriptions.Item label="转出部门/岗位">
                        <Tag>{fromU.department}</Tag> / <Tag color="geekblue">{fromU.position}</Tag>
                      </Descriptions.Item>
                    </Descriptions>
                  </Col>
                )}
                {toU && (
                  <Col span={12}>
                    <Descriptions size="small" column={1} style={{ marginTop: -10 }}>
                      <Descriptions.Item label="转入部门/岗位">
                        <Tag>{toU.department}</Tag> / <Tag color="geekblue">{toU.position}</Tag>
                      </Descriptions.Item>
                    </Descriptions>
                  </Col>
                )}
                <Col span={12}>
                  <Form.Item
                    label="主管/审批人"
                    name="approverId"
                    rules={[{ required: true, message: '请选择审批人' }]}
                  >
                    <Select
                      showSearch
                      placeholder="选择主管"
                      optionFilterProp="label"
                      options={users
                        .filter((u) => u.role === 'MANAGER')
                        .map((u) => ({
                          value: u.id,
                          label: `${u.employeeCode} ${u.name} · ${u.department}/${u.position} · ${ROLE_LABEL[u.role as any]}`,
                        }))}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    label="生效日期"
                    name="effectiveDate"
                    rules={[{ required: true, message: '请选择生效日期' }]}
                  >
                    <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isBefore(dayjs().subtract(1, 'day'))} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="转出部门（可覆盖）" name="fromDepartment">
                    <Input placeholder="不填则以交出人当前部门为准" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="转入部门（可覆盖）" name="toDepartment">
                    <Input placeholder="不填则以接收人当前部门为准" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="转出岗位（可覆盖）" name="fromPosition">
                    <Input placeholder="不填则以交出人当前岗位为准" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="转入岗位（可覆盖）" name="toPosition">
                    <Input placeholder="不填则以接收人当前岗位为准" />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item label="转岗原因" name="reason">
                    <Input.TextArea rows={3} placeholder="请填写转岗原因" maxLength={500} showCount />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item label="备注说明" name="remark">
                    <Input.TextArea rows={2} placeholder="补充说明" maxLength={300} showCount />
                  </Form.Item>
                </Col>
              </Row>
              <Space>
                <Button
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  loading={submitting}
                  onClick={() => submit(false)}
                >
                  创建并生成清单
                </Button>
                <Button icon={<SaveOutlined />} loading={submitting} onClick={() => submit(true)}>
                  仅保存草稿
                </Button>
                <Button onClick={() => form.resetFields()}>重置</Button>
              </Space>
            </Form>
          </Card>
        </Col>
        <Col span={9}>
          <Card title="💡 操作提示" type="inner">
            <div style={{ lineHeight: 1.9, fontSize: 13 }}>
              <p>• 创建后将根据 <b>转出岗位+转入岗位</b> 自动匹配 PositionTemplate 生成交接清单</p>
              <p>• 交出人与接收人 <b>不能是同一账号</b>（由后端强制校验）</p>
              <p>• 交接流程由状态机严格控制：</p>
              <div style={{ paddingLeft: 16, fontSize: 12, color: '#555' }}>
                草稿 → 待交接 → 资产核对中 → 权限确认中 → 主管审批 → 待归档 → 已归档
              </div>
              <p style={{ marginTop: 10 }}>
                • <Tag color="red">关键项</Tag> 未完成无法推进到资产核对环节
              </p>
              <p>• 资产缺失必须填写 <b>赔付说明+金额</b>，阻塞归档</p>
              <p>• 权限移交必须由 <b>两个不同账号</b> 完成双人确认</p>
              <p>• <Tag color="blue">资产管理员</Tag> 不可确认权限</p>
              <p>• <Tag color="purple">权限管理员</Tag> 不可修改赔付</p>
              <p>• 同一审批幂等键 <b>重放不重复落库</b></p>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default TransferCreate;
