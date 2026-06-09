import React, { useState, useEffect } from 'react';
import { Layout, Menu, Avatar, Dropdown, Badge } from 'antd';
import {
  UserOutlined,
  AppstoreOutlined,
  FileTextOutlined,
  AuditOutlined,
  LogoutOutlined,
  ProfileOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import TransferList from './pages/TransferList';
import TransferDetail from './pages/TransferDetail';
import TransferCreate from './pages/TransferCreate';
import AuditPage from './pages/AuditPage';
import ChecklistQuery from './pages/ChecklistQuery';
import { User, authApi, ROLE_LABEL } from './api';

const { Header, Sider, Content } = Layout;

const Protected: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const user = (() => {
    const s = localStorage.getItem('user');
    return s ? (JSON.parse(s) as User) : null;
  })();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const App: React.FC = () => {
  const nav = useNavigate();
  const loc = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const s = localStorage.getItem('user');
    if (s) {
      try {
        setUser(JSON.parse(s));
      } catch {}
    }
  }, [loc.pathname]);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userId');
    localStorage.removeItem('idempotencyKey');
    setUser(null);
    nav('/login');
  };

  const onLogin = (u: User, token: string) => {
    localStorage.setItem('user', JSON.stringify(u));
    localStorage.setItem('token', token);
    localStorage.removeItem('userId');
    setUser(u);
    nav('/');
  };

  if (!user && loc.pathname !== '/login') {
    return <Navigate to="/login" replace />;
  }
  if (loc.pathname === '/login') return <Login onLogin={onLogin} />;

  const canAudit = user?.role === 'AUDITOR' || user?.role === 'MANAGER';
  const canCreate = user?.role === 'APPLICANT' || user?.role === 'MANAGER';

  const menuItems = [
    { key: '/', icon: <AppstoreOutlined />, label: '交接清单' },
    { key: '/checklist-query', icon: <SearchOutlined />, label: '关联查询' },
    ...(canCreate
      ? [{ key: '/create', icon: <PlusOutlined />, label: '新建申请' }]
      : []),
    ...(canAudit
      ? [{ key: '/audit', icon: <AuditOutlined />, label: '审计追溯' }]
      : []),
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
        <div
          style={{
            color: '#fff',
            padding: 16,
            fontSize: collapsed ? 14 : 16,
            fontWeight: 600,
            textAlign: 'center',
            borderBottom: '1px solid #0f2033',
          }}
        >
          {collapsed ? '交接' : '员工转岗交接'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[loc.pathname]}
          items={menuItems}
          onClick={({ key }) => nav(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 500 }}>
            <ProfileOutlined style={{ marginRight: 8 }} />
            员工转岗交接清单管理
          </div>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'profile',
                  icon: <UserOutlined />,
                  label: `${user?.name}（${user ? ROLE_LABEL[user.role] : ''}）`,
                  disabled: true,
                },
                {
                  key: 'empcode',
                  icon: <Badge status="processing" />,
                  label: `工号: ${user?.employeeCode}`,
                  disabled: true,
                },
                { type: 'divider' as const },
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: '退出登录',
                  onClick: logout,
                },
              ],
            }}
          >
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar size="small" style={{ backgroundColor: '#1677ff' }} icon={<UserOutlined />} />
              <span style={{ color: 'rgba(0,0,0,0.85)' }}>
                {user?.name}
              </span>
            </div>
          </Dropdown>
        </Header>
        <Content style={{ padding: 24, background: '#f5f7fa' }}>
          <Routes>
            <Route
              path="/"
              element={
                <Protected>
                  <TransferList />
                </Protected>
              }
            />
            <Route
              path="/create"
              element={
                <Protected>
                  <TransferCreate />
                </Protected>
              }
            />
            <Route
              path="/transfers/:id"
              element={
                <Protected>
                  <TransferDetail />
                </Protected>
              }
            />
            <Route
              path="/audit"
              element={
                <Protected>
                  <AuditPage />
                </Protected>
              }
            />
            <Route
              path="/checklist-query"
              element={
                <Protected>
                  <ChecklistQuery />
                </Protected>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;
