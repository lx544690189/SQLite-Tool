import { useEffect, useState } from 'react';
import {
  App as AntdApp,
  ConfigProvider,
  Layout,
  Segmented,
  Select,
  Spin,
  Result,
  Space,
  theme as antdTheme,
} from 'antd';
import { CodeOutlined, DatabaseOutlined, TableOutlined } from '@ant-design/icons';
import { useSnapshot } from 'valtio';
import { bootstrap, dbState } from './store/db';
import Sidebar from './components/Sidebar';
import TableDataPanel from './components/TableDataPanel';
import SqlExecutor from './components/SqlExecutor';

type View = 'data' | 'sql';
type ThemeMode = 'auto' | 'light' | 'dark';

function readVscodeDark(): boolean {
  return (
    document.body.classList.contains('vscode-dark') ||
    document.body.classList.contains('vscode-high-contrast')
  );
}

function useVscodeDark(): boolean {
  const [dark, setDark] = useState(readVscodeDark);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(readVscodeDark()));
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

export default function App() {
  const snap = useSnapshot(dbState);
  const vscodeDark = useVscodeDark();
  const [themeMode, setThemeMode] = useState<ThemeMode>('auto');
  const [view, setView] = useState<View>('data');

  const dark = themeMode === 'auto' ? vscodeDark : themeMode === 'dark';

  useEffect(() => {
    void bootstrap();
  }, []);

  return (
    <ConfigProvider
      componentSize="small"
      theme={{
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#16385b',
        },
      }}
    >
      <AntdApp
        style={{ height: '100vh' }}
        message={{ maxCount: 3 }}
        notification={{ placement: 'bottomRight' }}
      >
        <Layout style={{ height: '100vh', background: 'transparent' }}>
          <Layout.Sider
            width={250}
            theme={dark ? 'dark' : 'light'}
            style={{
              background: 'var(--vscode-sideBar-background, transparent)',
              borderRight: '1px solid var(--vscode-panel-border, rgba(128,128,128,.32))',
            }}
          >
            <Sidebar />
          </Layout.Sider>
          <Layout.Content
            style={{ background: 'transparent', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          >
            {snap.loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 80 }}>
                <Spin size="large">
                  <div style={{ width: 160, height: 80 }} />
                </Spin>
              </div>
            ) : snap.error && !snap.initialized ? (
              <Result
                status="error"
                icon={<DatabaseOutlined />}
                title="无法打开数据库"
                subTitle={snap.error}
              />
            ) : (
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px 0',
                  }}
                >
                  <Segmented<View>
                    value={view}
                    onChange={setView}
                    options={[
                      { value: 'data', label: '表数据', icon: <TableOutlined /> },
                      { value: 'sql', label: 'SQL 执行器', icon: <CodeOutlined /> },
                    ]}
                  />
                  <Space size="small">
                    <span style={{ opacity: 0.6, fontSize: 12 }}>主题</span>
                    <Select<ThemeMode>
                      size="small"
                      value={themeMode}
                      style={{ width: 100 }}
                      onChange={setThemeMode}
                      options={[
                        { value: 'auto', label: '跟随 VS' },
                        { value: 'light', label: '浅色' },
                        { value: 'dark', label: '深色' },
                      ]}
                    />
                  </Space>
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  {view === 'data' ? <TableDataPanel /> : <SqlExecutor dark={dark} />}
                </div>
              </>
            )}
          </Layout.Content>
        </Layout>
      </AntdApp>
    </ConfigProvider>
  );
}
