import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import './shared/styles/global.less';
import App from './app/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider locale={zhCN} theme={{ token: { fontSize: 14 } }}>
      <App />
    </ConfigProvider>
  </StrictMode>,
);
