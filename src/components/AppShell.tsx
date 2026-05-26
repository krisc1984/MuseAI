import React, { useState } from 'react';
import { Layout, Menu, ConfigProvider } from 'antd';
import { BookOutlined, SettingOutlined } from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { warmMinimalistTheme } from '../theme';

const { Sider, Content } = Layout;

const AppShell: React.FC = () => {
  const [collapsed, setCollapsed] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  return (
    <ConfigProvider theme={warmMinimalistTheme}>
      <Layout style={{ minHeight: '100vh' }}>
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={(value) => setCollapsed(value)}
          theme="light"
          style={{
            borderRight: `1px solid ${warmMinimalistTheme.token?.colorBorder}`,
          }}
        >
          <div
            style={{
              height: 32,
              margin: 16,
              background: 'rgba(0, 0, 0, 0.05)',
              borderRadius: 6,
            }}
          />
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            onClick={handleMenuClick}
            items={[
              {
                key: '/',
                icon: <BookOutlined />,
                label: '作品',
              },
              {
                key: '/settings',
                icon: <SettingOutlined />,
                label: '设置',
              },
            ]}
          />
        </Sider>
        <Layout>
          <Content
            style={{
              background: warmMinimalistTheme.components?.Layout?.bodyBg,
              display: 'flex',
              flexDirection: 'column',
              height: '100vh',
              overflow: 'hidden',
            }}
          >
            <Outlet />
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};

export default AppShell;
