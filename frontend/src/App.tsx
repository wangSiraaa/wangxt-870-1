import React, { useState, useEffect } from 'react';
import { Layout, Menu, Avatar, Dropdown, Badge } from 'antd';
import {
  UserOutlined,
  AppstoreOutlined,
  FileTextOutlined,
  AuditOutlined,
  LogoutOutlined,
  ProfileOutlined,
} from '@ant-design/icons';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import TransferList from './pages/TransferList';
import TransferDetail from './pages/TransferDetail';
import TransferCreate from './pages/TransferCreate';
import AuditPage from './pages/AuditPage';
import { User, authApi, ROLE_LABEL } from './api';

const { Header, Sider, Content } = Layout;

const Protected: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [me] = useState<User | null>(() => {
    const s = localStorage.getItem('user');
    return s ? JSON.parse(s) : null;
  });
  if (!me) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const App: React.FC = () => {
  const nav = useNavigate();
  const loc = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const s = localStorage.getItem('user');
    if (s) setUser(JSON.parse(s));
  }, [loc.pathname]);

  const logout = () => {
    localStorage.clear();
    setUser(null);
    nav('/login');
  };

  const onLogin = (u: User, token: string) => {
    localStorage.setItem('user', JSON.stringify(u));
    localStorage.setItem('userId', u.id);
    localStorage.setItem('token', token);
    setUser(u);
    nav('/');
  };

  if (!user && loc.pathname !== '/login') {
    return <Navigate to="/login" replace />;
  }
  if (loc.pathname === '/login') return <Login onLogin={onLogin} />;

  const menuItems = [
    { key: '/', icon: <AppstoreOutlined />, label: '申请列表' },
    { key: '/create', icon: <FileTextOutlined />, label: '新建申请' },
    {
      key: '/audit',
      icon: <AuditOutlined />,
      label: '审计查询',
      disabled: user?.role === 'APPLICANT',
    },
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
            员工转岗交接清单管理系统
          </div>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'profile',
                  icon: <UserOutlined />,
                  label: `${user?.name} · ${ROLE_LABEL[user!.role]}`,
                  disabled: true,
                },
                { type: 'divider' },
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: '退出登录',
                  onClick: logout,
                },
              ],
            }}
          >
            <Badge count={null}>
              <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar style={{ background: '#1677ff' }}>
                  {user?.name?.slice(0, 1)}
                </Avatar>
                <span>
                  {user?.name}
                  <span style={{ color: '#999', fontSize: 12, marginLeft: 4 }}>
                    {ROLE_LABEL[user!.role]}
                  </span>
                </span>
              </div>
            </Badge>
          </Dropdown>
        </Header>
        <Content style={{ margin: 16, padding: 20, background: '#fff', borderRadius: 8 }}>
          <Routes>
            <Route path="/" element={<TransferList user={user!} />} />
            <Route
              path="/create"
              element={
                <Protected>
                  <TransferCreate user={user!} />
                </Protected>
              }
            />
            <Route path="/detail/:id" element={<TransferDetail user={user!} />} />
            <Route
              path="/audit"
              element={
                <Protected>
                  <AuditPage user={user!} />
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
