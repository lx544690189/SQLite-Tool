import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  Input,
  InputNumber,
  Pagination,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd';
import { DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { SorterResult } from 'antd/es/table/interface';
import type { TableRef } from 'antd/es/table';
import { useSnapshot } from 'valtio';
import { addRow, dbState, editCell, helper, removeRow } from '../store/db';
import { ROWID_ALIAS, type PageResult } from '../utils/SQLiteHelper';
import AddDataModal from './AddDataModal';
import TableSearch, { type SearchCondition } from './TableSearch';

const PAGE_SIZE_OPTIONS = ['20', '50', '100'];
const TABLE_HEADER_HEIGHT = 40;
const MIN_TABLE_BODY_HEIGHT = 160;

interface SortState {
  field?: string;
  order?: 'ASC' | 'DESC';
}

function renderCell(value: unknown) {
  if (value === null || value === undefined) {
    return <Tag style={{ opacity: 0.6 }}>NULL</Tag>;
  }
  if (typeof value === 'object') {
    return <span style={{ opacity: 0.7 }}>[BLOB]</span>;
  }
  return String(value);
}

interface EditableCellProps {
  value: unknown;
  editable: boolean;
  numeric: boolean;
  onCommit: (newValue: string | number | null) => void;
}

function EditableCell({ value, editable, numeric, onCommit }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [numericDraft, setNumericDraft] = useState<number | null>(null);
  const committedRef = useRef(false);

  const finishEdit = (nextValue: string | number | null) => {
    if (committedRef.current) return;
    committedRef.current = true;
    setEditing(false);
    onCommit(nextValue);
  };

  if (editing) {
    if (numeric) {
      return (
        <InputNumber
          size="small"
          autoFocus
          style={{ width: '100%' }}
          value={numericDraft}
          onChange={(nextValue) => setNumericDraft(typeof nextValue === 'number' ? nextValue : null)}
          onBlur={() => finishEdit(numericDraft)}
          onPressEnter={() => finishEdit(numericDraft)}
        />
      );
    }

    return (
      <Input
        size="small"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finishEdit(draft)}
        onPressEnter={(e) => finishEdit((e.target as HTMLInputElement).value)}
      />
    );
  }

  return (
    <div
      style={{ minHeight: 22, cursor: editable ? 'text' : 'default' }}
      onDoubleClick={() => {
        if (editable) {
          committedRef.current = false;
          setDraft(value === null || value === undefined ? '' : String(value));
          setNumericDraft(
            value === null || value === undefined || value === ''
              ? null
              : typeof value === 'number'
                ? value
                : Number(value),
          );
          setEditing(true);
        }
      }}
      title={editable ? '双击编辑' : undefined}
    >
      {renderCell(value)}
    </div>
  );
}

export default function TableDataPanel() {
  const snap = useSnapshot(dbState);
  const tableName = snap.activeTable;
  const version = snap.version;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState<SortState>({});
  const [search, setSearch] = useState<SearchCondition>({ column: null, keyword: '' });
  const [result, setResult] = useState<PageResult | null>(null);
  const [schema, setSchema] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [tableScrollY, setTableScrollY] = useState(MIN_TABLE_BODY_HEIGHT);
  const tableViewportRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<TableRef>(null);

  const canEdit = tableName ? helper.canLocateRows(tableName) : false;

  const scrollTableToTop = () => {
    tableRef.current?.scrollTo({ top: 0 });
  };

  useEffect(() => {
    setPage(1);
    setSort({});
    setSearch({ column: null, keyword: '' });
  }, [tableName]);

  useEffect(() => {
    if (!tableName) {
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const cols = helper.getTableSchema(tableName);
      setSchema(cols);
      const res = helper.queryTableData(
        tableName,
        page,
        pageSize,
        sort.field,
        sort.order ?? 'ASC',
        search.column ?? undefined,
        search.keyword || undefined,
      );
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [tableName, page, pageSize, sort, search, version]);

  useEffect(() => {
    const el = tableViewportRef.current;
    if (!el) return;

    const updateHeight = () => {
      setTableScrollY(Math.max(MIN_TABLE_BODY_HEIGHT, el.clientHeight - TABLE_HEADER_HEIGHT));
    };
    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, [tableName, error]);

  const commitEdit = (row: Record<string, any>, column: string, raw: string | number | null) => {
    if (!tableName) return;
    try {
      const colType = (schema.find((c) => c.name === column)?.type || '').toUpperCase();
      const numeric = ['INTEGER', 'REAL', 'NUMERIC', 'FLOAT', 'DOUBLE'].includes(colType);
      const value = raw === '' || raw === null ? null : numeric ? Number(raw) : String(raw);
      const current = row[column];
      if ((current ?? null) === (value ?? null)) return; // 未变更
      editCell(tableName, row, column, value, schema);
      message.success('已更新');
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = (row: Record<string, any>) => {
    if (!tableName) return;
    try {
      removeRow(tableName, row, schema);
      message.success('已删除');
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAdd = (data: Record<string, any>) => {
    if (!tableName) return;
    try {
      addRow(tableName, data, schema);
      setAddOpen(false);
      message.success('已新增');
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  };

  const columns: ColumnsType<any> = useMemo(() => {
    const dataCols: ColumnsType<any> = schema.map((col) => {
      const numeric = ['INTEGER', 'REAL', 'NUMERIC', 'FLOAT', 'DOUBLE'].includes(
        (col.type || '').toUpperCase(),
      );
      return {
        title: (
          <span>
            {col.name}
            {col.pk > 0 && <Tag color="gold" style={{ marginLeft: 4 }}>PK</Tag>}
            <span style={{ marginLeft: 4, opacity: 0.5, fontWeight: 400, fontSize: 12 }}>{col.type}</span>
          </span>
        ),
        dataIndex: col.name,
        key: col.name,
        ellipsis: true,
        sorter: true,
        sortOrder: sort.field === col.name ? (sort.order === 'ASC' ? 'ascend' : 'descend') : null,
        render: (value: unknown, row: Record<string, any>) => (
          <EditableCell
            value={value}
            editable={canEdit}
            numeric={numeric}
            onCommit={(raw) => commitEdit(row, col.name, raw)}
          />
        ),
      };
    });

    if (canEdit) {
      dataCols.push({
        title: '操作',
        key: '__actions__',
        fixed: 'right',
        width: 70,
        render: (_: unknown, row: Record<string, any>) => (
          <Popconfirm
            title="确认删除该行？"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(row)}
          >
            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        ),
      });
    }
    return dataCols;
  }, [schema, sort, canEdit]);

  if (!tableName) {
    return <Empty description="请选择左侧的表" style={{ marginTop: 80 }} />;
  }

  return (
    <div style={{ padding: 12, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Space style={{ marginBottom: 12 }} wrap>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={!canEdit}
          onClick={() => setAddOpen(true)}
        >
          新增行
        </Button>
        <Tooltip title="刷新">
          <Button icon={<ReloadOutlined />} onClick={() => dbState.version++} />
        </Tooltip>
        <TableSearch
          columns={schema.map((c) => c.name)}
          onSearch={(cond) => {
            setPage(1);
            setSearch(cond);
          }}
        />
        {!canEdit && (
          <Tag color="warning">该表无主键且不支持 rowid，仅可浏览</Tag>
        )}
      </Space>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 12 }} />}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div ref={tableViewportRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <Table
            ref={tableRef}
            size="small"
            loading={loading}
            rowKey={(row) =>
              row[ROWID_ALIAS] !== undefined ? `r${row[ROWID_ALIAS]}` : JSON.stringify(row)
            }
            columns={columns}
            dataSource={result?.data ?? []}
            scroll={{ x: 'max-content', y: tableScrollY, scrollToFirstRowOnChange: true }}
            pagination={false}
            onChange={(_pagination, _filters, sorter) => {
              const s = sorter as SorterResult<any>;
              if (s.order) {
                setSort({ field: s.field as string, order: s.order === 'ascend' ? 'ASC' : 'DESC' });
              } else {
                setSort({});
              }
              setPage(1);
              scrollTableToTop();
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '10px 0 14px',
            flexShrink: 0,
          }}
        >
          <Pagination
            size="small"
            current={page}
            pageSize={pageSize}
            total={result?.total ?? 0}
            showSizeChanger
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            showTotal={(total) => `共 ${total} 行`}
            onChange={(nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
              scrollTableToTop();
            }}
          />
        </div>
      </div>
      <AddDataModal
        open={addOpen}
        tableName={tableName}
        schema={schema}
        onCancel={() => setAddOpen(false)}
        onOk={handleAdd}
      />
    </div>
  );
}
