import { Layout, Menu, Typography } from 'antd';
import type { MenuProps } from 'antd';
import type { ReactNode } from 'react';

const { Header, Sider, Content } = Layout;
const { Title, Paragraph } = Typography;

export type AppLayoutProps = {
  activeKey: string;
  menuItems: MenuProps['items'];
  onMenuSelect: (key: string) => void;
  title?: string;
  description?: string;
  children: ReactNode;
};

export function AppLayout({
  activeKey,
  menuItems,
  onMenuSelect,
  title = '交易数据管理中心',
  description = '统一管理导入任务与清洗后数据集。',
  children,
}: AppLayoutProps) {
  return (
    <Layout className="app-layout">
      <Sider width={240} className="app-sider">
        <div className="app-sider-logo">交易回测平台</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[activeKey]}
          items={menuItems}
          onClick={(info) => onMenuSelect(info.key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 32px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Title level={4} style={{ margin: 0 }}>
            {title}
          </Title>
          {description && (
            <Paragraph type="secondary" style={{ margin: '0 0 0 16px' }}>
              {description}
            </Paragraph>
          )}
        </Header>
        <Content>
          <div className="app-content">{children}</div>
        </Content>
      </Layout>
    </Layout>
  );
}

export default AppLayout;
