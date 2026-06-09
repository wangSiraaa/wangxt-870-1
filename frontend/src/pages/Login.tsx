import React, { useState } from 'react';
import { Card, Form, Input, Button, Typography, message, Row, Col } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { authApi, ROLE_LABEL, User } from '../api';

const { Title, Paragraph, Text } = Typography;

const Accounts: { code: string; role: keyof typeof ROLE_LABEL; name: string }[] = [
  { code: 'EMP001', role: 'APPLICANT', name: '赵申请人' },
  { code: 'EMP002', role: 'HANDOVER', name: '钱交出' },
  { code: 'EMP003', role: 'RECEIVER', name: '孙接收' },
  { code: 'EMP004', role: 'ASSET_ADMIN', name: '周资产' },
  { code: 'EMP005', role: 'PERMISSION_ADMIN', name: '吴权限' },
  { code: 'EMP006', role: 'MANAGER', name: '郑主管' },
  { code: 'EMP007', role: 'AUDITOR', name: '王审计' },
];

interface Props {
  onLogin: (u: User, token: string) => void;
}

const Login: React.FC<Props> = ({ onLogin }) => {
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const submit = async (values: { employeeCode: string }) => {
    setLoading(true);
    try {
      const res = await authApi.login(values.employeeCode.trim().toUpperCase());
      message.success(`欢迎 ${res.user.name}（${ROLE_LABEL[res.user.role]}）`);
      onLogin(res.user, res.token);
    } catch (e: any) {
      message.error(e.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: 20,
      }}
    >
      <Row gutter={32} align="middle" style={{ maxWidth: 1100, width: '100%' }}>
        <Col xs={24} md={14}>
          <div style={{ color: '#fff' }}>
            <Title level={2} style={{ color: '#fff', marginBottom: 16 }}>
              员工转岗交接清单管理
            </Title>
            <Paragraph style={{ color: 'rgba(255,255,255,0.9)', fontSize: 15, lineHeight: 1.8 }}>
              覆盖申请创建、岗位模板生成清单、交接项维护、资产盘点与赔付、权限双人移交、
              主管审批、退回补正、归档、审计追溯的全流程管理。
            </Paragraph>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>
              <div>✅ 状态机驱动流程推进</div>
              <div>✅ 角色权限矩阵与越权防护</div>
              <div>✅ 接口级幂等 + 乐观锁版本控制</div>
              <div>✅ 审计日志 + 时间线 + 数据导出</div>
            </div>
          </div>
        </Col>
        <Col xs={24} md={10}>
          <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <Title level={3} style={{ textAlign: 'center', marginTop: 0 }}>
              登录
            </Title>
            <Form form={form} layout="vertical" onFinish={submit} initialValues={{ employeeCode: 'EMP006' }}>
              <Form.Item
                label="工号（Employee Code）"
                name="employeeCode"
                rules={[{ required: true, message: '请输入工号' }]}
              >
                <Input size="large" prefix={<UserOutlined />} placeholder="如：EMP006" />
              </Form.Item>
              <Form.Item label="密码（演示环境留空）">
                <Input size="large" prefix={<LockOutlined />} placeholder="演示环境无需填写" disabled />
              </Form.Item>
              <Button type="primary" size="large" htmlType="submit" block loading={loading}>
                登录
              </Button>
            </Form>
            <div style={{ marginTop: 16, padding: 12, background: '#f5f7fa', borderRadius: 6 }}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                快速选择测试账号：
              </Text>
              {Accounts.map((a) => (
                <Button
                  key={a.code}
                  size="small"
                  type="link"
                  style={{ padding: '0 8px' }}
                  onClick={() => {
                    form.setFieldsValue({ employeeCode: a.code });
                    submit({ employeeCode: a.code });
                  }}
                >
                  {a.code} {a.name}({ROLE_LABEL[a.role]})
                </Button>
              ))}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Login;
