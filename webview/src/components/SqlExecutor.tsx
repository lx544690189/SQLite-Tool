import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Alert, Button, Dropdown, Empty, Space, Table, Tag, Typography, message } from 'antd';
import { CaretRightOutlined, ClearOutlined, FormatPainterOutlined, HistoryOutlined } from '@ant-design/icons';
import { useSnapshot } from 'valtio';
import { dbState, helper } from '../store/db';
import { addHistory, clearHistory, loadHistory, sqlState } from '../store/sql';
import SQLiteHelper from '../utils/SQLiteHelper';

const PAGE_SIZE_OPTIONS = ['20', '50', '100'];

interface ResultState {
  columns: string[];
  rows: any[][];
  rowsModified: number;
  changed: boolean;
  empty: boolean;
}

export default function SqlExecutor({ dark }: { dark: boolean }) {
  const snap = useSnapshot(dbState);
  const sqlSnap = useSnapshot(sqlState);
  const [sql, setSql] = useState('SELECT * FROM sqlite_master WHERE type = \'table\';');
  const [result, setResult] = useState<ResultState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    void loadHistory();
  }, []);

  const run = () => {
    const text = sql.trim();
    if (!text) return;
    setRunning(true);
    setError(null);
    try {
      const res = helper.executeSqlScript(text);
      addHistory(text);
      // 取最后一个产生输出的结果集
      const last = res.results[res.results.length - 1];
      if (last) {
        setResult({
          columns: last.columns,
          rows: last.values,
          rowsModified: res.rowsModified,
          changed: res.changed,
          empty: false,
        });
      } else {
        setResult({
          columns: [],
          rows: [],
          rowsModified: res.rowsModified,
          changed: res.changed,
          empty: true,
        });
      }
      if (res.changed) {
        dbState.version++; // 同步刷新表列表/数据面板
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  const format = () => setSql(SQLiteHelper.formatSQL(sql));

  if (!snap.initialized) {
    return <Empty description="数据库未就绪" style={{ marginTop: 80 }} />;
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 12, gap: 8 }}>
      <Space>
        <Button type="primary" icon={<CaretRightOutlined />} loading={running} onClick={run}>
          执行 (Ctrl+Enter)
        </Button>
        <Button icon={<FormatPainterOutlined />} onClick={format}>
          格式化
        </Button>
        <Dropdown
          trigger={['click']}
          menu={{
            items:
              sqlSnap.history.length === 0
                ? [{ key: 'empty', label: '暂无历史', disabled: true }]
                : [
                    ...sqlSnap.history.slice(0, 20).map((h, i) => ({
                      key: String(i),
                      label: (
                        <span style={{ display: 'inline-block', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {h.sql}
                        </span>
                      ),
                      onClick: () => setSql(h.sql),
                    })),
                    { type: 'divider' as const },
                    {
                      key: 'clear',
                      label: '清空历史',
                      danger: true,
                      onClick: () => {
                        clearHistory();
                        message.success('已清空历史');
                      },
                    },
                  ],
          }}
        >
          <Button icon={<HistoryOutlined />}>历史 ({sqlSnap.history.length})</Button>
        </Dropdown>
      </Space>

      <div style={{ border: '1px solid var(--vscode-panel-border, rgba(128,128,128,.3))', height: 200 }}>
        <Editor
          height="200px"
          language="sql"
          theme={dark ? 'vs-dark' : 'light'}
          value={sql}
          onChange={(v) => setSql(v ?? '')}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
          onMount={(editor, monaco) => {
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => run());
          }}
        />
      </div>

      {error && <Alert type="error" title={error} showIcon />}

      <div style={{ flex: 1, overflow: 'auto' }}>
        {result && result.empty ? (
          <Alert
            type="success"
            showIcon
            title={
              result.changed
                ? `执行成功，影响 ${result.rowsModified} 行（已标记为未保存，Ctrl/Cmd+S 写回磁盘）`
                : '执行成功，无结果集返回'
            }
          />
        ) : result ? (
          <>
            <Space style={{ marginBottom: 8 }}>
              <Tag color="blue">{result.rows.length} 行</Tag>
              {result.changed && <Tag color="orange">影响 {result.rowsModified} 行</Tag>}
            </Space>
            <Table
              size="small"
              rowKey={(_, i) => String(i)}
              dataSource={result.rows.map((row, i) => {
                const obj: any = { __i: i };
                result.columns.forEach((c, ci) => (obj[c] = row[ci]));
                return obj;
              })}
              columns={result.columns.map((c) => ({
                title: c,
                dataIndex: c,
                key: c,
                ellipsis: true,
                render: (v: unknown) =>
                  v === null || v === undefined ? <Tag style={{ opacity: 0.6 }}>NULL</Tag> : String(v),
              }))}
              scroll={{ x: 'max-content' }}
              pagination={{
                defaultPageSize: 20,
                showSizeChanger: true,
                pageSizeOptions: PAGE_SIZE_OPTIONS,
                showTotal: (total) => `共 ${total} 行`,
              }}
            />
          </>
        ) : (
          <Typography.Text type="secondary">在上方编写 SQL，点击执行查看结果。</Typography.Text>
        )}
      </div>
    </div>
  );
}
