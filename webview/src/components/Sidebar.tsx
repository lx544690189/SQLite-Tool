import { useState } from 'react';
import Editor from '@monaco-editor/react';
import { useSnapshot } from 'valtio';
import { Badge, Button, Dropdown, Empty, Input, Modal, Tooltip, Typography, message } from 'antd';
import { CodeOutlined, CopyOutlined, EditOutlined, MoreOutlined, PlusOutlined, TableOutlined } from '@ant-design/icons';
import { bridge } from '../bridge';
import { translate } from '../i18n';
import { useI18n } from '../i18nContext';
import { dbState, helper, renameTable, setActiveTable } from '../store/db';
import NewTableModal from './NewTableModal';

export default function Sidebar() {
  const { t: tr } = useI18n();
  const snap = useSnapshot(dbState);
  const [newTableOpen, setNewTableOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [sqlTarget, setSqlTarget] = useState<string | null>(null);

  const openRename = (name: string) => {
    setRenameTarget(name);
    setRenameValue(name);
  };

  const confirmRename = () => {
    if (!renameTarget) return;
    const next = renameValue.trim();
    if (!next || next === renameTarget) {
      setRenameTarget(null);
      return;
    }
    try {
      renameTable(renameTarget, next);
      message.success(tr('sidebar.renamed'));
      setRenameTarget(null);
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  };

  const createSql = sqlTarget ? safeCreateSQL(sqlTarget) : '';
  const editorTheme = document.documentElement.dataset.sqliteTheme === 'dark' ? 'vs-dark' : 'light';

  const copyCreateSql = async () => {
    if (!createSql.trim()) {
      return;
    }
    try {
      await bridge.writeClipboard(createSql);
      message.success(tr('sidebar.createSqlCopied'));
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
        }}
      >
        <Typography.Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase' }}>
          {tr('sidebar.tablesCount', { count: snap.tables.length })}
        </Typography.Text>
        <Tooltip title={tr('sidebar.newTable')}>
          <Button size="small" type="text" icon={<PlusOutlined />} onClick={() => setNewTableOpen(true)} />
        </Tooltip>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {snap.tables.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={tr('sidebar.noTables')} style={{ marginTop: 32 }} />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {snap.tables.map((t) => {
              const active = t.name === snap.activeTable;
              return (
                <li
                  key={t.name}
                  className={active ? 'sqlite-table-list-item is-active' : 'sqlite-table-list-item'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    borderLeft: active
                      ? '2px solid var(--sqlite-focus-border)'
                      : '2px solid transparent',
                    background: active ? 'var(--sqlite-active-background)' : 'transparent',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setActiveTable(t.name)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      border: 'none',
                      cursor: 'pointer',
                      padding: '6px 4px 6px 10px',
                      textAlign: 'left',
                      background: 'transparent',
                      color: 'var(--sqlite-foreground)',
                      fontSize: 12,
                      overflow: 'hidden',
                    }}
                  >
                    <TableOutlined />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.name}
                    </span>
                    <Badge
                      count={t.rowCount}
                      overflowCount={99999}
                      showZero
                      style={{
                        minWidth: 28,
                        height: 18,
                        padding: '0 7px',
                        fontSize: 12,
                        lineHeight: '18px',
                        backgroundColor: 'var(--sqlite-badge-background)',
                      }}
                    />
                  </button>
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        { key: 'sql', icon: <CodeOutlined />, label: tr('sidebar.viewCreateSql'), onClick: () => setSqlTarget(t.name) },
                        { key: 'rename', icon: <EditOutlined />, label: tr('sidebar.rename'), onClick: () => openRename(t.name) },
                      ],
                    }}
                  >
                    <Button type="text" size="small" icon={<MoreOutlined />} />
                  </Dropdown>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <NewTableModal open={newTableOpen} onClose={() => setNewTableOpen(false)} />

      <Modal
        open={renameTarget !== null}
        title={tr('sidebar.renameTableTitle', { name: renameTarget ?? '' })}
        onOk={confirmRename}
        onCancel={() => setRenameTarget(null)}
        okText={tr('common.ok')}
        cancelText={tr('common.cancel')}
        destroyOnHidden
      >
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={confirmRename}
          placeholder={tr('sidebar.newTableName')}
        />
      </Modal>

      <Modal
        open={sqlTarget !== null}
        title={tr('sidebar.createSqlTitle', { name: sqlTarget ?? '' })}
        footer={(
          <Button type="primary" icon={<CopyOutlined />} onClick={copyCreateSql} disabled={!createSql.trim()}>
            {tr('common.copy')}
          </Button>
        )}
        width={720}
        onCancel={() => setSqlTarget(null)}
      >
        <div
          className="sqlite-sql-editor-panel"
          style={{
            height: 300,
            border: '1px solid var(--sqlite-border)',
            borderRadius: 4,
            overflow: 'hidden',
            background: 'var(--sqlite-editor-background)',
          }}
        >
          <Editor
            height="300px"
            language="sql"
            theme={editorTheme}
            value={createSql}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbersMinChars: 3,
              padding: { top: 10, bottom: 10 },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              overviewRulerBorder: false,
              overviewRulerLanes: 0,
              scrollbar: {
                verticalScrollbarSize: 6,
                horizontalScrollbarSize: 6,
                alwaysConsumeMouseWheel: false,
              },
            }}
          />
        </div>
      </Modal>
    </div>
  );
}

function safeCreateSQL(tableName: string): string {
  try {
    return helper.getCreateTableSQL(tableName) || translate('sidebar.noCreateSql');
  } catch (err) {
    return translate('sidebar.createSqlFailed', { message: err instanceof Error ? err.message : String(err) });
  }
}
