import { useMemo, useState } from 'react';
import { Button, Checkbox, Input, Modal, Select, Space, Table, Typography, message } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { helper, refreshTables, dbState } from '../store/db';

interface ColumnDef {
  key: string;
  name: string;
  type: string;
  pk: boolean;
  autoIncrement: boolean;
  notnull: boolean;
  unique: boolean;
  dflt: string;
  defaultMode: 'none' | 'literal' | 'expression' | 'null';
  checkExpr: string;
  refTable: string;
  refColumn: string;
  onDelete: 'NO ACTION' | 'RESTRICT' | 'SET NULL' | 'SET DEFAULT' | 'CASCADE';
  onUpdate: 'NO ACTION' | 'RESTRICT' | 'SET NULL' | 'SET DEFAULT' | 'CASCADE';
}

const TYPE_OPTIONS = [
  {
    label: 'SQLite 基础类型',
    options: ['INTEGER', 'TEXT', 'REAL', 'NUMERIC', 'BLOB'].map((t) => ({ value: t, label: t })),
  },
  {
    label: '常用业务类型',
    options: ['BOOLEAN', 'DATE', 'DATETIME', 'DECIMAL', 'JSON', 'VARCHAR(255)'].map((t) => ({
      value: t,
      label: t,
    })),
  },
];

const DEFAULT_MODE_OPTIONS = [
  { value: 'none', label: '无' },
  { value: 'literal', label: '值' },
  { value: 'expression', label: '表达式' },
  { value: 'null', label: 'NULL' },
];

const FK_ACTION_OPTIONS = ['NO ACTION', 'RESTRICT', 'SET NULL', 'SET DEFAULT', 'CASCADE'].map(
  (value) => ({ value, label: value }),
);

let seq = 0;
function newCol(): ColumnDef {
  seq += 1;
  return {
    key: `c${seq}`,
    name: '',
    type: 'TEXT',
    pk: false,
    autoIncrement: false,
    notnull: false,
    unique: false,
    dflt: '',
    defaultMode: 'none',
    checkExpr: '',
    refTable: '',
    refColumn: '',
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  };
}

function quoteIdent(name: string): string {
  return `"${name.trim().replace(/"/g, '""')}"`;
}

function normalizeType(type: string): string {
  return type.trim().toUpperCase();
}

function isNumericType(type: string): boolean {
  return ['INTEGER', 'REAL', 'NUMERIC', 'DECIMAL'].includes(normalizeType(type));
}

function buildDefaultSQL(col: ColumnDef): string | null {
  if (col.defaultMode === 'none') {
    return null;
  }
  if (col.defaultMode === 'null') {
    return 'DEFAULT NULL';
  }
  const value = col.dflt.trim();
  if (!value) {
    return null;
  }
  if (col.defaultMode === 'expression') {
    return `DEFAULT ${value}`;
  }
  if (isNumericType(col.type) || normalizeType(col.type) === 'BOOLEAN') {
    return `DEFAULT ${value}`;
  }
  return `DEFAULT '${value.replace(/'/g, "''")}'`;
}

function buildCreateSQL(tableName: string, cols: ColumnDef[]): string {
  const valid = cols.filter((c) => c.name.trim());
  if (!tableName.trim() || valid.length === 0) {
    return '-- 请填写表名与至少一个字段';
  }
  const lines = valid.map((c) => {
    const type = normalizeType(c.type);
    const parts = [`  ${quoteIdent(c.name)} ${type}`];
    if (c.pk) parts.push(`PRIMARY KEY${c.autoIncrement && type === 'INTEGER' ? ' AUTOINCREMENT' : ''}`);
    if (c.notnull) parts.push('NOT NULL');
    if (c.unique && !c.pk) parts.push('UNIQUE');
    const defaultSql = buildDefaultSQL(c);
    if (defaultSql) parts.push(defaultSql);
    if (c.checkExpr.trim()) {
      parts.push(`CHECK (${c.checkExpr.trim()})`);
    }
    if (c.refTable.trim() && c.refColumn.trim()) {
      parts.push(
        `REFERENCES ${quoteIdent(c.refTable)} (${quoteIdent(c.refColumn)}) ON DELETE ${c.onDelete} ON UPDATE ${c.onUpdate}`,
      );
    }
    return parts.join(' ');
  });
  return `CREATE TABLE ${quoteIdent(tableName)} (\n${lines.join(',\n')}\n);`;
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

  const updateType = (key: string, type: string) =>
    setCols((prev) =>
      prev.map((c) => {
        if (c.key !== key) return c;
        const next = { ...c, type };
        if (normalizeType(type) !== 'INTEGER') {
          next.autoIncrement = false;
        }
        return next;
      }),
    );

  const updatePk = (key: string, checked: boolean) =>
    setCols((prev) =>
      prev.map((c) => ({
        ...c,
        pk: c.key === key ? checked : false,
        autoIncrement: c.key === key && checked ? c.autoIncrement : false,
        unique: c.key === key && checked ? false : c.unique,
      })),
    );

  const updateAutoIncrement = (key: string, checked: boolean) =>
    setCols((prev) =>
      prev.map((c) =>
        c.key === key
          ? { ...c, type: 'INTEGER', pk: true, autoIncrement: checked, unique: false }
          : checked
            ? { ...c, pk: false, autoIncrement: false }
            : c,
      ),
    );

  const canExecute = tableName.trim() && cols.some((c) => c.name.trim()) && cols.every((c) => {
    if (!c.name.trim()) {
      return true;
    }
    if (c.defaultMode !== 'none' && c.defaultMode !== 'null' && !c.dflt.trim()) {
      return false;
    }
    if (c.refTable.trim() && !c.refColumn.trim()) {
      return false;
    }
    if (!c.refTable.trim() && c.refColumn.trim()) {
      return false;
    }
    return true;
  });

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
      width: 150,
      render: (_: any, r: ColumnDef) => (
        <Select
          size="small"
          style={{ width: '100%' }}
          value={r.type}
          options={TYPE_OPTIONS}
          showSearch={{ optionFilterProp: 'label' }}
          onChange={(v) => updateType(r.key, v)}
        />
      ),
    },
    {
      title: 'PK',
      dataIndex: 'pk',
      width: 44,
      render: (_: any, r: ColumnDef) => (
        <Checkbox checked={r.pk} onChange={(e) => updatePk(r.key, e.target.checked)} />
      ),
    },
    {
      title: '自增',
      dataIndex: 'autoIncrement',
      width: 56,
      render: (_: any, r: ColumnDef) => (
        <Checkbox
          checked={r.autoIncrement}
          disabled={!r.pk && normalizeType(r.type) !== 'INTEGER'}
          onChange={(e) => updateAutoIncrement(r.key, e.target.checked)}
        />
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
      width: 250,
      render: (_: any, r: ColumnDef) => (
        <Space.Compact style={{ width: '100%' }}>
          <Select
            size="small"
            style={{ width: 82 }}
            value={r.defaultMode}
            options={DEFAULT_MODE_OPTIONS}
            onChange={(v) => update(r.key, { defaultMode: v })}
          />
          <Input
            size="small"
            value={r.dflt}
            disabled={r.defaultMode === 'none' || r.defaultMode === 'null'}
            placeholder={r.defaultMode === 'expression' ? 'CURRENT_TIMESTAMP' : '可选'}
            onChange={(e) => update(r.key, { dflt: e.target.value })}
          />
        </Space.Compact>
      ),
    },
    {
      title: 'CHECK',
      dataIndex: 'checkExpr',
      width: 200,
      render: (_: any, r: ColumnDef) => (
        <Input
          size="small"
          value={r.checkExpr}
          placeholder="如 value >= 0"
          onChange={(e) => update(r.key, { checkExpr: e.target.value })}
        />
      ),
    },
    {
      title: '外键引用',
      dataIndex: 'fk',
      width: 360,
      render: (_: any, r: ColumnDef) => (
        <Space.Compact style={{ width: '100%' }}>
          <Input
            size="small"
            style={{ width: 110 }}
            value={r.refTable}
            placeholder="引用表"
            onChange={(e) => update(r.key, { refTable: e.target.value })}
          />
          <Input
            size="small"
            style={{ width: 110 }}
            value={r.refColumn}
            placeholder="引用列"
            onChange={(e) => update(r.key, { refColumn: e.target.value })}
          />
          <Select
            size="small"
            style={{ width: 136 }}
            value={r.onDelete}
            options={FK_ACTION_OPTIONS}
            onChange={(v) => update(r.key, { onDelete: v })}
          />
        </Space.Compact>
      ),
    },
    {
      title: '更新动作',
      dataIndex: 'onUpdate',
      width: 136,
      render: (_: any, r: ColumnDef) => (
        <Select
          size="small"
          style={{ width: '100%' }}
          value={r.onUpdate}
          options={FK_ACTION_OPTIONS}
          onChange={(v) => update(r.key, { onUpdate: v })}
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
      width={980}
      okText="执行建表"
      cancelText="取消"
      onOk={handleExecute}
      onCancel={() => {
        reset();
        onClose();
      }}
      okButtonProps={{ disabled: !canExecute }}
    >
      <Space orientation="vertical" style={{ width: '100%' }} size="middle">
        <Space.Compact style={{ width: '100%' }}>
          <Space.Addon>表名</Space.Addon>
          <Input
            value={tableName}
            placeholder="新表名称"
            onChange={(e) => setTableName(e.target.value)}
          />
        </Space.Compact>
        <Table
          size="small"
          rowKey="key"
          pagination={false}
          dataSource={cols}
          columns={columns as any}
          scroll={{ x: 'max-content' }}
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
              background: 'var(--sqlite-code-background)',
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
