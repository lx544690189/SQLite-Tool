import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  App as AntdApp,
  Button,
  ConfigProvider,
  Form,
  Layout,
  Modal,
  Segmented,
  Select,
  Spin,
  Result,
  Tooltip,
  theme as antdTheme,
} from 'antd';
import { CodeOutlined, DatabaseOutlined, SettingOutlined, TableOutlined } from '@ant-design/icons';
import { useSnapshot } from 'valtio';
import { bootstrap, dbState } from './store/db';
import Sidebar from './components/Sidebar';
import TableDataPanel from './components/TableDataPanel';
import SqlExecutor from './components/SqlExecutor';

type View = 'data' | 'sql';
type ThemeMode = 'auto' | 'light' | 'dark';
type PageSize = 20 | 50 | 100;
type SqliteThemeVars = CSSProperties & Record<`--${string}`, string>;

interface UserSettings {
  themeMode: ThemeMode;
  defaultPageSize: PageSize;
  sqlEditorFontSize: number;
}

const SETTINGS_STORAGE_KEY = 'sqlite-manager-settings';
const PAGE_SIZE_OPTIONS: PageSize[] = [20, 50, 100];
const SQL_EDITOR_FONT_SIZE_OPTIONS = [12, 13, 14, 15, 16];
const DEFAULT_SETTINGS: UserSettings = {
  themeMode: 'auto',
  defaultPageSize: 20,
  sqlEditorFontSize: 13,
};

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'auto' || value === 'light' || value === 'dark';
}

function isPageSize(value: unknown): value is PageSize {
  return PAGE_SIZE_OPTIONS.includes(value as PageSize);
}

function readSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    return {
      themeMode: isThemeMode(parsed.themeMode) ? parsed.themeMode : DEFAULT_SETTINGS.themeMode,
      defaultPageSize: isPageSize(parsed.defaultPageSize)
        ? parsed.defaultPageSize
        : DEFAULT_SETTINGS.defaultPageSize,
      sqlEditorFontSize: SQL_EDITOR_FONT_SIZE_OPTIONS.includes(parsed.sqlEditorFontSize ?? 0)
        ? parsed.sqlEditorFontSize!
        : DEFAULT_SETTINGS.sqlEditorFontSize,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function getSqliteThemeVars(dark: boolean): SqliteThemeVars {
  if (dark) {
    return {
      '--sqlite-editor-background': 'var(--vscode-editor-background, #1e1e1e)',
      '--sqlite-sidebar-background': 'var(--vscode-sideBar-background, #252526)',
      '--sqlite-foreground': 'var(--vscode-foreground, #cccccc)',
      '--sqlite-secondary-foreground': 'var(--vscode-descriptionForeground, rgba(204, 204, 204, 0.72))',
      '--sqlite-border': 'var(--vscode-panel-border, rgba(128, 128, 128, 0.32))',
      '--sqlite-focus-border': 'var(--vscode-focusBorder, var(--vscode-button-background, #3794ff))',
      '--sqlite-code-background': 'var(--vscode-textCodeBlock-background, rgba(128, 128, 128, 0.12))',
      '--sqlite-active-background': 'rgba(127, 127, 127, 0.16)',
      '--sqlite-badge-background': 'var(--vscode-badge-background, #4d4d4d)',
      '--sqlite-input-background': 'var(--vscode-input-background, #3c3c3c)',
      '--sqlite-input-foreground': 'var(--vscode-input-foreground, #cccccc)',
      '--sqlite-segmented-selected-background': 'rgba(47, 125, 204, 0.18)',
      '--sqlite-mask-background': 'rgba(0, 0, 0, 0.45)',
      '--sqlite-fill-secondary': 'rgba(255, 255, 255, 0.08)',
      '--sqlite-disabled-background': 'rgba(255, 255, 255, 0.08)',
      '--sqlite-disabled-foreground': 'rgba(255, 255, 255, 0.35)',
      '--sqlite-tag-default-background': 'rgba(255, 255, 255, 0.08)',
      '--sqlite-tag-default-border': 'rgba(255, 255, 255, 0.18)',
      '--sqlite-tag-default-foreground': 'rgba(255, 255, 255, 0.68)',
      '--sqlite-tag-gold-background': 'rgba(250, 173, 20, 0.18)',
      '--sqlite-tag-gold-border': 'rgba(250, 173, 20, 0.36)',
      '--sqlite-tag-gold-foreground': '#ffd666',
      '--sqlite-tag-red-background': 'rgba(255, 77, 79, 0.18)',
      '--sqlite-tag-red-border': 'rgba(255, 77, 79, 0.36)',
      '--sqlite-tag-red-foreground': '#ff7875',
      '--sqlite-tag-warning-background': 'rgba(250, 173, 20, 0.16)',
      '--sqlite-tag-warning-border': 'rgba(250, 173, 20, 0.34)',
      '--sqlite-tag-warning-foreground': '#ffd666',
      '--sqlite-tag-info-background': 'rgba(78, 161, 255, 0.18)',
      '--sqlite-tag-info-border': 'rgba(78, 161, 255, 0.36)',
      '--sqlite-tag-info-foreground': '#75b8ff',
      '--sqlite-tag-changed-background': 'rgba(250, 140, 22, 0.18)',
      '--sqlite-tag-changed-border': 'rgba(250, 140, 22, 0.36)',
      '--sqlite-tag-changed-foreground': '#ffc069',
      '--sqlite-scrollbar-background': 'var(--vscode-scrollbarSlider-background, rgba(128, 128, 128, 0.4))',
      '--sqlite-scrollbar-hover-background': 'var(--vscode-scrollbarSlider-hoverBackground, rgba(128, 128, 128, 0.6))',
      '--sqlite-table-header-background': 'color-mix(in srgb, var(--sqlite-editor-background) 88%, var(--sqlite-foreground) 12%)',
      '--sqlite-table-hover-background': 'color-mix(in srgb, var(--sqlite-editor-background) 84%, var(--sqlite-foreground) 16%)',
      '--sqlite-table-sort-background': 'color-mix(in srgb, var(--sqlite-editor-background) 90%, var(--sqlite-foreground) 10%)',
      '--sqlite-table-selected-hover-background': 'color-mix(in srgb, var(--sqlite-editor-background) 80%, var(--sqlite-foreground) 20%)',
      '--sqlite-table-fixed-shadow': 'rgba(0, 0, 0, 0.34)',
    };
  }

  return {
    '--sqlite-editor-background': '#ffffff',
    '--sqlite-sidebar-background': '#f6f8fa',
    '--sqlite-foreground': '#1f2328',
    '--sqlite-secondary-foreground': '#6e7781',
    '--sqlite-border': '#d0d7de',
    '--sqlite-focus-border': '#0969da',
    '--sqlite-code-background': '#f6f8fa',
    '--sqlite-active-background': 'rgba(9, 105, 218, 0.1)',
    '--sqlite-badge-background': '#6e7781',
    '--sqlite-input-background': '#ffffff',
    '--sqlite-input-foreground': '#1f2328',
    '--sqlite-segmented-selected-background': 'rgba(9, 105, 218, 0.1)',
    '--sqlite-mask-background': 'rgba(31, 35, 40, 0.42)',
    '--sqlite-fill-secondary': 'rgba(31, 35, 40, 0.06)',
    '--sqlite-disabled-background': '#f6f8fa',
    '--sqlite-disabled-foreground': '#8c959f',
    '--sqlite-tag-default-background': '#f6f8fa',
    '--sqlite-tag-default-border': '#d0d7de',
    '--sqlite-tag-default-foreground': '#57606a',
    '--sqlite-tag-gold-background': '#fff8c5',
    '--sqlite-tag-gold-border': '#f0d36d',
    '--sqlite-tag-gold-foreground': '#7d4e00',
    '--sqlite-tag-red-background': '#ffebe9',
    '--sqlite-tag-red-border': '#ffcecb',
    '--sqlite-tag-red-foreground': '#cf222e',
    '--sqlite-tag-warning-background': '#fff8c5',
    '--sqlite-tag-warning-border': '#f0d36d',
    '--sqlite-tag-warning-foreground': '#7d4e00',
    '--sqlite-tag-info-background': '#ddf4ff',
    '--sqlite-tag-info-border': '#b6e3ff',
    '--sqlite-tag-info-foreground': '#0969da',
    '--sqlite-tag-changed-background': '#fff1e5',
    '--sqlite-tag-changed-border': '#ffd8b5',
    '--sqlite-tag-changed-foreground': '#9a6700',
    '--sqlite-scrollbar-background': 'rgba(31, 35, 40, 0.22)',
    '--sqlite-scrollbar-hover-background': 'rgba(31, 35, 40, 0.34)',
    '--sqlite-table-header-background': '#f6f8fa',
    '--sqlite-table-hover-background': '#f1f5f9',
    '--sqlite-table-sort-background': '#eef4ff',
    '--sqlite-table-selected-hover-background': '#e7f0ff',
    '--sqlite-table-fixed-shadow': 'rgba(31, 35, 40, 0.14)',
  };
}

function InitialLoading() {
  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--sqlite-editor-background, var(--vscode-editor-background, transparent))',
        borderLeft: '1px solid var(--sqlite-border, var(--vscode-panel-border, rgba(128,128,128,.32)))',
      }}
    >
      <Spin size="large" />
    </div>
  );
}

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

function ViewSwitchLabel({
  active,
  icon,
  label,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        borderRadius: 4,
        padding: '0 6px',
        background: active ? 'var(--sqlite-segmented-selected-background)' : 'transparent',
        fontWeight: active ? 600 : 400,
        transition: 'background 0.16s ease',
      }}
    >
      {icon}
      <span>{label}</span>
    </span>
  );
}

export default function App() {
  const snap = useSnapshot(dbState);
  const vscodeDark = useVscodeDark();
  const [settings, setSettings] = useState<UserSettings>(readSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState<View>('data');

  const dark = settings.themeMode === 'auto' ? vscodeDark : settings.themeMode === 'dark';
  const themeVars = useMemo(() => getSqliteThemeVars(dark), [dark]);

  const updateSettings = (next: Partial<UserSettings>) => {
    setSettings((prev) => ({ ...prev, ...next }));
  };

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.sqliteTheme = dark ? 'dark' : 'light';
    Object.entries(themeVars).forEach(([name, value]) => {
      root.style.setProperty(name, value);
    });
  }, [dark, themeVars]);

  return (
    <ConfigProvider
      key={dark ? 'sqlite-dark' : 'sqlite-light'}
      componentSize="small"
      theme={{
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: dark ? '#2f7dcc' : '#2f7dcc',
          colorPrimaryHover: dark ? '#3f8fd6' : '#4a91d6',
          colorPrimaryActive: dark ? '#236fb8' : '#236fb8',
          colorBgBase: 'var(--sqlite-editor-background)',
          colorBgContainer: 'var(--sqlite-editor-background)',
          colorBgElevated: 'var(--sqlite-editor-background)',
          colorBgLayout: 'var(--sqlite-editor-background)',
          colorBgMask: 'var(--sqlite-mask-background)',
          colorBgContainerDisabled: 'var(--sqlite-disabled-background)',
          colorBorder: 'var(--sqlite-border)',
          colorBorderSecondary: 'var(--sqlite-border)',
          colorFillSecondary: 'var(--sqlite-fill-secondary)',
          colorFillTertiary: 'var(--sqlite-fill-secondary)',
          colorSplit: 'var(--sqlite-border)',
          colorText: 'var(--sqlite-foreground)',
          colorTextSecondary: 'var(--sqlite-secondary-foreground)',
          colorTextDisabled: 'var(--sqlite-disabled-foreground)',
          fontSize: 12,
        },
      }}
    >
      <AntdApp
        style={{
          ...themeVars,
          height: '100vh',
          color: 'var(--sqlite-foreground)',
          background: 'var(--sqlite-editor-background)',
        }}
        message={{ maxCount: 3 }}
        notification={{ placement: 'bottomRight' }}
      >
        {snap.loading ? (
          <InitialLoading />
        ) : (
          <Layout
            style={{
              height: '100vh',
              background: 'var(--sqlite-editor-background)',
              borderLeft: '1px solid var(--sqlite-border)',
            }}
          >
          <Layout.Sider
            width={250}
            theme={dark ? 'dark' : 'light'}
            style={{
              background: 'var(--sqlite-sidebar-background)',
              borderRight: '1px solid var(--sqlite-border)',
            }}
          >
            <Sidebar />
          </Layout.Sider>
          <Layout.Content
            style={{
              background: 'var(--sqlite-editor-background)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {snap.error && !snap.initialized ? (
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
                      {
                        value: 'data',
                        label: (
                          <ViewSwitchLabel
                            active={view === 'data'}
                            icon={<TableOutlined />}
                            label="表数据"
                          />
                        ),
                      },
                      {
                        value: 'sql',
                        label: (
                          <ViewSwitchLabel
                            active={view === 'sql'}
                            icon={<CodeOutlined />}
                            label="SQL 执行器"
                          />
                        ),
                      },
                    ]}
                  />
                  <Tooltip title="设置">
                    <Button
                      type="text"
                      size="small"
                      icon={<SettingOutlined />}
                      onClick={() => setSettingsOpen(true)}
                    />
                  </Tooltip>
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  {view === 'data' ? (
                    <TableDataPanel defaultPageSize={settings.defaultPageSize} />
                  ) : (
                    <SqlExecutor
                      dark={dark}
                      defaultPageSize={settings.defaultPageSize}
                      editorFontSize={settings.sqlEditorFontSize}
                    />
                  )}
                </div>
              </>
            )}
          </Layout.Content>
        </Layout>
        )}
        <Modal
          open={settingsOpen}
          title="设置"
          footer={null}
          width={420}
          destroyOnHidden
          onCancel={() => setSettingsOpen(false)}
          styles={{
            content: { background: 'var(--sqlite-editor-background)' },
            header: { background: 'var(--sqlite-editor-background)' },
            body: { background: 'var(--sqlite-editor-background)' },
          }}
        >
          <Form layout="vertical" style={{ marginTop: 4 }}>
            <Form.Item label="主题模式">
              <Select<ThemeMode>
                value={settings.themeMode}
                onChange={(themeMode) => updateSettings({ themeMode })}
                options={[
                  { value: 'auto', label: '跟随 VS Code' },
                  { value: 'light', label: '浅色' },
                  { value: 'dark', label: '深色' },
                ]}
              />
            </Form.Item>
            <Form.Item label="默认分页条数">
              <Select<PageSize>
                value={settings.defaultPageSize}
                onChange={(defaultPageSize) => updateSettings({ defaultPageSize })}
                options={PAGE_SIZE_OPTIONS.map((value) => ({
                  value,
                  label: `${value} / page`,
                }))}
              />
            </Form.Item>
            <Form.Item label="SQL 编辑器字号">
              <Select<number>
                value={settings.sqlEditorFontSize}
                onChange={(sqlEditorFontSize) => updateSettings({ sqlEditorFontSize })}
                options={SQL_EDITOR_FONT_SIZE_OPTIONS.map((value) => ({
                  value,
                  label: `${value}px`,
                }))}
              />
            </Form.Item>
          </Form>
        </Modal>
      </AntdApp>
    </ConfigProvider>
  );
}
