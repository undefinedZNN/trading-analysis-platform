import { useMemo, useState } from 'react';
import { 
  OrderedListOutlined, 
  DatabaseOutlined, 
  ExperimentOutlined, 
  RocketOutlined,
  ApiOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { App as AntdApp } from 'antd';
import AppLayout from './layouts/AppLayout';
import ImportListPage from '../modules/trading-data/pages/ImportListPage';
import DatasetListPage from '../modules/trading-data/pages/DatasetListPage';
import { 
  StrategyManagementLandingPage, 
  BacktestTaskListPage, 
  TaskDetailPage,
  DashboardPage,
  WorkerManagementPage,
} from '../modules/backtesting/pages';

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
    key: 'backtesting',
    label: '交易回测',
    children: [
      { key: 'backtesting/dashboard', label: '仪表盘', icon: <DashboardOutlined /> },
      { key: 'backtesting/strategies', label: '策略管理', icon: <ExperimentOutlined /> },
      { key: 'backtesting/tasks', label: '回测任务', icon: <RocketOutlined /> },
      { key: 'backtesting/workers', label: 'Worker管理', icon: <ApiOutlined /> },
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
  'backtesting/dashboard': {
    title: '回测仪表盘',
    description: '查看回测系统整体状况和关键指标。',
  },
  'backtesting/strategies': {
    title: '策略管理',
    description: '管理回测策略脚本与版本，功能建设中。',
  },
  'backtesting/tasks': {
    title: '回测任务',
    description: '创建、管理和监控策略回测任务。',
  },
  'backtesting/workers': {
    title: 'Worker管理',
    description: '监控和管理回测Worker节点的运行状态。',
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
    <AntdApp>
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
          <Route path="/backtesting/dashboard" element={<DashboardPage />} />
          <Route path="/backtesting/strategies" element={<StrategyManagementLandingPage />} />
          <Route path="/backtesting/tasks" element={<BacktestTaskListPage />} />
          <Route path="/backtesting/tasks/:taskId" element={<TaskDetailPage />} />
          <Route path="/backtesting/workers" element={<WorkerManagementPage />} />
          <Route path="/" element={<Navigate to="/backtesting/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/backtesting/dashboard" replace />} />
        </Routes>
      </AppLayout>
    </AntdApp>
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
