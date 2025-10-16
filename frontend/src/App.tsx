import { useState, useEffect } from 'react';
import { Layout, Typography, Card, Button, Space, message } from 'antd';
import { RocketOutlined, HeartOutlined, ApiOutlined } from '@ant-design/icons';
import axios from 'axios';
import './App.css';

const { Header, Content, Footer } = Layout;
const { Title, Paragraph, Text } = Typography;

interface HealthStatus {
  status: string;
  timestamp: string;
  service: string;
  version: string;
  environment: string;
  message: string;
}

function App() {
  const [loading, setLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [helloMessage, setHelloMessage] = useState<string>('');

  // 获取 Hello World 消息
  const fetchHelloMessage = async () => {
    try {
      setLoading(true);
      const response = await axios.get('http://localhost:3000/api/v1/');
      setHelloMessage(response.data);
      message.success('成功获取欢迎消息！');
    } catch (error) {
      message.error('无法连接到后端服务，请确保后端服务已启动');
      console.error('Error fetching hello message:', error);
    } finally {
      setLoading(false);
    }
  };

  // 获取健康状态
  const fetchHealthStatus = async () => {
    try {
      setLoading(true);
      const response = await axios.get('http://localhost:3000/api/v1/health');
      setHealthStatus(response.data);
      message.success('健康检查成功！');
    } catch (error) {
      message.error('健康检查失败，请检查后端服务');
      console.error('Error fetching health status:', error);
    } finally {
      setLoading(false);
    }
  };

  // 组件挂载时获取欢迎消息
  useEffect(() => {
    fetchHelloMessage();
  }, []);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ 
        background: '#001529', 
        display: 'flex', 
        alignItems: 'center',
        padding: '0 24px'
      }}>
        <RocketOutlined style={{ fontSize: '24px', color: '#fff', marginRight: '12px' }} />
        <Title level={3} style={{ color: '#fff', margin: 0 }}>
          交易分析平台
        </Title>
      </Header>

      <Content style={{ padding: '24px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <Card 
            title={
              <Space>
                <RocketOutlined />
                <span>欢迎使用交易分析平台</span>
              </Space>
            }
            style={{ marginBottom: '24px' }}
          >
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <div>
                <Title level={2}>Hello World! 🎉</Title>
                <Paragraph>
                  欢迎来到交易分析平台前端应用！这是一个基于现代技术栈构建的量化交易分析系统。
                </Paragraph>
              </div>

              {helloMessage && (
                <Card size="small" style={{ background: '#f6ffed', border: '1px solid #b7eb8f' }}>
                  <Text strong style={{ color: '#52c41a' }}>
                    后端消息: {helloMessage}
                  </Text>
                </Card>
              )}

              <Space>
                <Button 
                  type="primary" 
                  icon={<ApiOutlined />}
                  onClick={fetchHelloMessage}
                  loading={loading}
                >
                  获取欢迎消息
                </Button>
                <Button 
                  icon={<HeartOutlined />}
                  onClick={fetchHealthStatus}
                  loading={loading}
                >
                  健康检查
                </Button>
              </Space>
            </Space>
          </Card>

          {healthStatus && (
            <Card 
              title="系统状态" 
              size="small"
              style={{ background: '#f0f9ff', border: '1px solid #91d5ff' }}
            >
              <Space direction="vertical" size="small">
                <Text><strong>状态:</strong> <Text type="success">{healthStatus.status}</Text></Text>
                <Text><strong>服务:</strong> {healthStatus.service}</Text>
                <Text><strong>版本:</strong> {healthStatus.version}</Text>
                <Text><strong>环境:</strong> {healthStatus.environment}</Text>
                <Text><strong>时间:</strong> {new Date(healthStatus.timestamp).toLocaleString()}</Text>
                <Text><strong>消息:</strong> {healthStatus.message}</Text>
              </Space>
            </Card>
          )}

          <Card title="技术栈" style={{ marginTop: '24px' }}>
            <Space direction="vertical" size="middle">
              <div>
                <Title level={4}>前端技术</Title>
                <Space wrap>
                  <Text code>React 19</Text>
                  <Text code>TypeScript</Text>
                  <Text code>Vite</Text>
                  <Text code>Ant Design</Text>
                  <Text code>Axios</Text>
                </Space>
              </div>
              <div>
                <Title level={4}>后端技术</Title>
                <Space wrap>
                  <Text code>NestJS</Text>
                  <Text code>TypeScript</Text>
                  <Text code>Express</Text>
                  <Text code>Swagger</Text>
                </Space>
              </div>
            </Space>
          </Card>
        </div>
      </Content>

      <Footer style={{ textAlign: 'center', background: '#f0f2f5' }}>
        <Text type="secondary">
          交易分析平台 ©2025 - 基于现代技术栈构建的量化交易分析系统
        </Text>
      </Footer>
    </Layout>
  );
}

export default App;
