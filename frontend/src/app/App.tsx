import { useState } from 'react';
import {
  CloudUploadOutlined,
  OrderedListOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import AppLayout from './layouts/AppLayout';
import UploadPage from '../modules/trading-data/pages/UploadPage';
import ImportListPage from '../modules/trading-data/pages/ImportListPage';
import DatasetListPage from '../modules/trading-data/pages/DatasetListPage';

const menuItems = [
  {
    key: 'trading-data',
    label: '交易数据管理',
    children: [
      { key: 'trading-data/datasets', label: '数据集列表', icon: <DatabaseOutlined /> },
      { key: 'trading-data/imports', label: '导入任务', icon: <OrderedListOutlined /> },
      { key: 'trading-data/upload', label: 'CSV 数据导入', icon: <CloudUploadOutlined /> },
    ],
  },
  {
    key: 'backtest',
    label: '策略回测（预留）',
    children: [
      { key: 'backtest/scripts', label: '脚本管理' },
      { key: 'backtest/runs', label: '回测记录' },
    ],
  },
];

function App() {
  const [activeKey, setActiveKey] = useState('trading-data/upload');
  const [datasetRefreshCounter, setDatasetRefreshCounter] = useState(0);

  const metaMap: Record<string, { title: string; description?: string }> = {
    'trading-data/upload': {
      title: 'CSV 数据导入',
      description: '上传单个文件，系统自动完成格式校验与清洗。',
    },
    'trading-data/imports': {
      title: '导入任务',
      description: '查看导入进度、错误日志，支持失败重试。',
    },
    'trading-data/datasets': {
      title: '数据集列表',
      description: '管理清洗后的数据集，可执行软删除与恢复。',
    },
  };

  const handleMenuSelect = (key: string) => {
    setActiveKey(key);
  };

  const renderContent = () => {
    switch (activeKey) {
      case 'trading-data/upload':
        return (
          <UploadPage
            onUploaded={() => {
              setActiveKey('trading-data/imports');
            }}
          />
        );
      case 'trading-data/imports':
        return (
          <ImportListPage
            onRefreshed={() => {
              setDatasetRefreshCounter((counter) => counter + 1);
            }}
          />
        );
      case 'trading-data/datasets':
      default:
        return <DatasetListPage key={datasetRefreshCounter} />;
    }
  };

  return (
    <AppLayout
      activeKey={activeKey}
      menuItems={menuItems}
      onMenuSelect={handleMenuSelect}
      title={metaMap[activeKey]?.title}
      description={metaMap[activeKey]?.description}
    >
      {renderContent()}
    </AppLayout>
  );
}

export default App;
