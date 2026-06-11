import { useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Button, Checkbox, ConfigProvider, Input, Modal, Select, Space, Table, Typography, message } from 'antd';
import { DeleteOutlined, ExclamationCircleOutlined, PlusOutlined, UndoOutlined } from '@ant-design/icons';
import { translate } from '../i18n';
import { useI18n } from '../i18nContext';
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
}

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
    return translate('newTable.createSqlPlaceholder');
  }
  const lines = valid.map((c) => {
    const type = normalizeType(c.type);
    const parts = [`  ${quoteIdent(c.name)} ${type}`];
    if (c.pk) parts.push(`PRIMARY KEY${c.autoIncrement && type === 'INTEGER' ? ' AUTOINCREMENT' : ''}`);
    if (c.notnull) parts.push('NOT NULL');
    if (c.unique && !c.pk) parts.push('UNIQUE');
    const defaultSql = buildDefaultSQL(c);
    if (defaultSql) parts.push(defaultSql);
    return parts.join(' ');
  });
  return `CREATE TABLE ${quoteIdent(tableName)} (\n${lines.join(',\n')}\n);`;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function NewTableModal({ open, onClose }: Props) {
  const { language, t } = useI18n();
  const [tableName, setTableName] = useState('');
  const [cols, setCols] = useState<ColumnDef[]>(() => [newCol()]);
  const [manualSql, setManualSql] = useState(false);
  const [editedSql, setEditedSql] = useState('');

  const generatedSql = useMemo(() => buildCreateSQL(tableName, cols), [tableName, cols, language]);
  const sql = manualSql ? editedSql : generatedSql;
  const editorTheme = document.documentElement.dataset.sqliteTheme === 'dark' ? 'vs-dark' : 'light';
  const typeOptions = useMemo(
    () => [
      {
        label: t('newTable.typeSQLiteBasic'),
        options: ['INTEGER', 'TEXT', 'REAL', 'NUMERIC', 'BLOB'].map((value) => ({ value, label: value })),
      },
      {
        label: t('newTable.typeBusiness'),
        options: ['BOOLEAN', 'DATE', 'DATETIME', 'DECIMAL', 'JSON', 'VARCHAR(255)'].map((value) => ({
          value,
          label: value,
        })),
      },
    ],
    [t],
  );
  const defaultModeOptions = useMemo(
    () => [
      { value: 'none', label: t('newTable.defaultNone') },
      { value: 'literal', label: t('newTable.defaultLiteral') },
      { value: 'expression', label: t('newTable.defaultExpression') },
      { value: 'null', label: t('common.null') },
    ],
    [t],
  );

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

  const structureCanExecute = Boolean(tableName.trim()) && cols.some((c) => c.name.trim()) && cols.every((c) => {
    if (!c.name.trim()) {
      return true;
    }
    if (c.defaultMode !== 'none' && c.defaultMode !== 'null' && !c.dflt.trim()) {
      return false;
    }
    return true;
  });
  const canExecute = manualSql ? sql.trim().length > 0 : structureCanExecute;

  const handleSqlChange = (value?: string) => {
    const next = value ?? '';
    if (!manualSql && next === generatedSql) {
      return;
    }
    setEditedSql(next);
    setManualSql(true);
  };

  const restoreGeneratedSql = () => {
    setEditedSql('');
    setManualSql(false);
  };

  const reset = () => {
    setTableName('');
    setCols([newCol()]);
    setEditedSql('');
    setManualSql(false);
  };

  const handleExecute = () => {
    try {
      const beforeTables = new Set(dbState.tables.map((t) => t.name));
      helper.createTable(sql.trim());
      dbState.version++;
      refreshTables();
      const formTableName = tableName.trim();
      const formTable = dbState.tables.find((t) => t.name === formTableName);
      const createdTable = dbState.tables.find((t) => !beforeTables.has(t.name));
      dbState.activeTable = (manualSql ? createdTable ?? formTable : formTable ?? createdTable)?.name ?? dbState.activeTable;
      message.success(t('newTable.created'));
      reset();
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  };

  const columns = [
    {
      title: t('newTable.columnName'),
      dataIndex: 'name',
      render: (_: any, r: ColumnDef) => (
        <Input
          size="small"
          value={r.name}
          placeholder={t('newTable.columnNamePlaceholder')}
          onChange={(e) => update(r.key, { name: e.target.value })}
        />
      ),
    },
    {
      title: t('newTable.type'),
      dataIndex: 'type',
      width: 150,
      render: (_: any, r: ColumnDef) => (
        <Select
          size="small"
          style={{ width: '100%' }}
          value={r.type}
          options={typeOptions}
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
      title: t('newTable.autoIncrement'),
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
      title: t('newTable.notNull'),
      dataIndex: 'notnull',
      width: 50,
      render: (_: any, r: ColumnDef) => (
        <Checkbox checked={r.notnull} onChange={(e) => update(r.key, { notnull: e.target.checked })} />
      ),
    },
    {
      title: t('newTable.unique'),
      dataIndex: 'unique',
      width: 50,
      render: (_: any, r: ColumnDef) => (
        <Checkbox checked={r.unique} onChange={(e) => update(r.key, { unique: e.target.checked })} />
      ),
    },
    {
      title: t('newTable.defaultValue'),
      dataIndex: 'dflt',
      width: 250,
      render: (_: any, r: ColumnDef) => (
        <Space.Compact style={{ width: '100%' }}>
          <Select
            size="small"
            style={{ width: 82 }}
            value={r.defaultMode}
            options={defaultModeOptions}
            onChange={(v) => update(r.key, { defaultMode: v })}
          />
          <Input
            size="small"
            value={r.dflt}
            disabled={r.defaultMode === 'none' || r.defaultMode === 'null'}
            placeholder={r.defaultMode === 'expression' ? 'CURRENT_TIMESTAMP' : t('common.optional')}
            onChange={(e) => update(r.key, { dflt: e.target.value })}
          />
        </Space.Compact>
      ),
    },
    {
      title: '',
      key: 'actions',
      fixed: 'right',
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
      title={t('newTable.title')}
      width={860}
      okText={t('newTable.executeCreate')}
      cancelText={t('common.cancel')}
      onOk={handleExecute}
      onCancel={() => {
        reset();
        onClose();
      }}
      okButtonProps={{ disabled: !canExecute }}
    >
      <Space orientation="vertical" style={{ width: '100%' }} size="middle">
        <Space.Compact style={{ width: '100%' }}>
          <Space.Addon>{t('newTable.tableName')}</Space.Addon>
          <Input
            value={tableName}
            placeholder={t('newTable.newTableName')}
            onChange={(e) => setTableName(e.target.value)}
          />
        </Space.Compact>
        <ConfigProvider
          theme={{
            token: {
              colorBgContainer: 'var(--sqlite-modal-background)',
              colorSplit: 'var(--sqlite-border)',
            },
            components: {
              Table: {
                headerBg: 'var(--sqlite-modal-table-header-background)',
                headerColor: 'var(--sqlite-foreground)',
                headerSplitColor: 'var(--sqlite-border)',
                borderColor: 'var(--sqlite-border)',
                rowHoverBg: 'var(--sqlite-table-hover-background)',
                cellPaddingBlockSM: 6,
                cellPaddingInlineSM: 8,
                stickyScrollBarBg: 'var(--sqlite-scrollbar-background)',
                stickyScrollBarBorderRadius: 0,
              },
            },
          }}
        >
          <Table
            size="small"
            rowKey="key"
            pagination={false}
            dataSource={cols}
            columns={columns as any}
            scroll={{ x: 'max-content' }}
            classNames={{ root: 'sqlite-data-table' }}
            styles={{
              root: { background: 'var(--sqlite-modal-background)' },
              content: { background: 'var(--sqlite-modal-background)' },
            }}
          />
        </ConfigProvider>
        <Button icon={<PlusOutlined />} onClick={() => setCols((prev) => [...prev, newCol()])}>
          {t('newTable.addColumn')}
        </Button>
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 4,
            }}
          >
            <Typography.Text type="secondary">{t('newTable.sqlStatement')}</Typography.Text>
            {manualSql && (
              <Space size={8} align="center">
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    color: 'var(--sqlite-tag-warning-foreground)',
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <ExclamationCircleOutlined />
                  {t('newTable.manuallyEdited')}
                </span>
                <Button size="small" type="text" icon={<UndoOutlined />} onClick={restoreGeneratedSql}>
                  {t('common.restore')}
                </Button>
              </Space>
            )}
          </div>
          <div
            className="sqlite-sql-editor-panel"
            style={{
              height: 180,
              border: '1px solid var(--sqlite-border)',
              borderRadius: 4,
              overflow: 'hidden',
              background: 'var(--sqlite-editor-background)',
            }}
          >
            <Editor
              height="180px"
              language="sql"
              theme={editorTheme}
              value={sql}
              onChange={handleSqlChange}
              options={{
                minimap: { enabled: false },
                fontSize: 12,
                lineNumbersMinChars: 3,
                padding: { top: 10, bottom: 10 },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                quickSuggestions: true,
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
        </div>
      </Space>
    </Modal>
  );
}
