import { useMemo, useState } from 'react';
import { Button, Checkbox, Input, Modal, Select, Space, Table, Typography, message } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { helper, refreshTables, dbState } from '../store/db';

interface ColumnDef {
  key: string;
  name: string;
  type: string;
  pk: boolean;
  notnull: boolean;
  unique: boolean;
  dflt: string;
}

const TYPES = ['INTEGER', 'TEXT', 'REAL', 'NUMERIC', 'BLOB'];

let seq = 0;
function newCol(): ColumnDef {
  seq += 1;
  return { key: `c${seq}`, name: '', type: 'TEXT', pk: false, notnull: false, unique: false, dflt: '' };
}

function buildCreateSQL(tableName: string, cols: ColumnDef[]): string {
  const valid = cols.filter((c) => c.name.trim());
  if (!tableName.trim() || valid.length === 0) {
    return '-- 请填写表名与至少一个字段';
  }
  const lines = valid.map((c) => {
    const parts = [`  "${c.name.trim()}" ${c.type}`];
    if (c.pk) parts.push('PRIMARY KEY');
    if (c.notnull) parts.push('NOT NULL');
    if (c.unique && !c.pk) parts.push('UNIQUE');
    if (c.dflt.trim()) {
      const isNum = ['INTEGER', 'REAL', 'NUMERIC'].includes(c.type);
      const dv = isNum ? c.dflt.trim() : `'${c.dflt.trim().replace(/'/g, "''")}'`;
      parts.push(`DEFAULT ${dv}`);
    }
    return parts.join(' ');
  });
  return `CREATE TABLE "${tableName.trim()}" (\n${lines.join(',\n')}\n);`;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function NewTableModal({ open, onClose }: Props) {
  const [tableName, setTableName] = useState('');
  const [cols, setCols] = useState<ColumnDef[]>([newCol()]);

  const sql = useMemo(() => buildCreateSQL(tableName, cols), [tableName, cols]);

  const update = (key: string, patch: Partial<ColumnDef>) =>
    setCols((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const reset = () => {
    setTableName('');
    setCols([newCol()]);
  };

  const handleExecute = () => {
    try {
      helper.createTable(sql);
      dbState.version++;
      refreshTables();
      dbState.activeTable = tableName.trim();
      message.success('已创建表');
      reset();
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  };

  const columns = [
    {
      title: '字段名',
      dataIndex: 'name',
      render: (_: any, r: ColumnDef) => (
        <Input
          size="small"
          value={r.name}
          placeholder="字段名"
          onChange={(e) => update(r.key, { name: e.target.value })}
        />
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 120,
      render: (_: any, r: ColumnDef) => (
        <Select
          size="small"
          style={{ width: '100%' }}
          value={r.type}
          options={TYPES.map((t) => ({ value: t, label: t }))}
          onChange={(v) => update(r.key, { type: v })}
        />
      ),
    },
    {
      title: 'PK',
      dataIndex: 'pk',
      width: 44,
      render: (_: any, r: ColumnDef) => (
        <Checkbox checked={r.pk} onChange={(e) => update(r.key, { pk: e.target.checked })} />
      ),
    },
    {
      title: '非空',
      dataIndex: 'notnull',
      width: 50,
      render: (_: any, r: ColumnDef) => (
        <Checkbox checked={r.notnull} onChange={(e) => update(r.key, { notnull: e.target.checked })} />
      ),
    },
    {
      title: '唯一',
      dataIndex: 'unique',
      width: 50,
      render: (_: any, r: ColumnDef) => (
        <Checkbox checked={r.unique} onChange={(e) => update(r.key, { unique: e.target.checked })} />
      ),
    },
    {
      title: '默认值',
      dataIndex: 'dflt',
      width: 120,
      render: (_: any, r: ColumnDef) => (
        <Input
          size="small"
          value={r.dflt}
          placeholder="可选"
          onChange={(e) => update(r.key, { dflt: e.target.value })}
        />
      ),
    },
    {
      title: '',
      width: 40,
      render: (_: any, r: ColumnDef) => (
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
          disabled={cols.length === 1}
          onClick={() => setCols((prev) => prev.filter((c) => c.key !== r.key))}
        />
      ),
    },
  ];

  return (
    <Modal
      open={open}
      title="新建表"
      width={760}
      okText="执行建表"
      cancelText="取消"
      onOk={handleExecute}
      onCancel={() => {
        reset();
        onClose();
      }}
      okButtonProps={{ disabled: !tableName.trim() || !cols.some((c) => c.name.trim()) }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Input
          addonBefore="表名"
          value={tableName}
          placeholder="新表名称"
          onChange={(e) => setTableName(e.target.value)}
        />
        <Table
          size="small"
          rowKey="key"
          pagination={false}
          dataSource={cols}
          columns={columns as any}
        />
        <Button icon={<PlusOutlined />} onClick={() => setCols((prev) => [...prev, newCol()])}>
          添加字段
        </Button>
        <div>
          <Typography.Text type="secondary">SQL 预览</Typography.Text>
          <pre
            style={{
              margin: '4px 0 0',
              padding: 12,
              borderRadius: 4,
              background: 'var(--vscode-textCodeBlock-background, rgba(128,128,128,.1))',
              overflowX: 'auto',
              fontSize: 12,
            }}
          >
            {sql}
          </pre>
        </div>
      </Space>
    </Modal>
  );
}
