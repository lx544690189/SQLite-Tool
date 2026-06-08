import { useState } from 'react';
import { useSnapshot } from 'valtio';
import { Badge, Button, Dropdown, Empty, Input, Modal, Tooltip, Typography, message } from 'antd';
import { CodeOutlined, EditOutlined, MoreOutlined, PlusOutlined, TableOutlined } from '@ant-design/icons';
import { dbState, helper, renameTable, setActiveTable } from '../store/db';
import NewTableModal from './NewTableModal';

export default function Sidebar() {
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
      message.success('已重命名');
      setRenameTarget(null);
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  };

  const createSql = sqlTarget ? safeCreateSQL(sqlTarget) : '';

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
          表（{snap.tables.length}）
        </Typography.Text>
        <Tooltip title="新建表">
          <Button size="small" type="text" icon={<PlusOutlined />} onClick={() => setNewTableOpen(true)} />
        </Tooltip>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {snap.tables.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无表" style={{ marginTop: 32 }} />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {snap.tables.map((t) => {
              const active = t.name === snap.activeTable;
              return (
                <li
                  key={t.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: active
                      ? 'var(--vscode-list-activeSelectionBackground, rgba(120,120,120,.2))'
                      : 'transparent',
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
                      padding: '6px 4px 6px 12px',
                      textAlign: 'left',
                      background: 'transparent',
                      color: active
                        ? 'var(--vscode-list-activeSelectionForeground, inherit)'
                        : 'var(--vscode-foreground, inherit)',
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
                      style={{ backgroundColor: 'var(--vscode-badge-background, #888)' }}
                    />
                  </button>
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        { key: 'sql', icon: <CodeOutlined />, label: '查看建表 SQL', onClick: () => setSqlTarget(t.name) },
                        { key: 'rename', icon: <EditOutlined />, label: '重命名', onClick: () => openRename(t.name) },
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
        title={`重命名表：${renameTarget ?? ''}`}
        onOk={confirmRename}
        onCancel={() => setRenameTarget(null)}
        okText="确定"
        cancelText="取消"
        destroyOnClose
      >
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={confirmRename}
          placeholder="新表名"
        />
      </Modal>

      <Modal
        open={sqlTarget !== null}
        title={`建表 SQL：${sqlTarget ?? ''}`}
        footer={null}
        width={640}
        onCancel={() => setSqlTarget(null)}
      >
        <pre
          style={{
            margin: 0,
            padding: 12,
            borderRadius: 4,
            background: 'var(--vscode-textCodeBlock-background, rgba(128,128,128,.1))',
            overflowX: 'auto',
            fontSize: 12,
          }}
        >
          {createSql}
        </pre>
      </Modal>
    </div>
  );
}

function safeCreateSQL(tableName: string): string {
  try {
    return helper.getCreateTableSQL(tableName) || '-- 未找到建表语句';
  } catch (err) {
    return `-- 获取失败：${err instanceof Error ? err.message : String(err)}`;
  }
}
