import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  ConfigProvider,
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
import {
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { SorterResult } from 'antd/es/table/interface';
import type { TableRef } from 'antd/es/table';
import { useSnapshot } from 'valtio';
import { addRow, dbState, editRow, helper, removeRow } from '../store/db';
import { translate } from '../i18n';
import { useI18n } from '../i18nContext';
import { ROWID_ALIAS, type PageResult } from '../utils/SQLiteHelper';
import AddDataModal from './AddDataModal';
import {
  getColumnWidthKey,
  ResizableHeaderCell,
  type ResizableHeaderCellProps,
} from './ResizableTableHeader';
import TableSearch, { type SearchCondition } from './TableSearch';

const PAGE_SIZE_OPTIONS = ['20', '50', '100'];
const TABLE_HEADER_HEIGHT = 34;
const MIN_TABLE_BODY_HEIGHT = 160;
const DEFAULT_COLUMN_WIDTH = 180;
const ACTION_COLUMN_WIDTH = 104;
const MIN_TABLE_WIDTH = 720;
const TABLE_BACKGROUND = 'var(--sqlite-editor-background)';
const TABLE_HEADER_BACKGROUND = 'var(--sqlite-table-header-background)';
const TABLE_HOVER_BACKGROUND = 'var(--sqlite-table-hover-background)';
const TABLE_SORT_BACKGROUND = 'var(--sqlite-table-sort-background)';
const TABLE_BORDER = 'var(--sqlite-border)';
const TABLE_FIXED_SHADOW = 'var(--sqlite-table-fixed-shadow)';

interface SortState {
  field?: string;
  order?: 'ASC' | 'DESC';
}

function renderCell(value: unknown) {
  if (value === null || value === undefined) {
    return <Tag className="sqlite-tag sqlite-tag-null">NULL</Tag>;
  }
  if (typeof value === 'object') {
    return <span style={{ opacity: 0.7 }}>[BLOB]</span>;
  }
  return String(value);
}

function getCellTitle(value: unknown, editable: boolean): string | undefined {
  if (value === null || value === undefined) {
    return editable ? translate('table.editing') : undefined;
  }
  const text = typeof value === 'object' ? '[BLOB]' : String(value);
  return editable ? `${text}\n${translate('table.editing')}` : text;
}

function getColumnWidth(col: { name: string; type?: string }) {
  const name = col.name.toLowerCase();
  const type = (col.type || '').toUpperCase();

  if (name === 'id' || name.endsWith('_id') || type === 'INTEGER') {
    return 120;
  }
  if (type.includes('DATE') || type.includes('TIME') || name.includes('time') || name.includes('date')) {
    return 210;
  }
  if (type.includes('BLOB')) {
    return 140;
  }
  if (name.includes('json') || name.includes('payload') || name.includes('message') || type.includes('TEXT')) {
    return 200;
  }
  return DEFAULT_COLUMN_WIDTH;
}

function getRowKey(row: Record<string, any>) {
  return row[ROWID_ALIAS] !== undefined ? `r${row[ROWID_ALIAS]}` : JSON.stringify(row);
}

type CellDraftValue = string | number | null;

function isNumericType(type: string): boolean {
  return ['INTEGER', 'REAL', 'NUMERIC', 'FLOAT', 'DOUBLE'].includes((type || '').toUpperCase());
}

function normalizeDraftValue(schema: any[], column: string, raw: CellDraftValue): any {
  const colType = (schema.find((c) => c.name === column)?.type || '').toUpperCase();
  const numeric = isNumericType(colType);
  return raw === '' || raw === null ? null : numeric ? Number(raw) : String(raw);
}

function isSameCellValue(current: unknown, next: unknown): boolean {
  return (current ?? null) === (next ?? null);
}

function getDraftValue(value: unknown, type: string): CellDraftValue {
  if (isNumericType(type)) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const numericValue = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }
  if (value === null || value === undefined) {
    return '';
  }
  return typeof value === 'object' ? String(value) : String(value);
}

function getDraftColumnValue(
  draft: Record<string, CellDraftValue>,
  column: string,
  fallback: CellDraftValue,
): CellDraftValue {
  return Object.prototype.hasOwnProperty.call(draft, column) ? draft[column] : fallback;
}

interface EditableCellProps {
  value: unknown;
  editable: boolean;
  numeric: boolean;
  draftValue: CellDraftValue;
  onDraftChange: (newValue: CellDraftValue) => void;
}

function EditableCell({ value, editable, numeric, draftValue, onDraftChange }: EditableCellProps) {
  if (editable) {
    if (numeric) {
      return (
        <InputNumber
          size="small"
          style={{ width: '100%' }}
          value={typeof draftValue === 'number' ? draftValue : null}
          onChange={(nextValue) => onDraftChange(typeof nextValue === 'number' ? nextValue : null)}
        />
      );
    }

    return (
      <Input
        size="small"
        value={draftValue === null || draftValue === undefined ? '' : String(draftValue)}
        onChange={(e) => onDraftChange(e.target.value)}
      />
    );
  }

  return (
    <div
      style={{
        minHeight: 20,
        lineHeight: '20px',
        width: '100%',
        cursor: 'default',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
      title={getCellTitle(value, editable)}
    >
      {renderCell(value)}
    </div>
  );
}

interface TableDataPanelProps {
  defaultPageSize: number;
}

export default function TableDataPanel({ defaultPageSize }: TableDataPanelProps) {
  const { t } = useI18n();
  const snap = useSnapshot(dbState);
  const tableName = snap.activeTable;
  const version = snap.version;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [sort, setSort] = useState<SortState>({});
  const [search, setSearch] = useState<SearchCondition>({ column: null, keyword: '' });
  const [result, setResult] = useState<PageResult | null>(null);
  const [schema, setSchema] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [tableScrollY, setTableScrollY] = useState(MIN_TABLE_BODY_HEIGHT);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [hoveredRowKey, setHoveredRowKey] = useState<string | null>(null);
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<Record<string, CellDraftValue>>({});
  const tableViewportRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<TableRef>(null);

  const canEdit = tableName ? helper.canLocateRows(tableName) : false;

  const scrollTableToTop = () => {
    tableRef.current?.scrollTo({ top: 0 });
  };

  const clearEditing = useCallback(() => {
    setEditingRowKey(null);
    setEditingDraft({});
  }, []);

  const startEdit = useCallback(
    (row: Record<string, any>) => {
      const draft: Record<string, CellDraftValue> = {};
      schema.forEach((col) => {
        draft[col.name] = getDraftValue(row[col.name], col.type);
      });
      setEditingRowKey(getRowKey(row));
      setEditingDraft(draft);
    },
    [schema],
  );

  const updateDraft = useCallback((column: string, value: CellDraftValue) => {
    setEditingDraft((prev) => ({ ...prev, [column]: value }));
  }, []);

  useEffect(() => {
    setPage(1);
    setSort({});
    setSearch({ column: null, keyword: '' });
    clearEditing();
  }, [tableName, clearEditing]);

  useEffect(() => {
    clearEditing();
  }, [page, pageSize, sort, search, version, clearEditing]);

  useEffect(() => {
    setPage(1);
    setPageSize(defaultPageSize);
    clearEditing();
  }, [defaultPageSize, clearEditing]);

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

  const confirmEdit = useCallback((row: Record<string, any>) => {
    if (!tableName) return;
    try {
      const changes: Record<string, any> = {};
      for (const col of schema) {
        const raw = getDraftColumnValue(editingDraft, col.name, getDraftValue(row[col.name], col.type));
        const value = normalizeDraftValue(schema, col.name, raw);
        if (isNumericType(col.type) && value !== null && !Number.isFinite(value)) {
          throw new Error(t('table.fieldNumberInvalid', { name: col.name }));
        }
        if (!isSameCellValue(row[col.name], value)) {
          changes[col.name] = value;
        }
      }
      if (Object.keys(changes).length === 0) {
        clearEditing();
        return;
      }
      editRow(tableName, row, changes, schema);
      clearEditing();
      message.success(t('table.updated'));
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  }, [clearEditing, editingDraft, schema, tableName, t]);

  const handleDelete = (row: Record<string, any>) => {
    if (!tableName) return;
    try {
      removeRow(tableName, row, schema);
      message.success(t('table.deleted'));
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAdd = (data: Record<string, any>) => {
    if (!tableName) return;
    try {
      addRow(tableName, data, schema);
      setAddOpen(false);
      message.success(t('table.added'));
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  };

  const resizeColumn = useCallback(
    (columnName: string, width: number) => {
      if (!tableName) return;
      const key = getColumnWidthKey(tableName, columnName);
      setColumnWidths((prev) => ({ ...prev, [key]: width }));
    },
    [tableName],
  );

  const columns: ColumnsType<any> = useMemo(() => {
    const dataCols: ColumnsType<any> = schema.map((col) => {
      const width = tableName
        ? (columnWidths[getColumnWidthKey(tableName, col.name)] ?? getColumnWidth(col))
        : getColumnWidth(col);
      const numeric = isNumericType(col.type);
      return {
        title: (
          <span>
            {col.name}
            {col.pk > 0 && <Tag className="sqlite-tag sqlite-tag-pk" style={{ marginLeft: 4 }}>PK</Tag>}
            <span style={{ marginLeft: 4, opacity: 0.5, fontWeight: 400, fontSize: 12 }}>{col.type}</span>
          </span>
        ),
        dataIndex: col.name,
        key: col.name,
        width,
        ellipsis: true,
        sorter: true,
        sortOrder: sort.field === col.name ? (sort.order === 'ASC' ? 'ascend' : 'descend') : null,
        onHeaderCell: () => ({
          width,
          resizable: true,
          onColumnResize: (nextWidth: number) => resizeColumn(col.name, nextWidth),
        }) as ResizableHeaderCellProps,
        render: (value: unknown, row: Record<string, any>) => {
          const isEditing = editingRowKey === getRowKey(row);
          return (
            <EditableCell
              value={value}
              editable={canEdit && isEditing}
              numeric={numeric}
              draftValue={getDraftColumnValue(editingDraft, col.name, getDraftValue(value, col.type))}
              onDraftChange={(nextValue) => updateDraft(col.name, nextValue)}
            />
          );
        },
      };
    });

    if (canEdit) {
      dataCols.push({
        title: t('table.actions'),
        key: '__actions__',
        fixed: 'right',
        width: ACTION_COLUMN_WIDTH,
        onHeaderCell: () => ({
          style: {
            background: TABLE_HEADER_BACKGROUND,
          },
        }),
        onCell: (row: Record<string, any>) => ({
          style: {
            background: hoveredRowKey === getRowKey(row) ? TABLE_HOVER_BACKGROUND : TABLE_BACKGROUND,
          },
        }),
        render: (_: unknown, row: Record<string, any>) => {
          const rowKey = getRowKey(row);
          const isEditing = editingRowKey === rowKey;
          const hasOtherEditingRow = Boolean(editingRowKey && !isEditing);

          if (isEditing) {
            return (
              <Space size={2}>
                <Tooltip title={t('common.save')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<CheckOutlined />}
                    onClick={() => confirmEdit(row)}
                  />
                </Tooltip>
                <Tooltip title={t('common.cancel')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<CloseOutlined />}
                    onClick={clearEditing}
                  />
                </Tooltip>
              </Space>
            );
          }

          return (
            <Space size={2}>
              <Tooltip title={t('common.edit')}>
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  disabled={hasOtherEditingRow}
                  onClick={() => startEdit(row)}
                />
              </Tooltip>
              <Popconfirm
                title={t('table.deleteConfirm')}
                okText={t('common.delete')}
                cancelText={t('common.cancel')}
                okButtonProps={{ danger: true }}
                onConfirm={() => handleDelete(row)}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  disabled={hasOtherEditingRow}
                />
              </Popconfirm>
            </Space>
          );
        },
      });
    }
    return dataCols;
  }, [
    schema,
    tableName,
    columnWidths,
    sort,
    canEdit,
    resizeColumn,
    hoveredRowKey,
    editingRowKey,
    editingDraft,
    updateDraft,
    confirmEdit,
    clearEditing,
    startEdit,
    t,
  ]);

  const tableComponents = useMemo(
    () => ({
      header: {
        cell: ResizableHeaderCell,
      },
    }),
    [],
  );

  const tableScrollX = useMemo(() => {
    const width = columns.reduce((total, col) => {
      return total + (typeof col.width === 'number' ? col.width : DEFAULT_COLUMN_WIDTH);
    }, 0);
    return Math.max(MIN_TABLE_WIDTH, width);
  }, [columns]);

  if (!tableName) {
    return <Empty description={t('table.noTableSelected')} style={{ marginTop: 80 }} />;
  }

  return (
    <div style={{ padding: 12, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Space style={{ marginBottom: 12 }} wrap>
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          disabled={!canEdit}
          onClick={() => setAddOpen(true)}
        >
          {t('table.addRow')}
        </Button>
        <Tooltip title={t('common.refresh')}>
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
          <Tag className="sqlite-tag sqlite-tag-warning">{t('table.readonlyWarning')}</Tag>
        )}
      </Space>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 12 }} />}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div ref={tableViewportRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <ConfigProvider
            theme={{
              token: {
                colorBgContainer: TABLE_BACKGROUND,
                colorSplit: TABLE_FIXED_SHADOW,
              },
              components: {
                Table: {
                  headerBg: TABLE_HEADER_BACKGROUND,
                  headerSortActiveBg: TABLE_SORT_BACKGROUND,
                  headerSortHoverBg: TABLE_HOVER_BACKGROUND,
                  bodySortBg: TABLE_SORT_BACKGROUND,
                  rowHoverBg: TABLE_HOVER_BACKGROUND,
                  rowSelectedBg: TABLE_HOVER_BACKGROUND,
                  rowSelectedHoverBg: 'var(--sqlite-table-selected-hover-background)',
                  borderColor: TABLE_BORDER,
                  headerSplitColor: TABLE_BORDER,
                  cellPaddingBlockSM: 5,
                  cellPaddingInlineSM: 8,
                  stickyScrollBarBg: 'var(--sqlite-scrollbar-background)',
                  stickyScrollBarBorderRadius: 0,
                },
              },
            }}
          >
            <Table
              ref={tableRef}
              size="small"
              loading={loading}
              tableLayout="fixed"
              showSorterTooltip={false}
              styles={{
                root: { background: TABLE_BACKGROUND },
                content: { background: TABLE_BACKGROUND },
              }}
              classNames={{ root: 'sqlite-data-table' }}
              rowKey={getRowKey}
              onRow={(row) => ({
                onMouseEnter: () => setHoveredRowKey(getRowKey(row)),
                onMouseLeave: () => setHoveredRowKey(null),
              })}
              components={tableComponents}
              columns={columns}
              dataSource={result?.data ?? []}
              scroll={{ x: tableScrollX, y: tableScrollY, scrollToFirstRowOnChange: true }}
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
          </ConfigProvider>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '10px 0 7px',
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
            showTotal={(total) => t('table.totalRows', { total })}
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
