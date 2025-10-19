import { useMemo, useState } from 'react';
import { OrderedListOutlined, DatabaseOutlined } from '@ant-design/icons';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import ImportListPage from '../modules/trading-data/pages/ImportListPage';
import DatasetListPage from '../modules/trading-data/pages/DatasetListPage';

const menuItems = [
  {
    key: 'trading-data',
    label: '交易数据管理',
    children: [
      { key: 'trading-data/datasets', label: '数据集列表', icon: <DatabaseOutlined /> },
      { key: 'trading-data/imports', label: '导入任务', icon: <OrderedListOutlined /> },
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

const metaMap: Record<string, { title: string; description?: string }> = {
  'trading-data/imports': {
    title: '导入任务',
    description: '查看导入进度、错误日志，支持新建与失败重试。',
  },
  'trading-data/datasets': {
    title: '数据集列表',
    description: '管理清洗后的数据集，可执行软删除与恢复。',
  },
};

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [datasetRefreshCounter, setDatasetRefreshCounter] = useState(0);

  const activeKey = useMemo(() => {
    const pathname = location.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    const validKeys = menuItems
      .flatMap((item) => (item?.children ?? []).map((child) => child?.key))
      .filter((key): key is string => Boolean(key));
    const matched = validKeys.find((key) => pathname.startsWith(key));
    return matched ?? 'trading-data/imports';
  }, [location.pathname]);

  const handleMenuSelect = (key: string) => {
    navigate(`/${key}`);
  };

  return (
    <AppLayout
      activeKey={activeKey}
      menuItems={menuItems}
      onMenuSelect={handleMenuSelect}
      title={metaMap[activeKey]?.title}
      description={metaMap[activeKey]?.description}
    >
      <Routes>
        <Route
          path="/trading-data/imports"
          element={
            <ImportListPage
              onRefreshed={() => {
                setDatasetRefreshCounter((counter) => counter + 1);
              }}
            />
          }
        />
        <Route
          path="/trading-data/datasets"
          element={<DatasetListPage key={datasetRefreshCounter} />}
        />
        <Route path="/" element={<Navigate to="/trading-data/imports" replace />} />
        <Route path="*" element={<Navigate to="/trading-data/imports" replace />} />
      </Routes>
    </AppLayout>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

export default App;
