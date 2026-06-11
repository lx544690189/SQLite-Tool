import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Alert, Button, Dropdown, Empty, Space, Table, Tag, Typography, message } from 'antd';
import { CaretRightOutlined, FormatPainterOutlined, HistoryOutlined } from '@ant-design/icons';
import { useSnapshot } from 'valtio';
import type * as Monaco from 'monaco-editor';
import { bridge } from '../bridge';
import { createTranslator, type SupportedLanguage } from '../i18n';
import { dbState, helper } from '../store/db';
import { addHistory, clearHistory, loadHistory, sqlState } from '../store/sql';
import SQLiteHelper from '../utils/SQLiteHelper';
import { monaco } from '../utils/monaco-setup';
import {
  getColumnWidthKey,
  ResizableHeaderCell,
  type ResizableHeaderCellProps,
} from './ResizableTableHeader';

const PAGE_SIZE_OPTIONS = ['20', '50', '100'];
const DEFAULT_RESULT_COLUMN_WIDTH = 180;
const MIN_RESULT_TABLE_WIDTH = 720;
const COMMON_SQL_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'ORDER BY',
  'GROUP BY',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'INSERT INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE FROM',
  'CREATE TABLE',
  'ALTER TABLE',
  'DROP TABLE',
  'JOIN',
  'LEFT JOIN',
  'INNER JOIN',
  'ON',
  'AS',
  'AND',
  'OR',
  'NOT',
  'NULL',
  'IS NULL',
  'IS NOT NULL',
  'LIKE',
  'IN',
  'BETWEEN',
  'EXISTS',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'DISTINCT',
  'UNION',
  'PRAGMA',
  'BEGIN',
  'COMMIT',
  'ROLLBACK',
];
const COMMON_SQL_FUNCTIONS = [
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'TOTAL',
  'ROUND',
  'ABS',
  'LENGTH',
  'LOWER',
  'UPPER',
  'TRIM',
  'SUBSTR',
  'COALESCE',
  'IFNULL',
  'NULLIF',
  'DATE',
  'TIME',
  'DATETIME',
  'STRFTIME',
  'JSON_EXTRACT',
];
const COMMON_SQL_SNIPPETS = [
  {
    label: 'SELECT',
    insertText: 'SELECT ${1:*}\nFROM ${2:table_name}\nWHERE ${3:condition};',
    detailKey: 'sql.snippetQuery',
  },
  {
    label: 'INSERT',
    insertText: 'INSERT INTO ${1:table_name} (${2:columns})\nVALUES (${3:values});',
    detailKey: 'sql.snippetInsert',
  },
  {
    label: 'UPDATE',
    insertText: 'UPDATE ${1:table_name}\nSET ${2:column = value}\nWHERE ${3:condition};',
    detailKey: 'sql.snippetUpdate',
  },
  {
    label: 'DELETE',
    insertText: 'DELETE FROM ${1:table_name}\nWHERE ${2:condition};',
    detailKey: 'sql.snippetDelete',
  },
  {
    label: 'CREATE TABLE',
    insertText: 'CREATE TABLE ${1:table_name} (\n  ${2:id INTEGER PRIMARY KEY},\n  ${3:name TEXT}\n);',
    detailKey: 'sql.snippetCreateTable',
  },
];

type CompletionKind = 'keyword' | 'function' | 'snippet' | 'table' | 'column';

interface SqlCompletionSource {
  label: string | Monaco.languages.CompletionItemLabel;
  insertText: string;
  kind: CompletionKind;
  detail?: string;
  documentation?: string;
  sortText: string;
  insertAsSnippet?: boolean;
  commitCharacters?: string[];
}

interface ResultState {
  columns: string[];
  rows: any[][];
  rowsModified: number;
  changed: boolean;
  empty: boolean;
}

interface SqlExecutorProps {
  dark: boolean;
  defaultPageSize: number;
  editorFontSize: number;
  language: SupportedLanguage;
}

function isPlainIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function getIdentifierInsertText(value: string): string {
  return isPlainIdentifier(value) ? value : quoteIdentifier(value);
}

function getCompletionKind(kind: CompletionKind): Monaco.languages.CompletionItemKind {
  switch (kind) {
    case 'keyword':
      return monaco.languages.CompletionItemKind.Keyword;
    case 'function':
      return monaco.languages.CompletionItemKind.Function;
    case 'snippet':
      return monaco.languages.CompletionItemKind.Snippet;
    case 'table':
      return monaco.languages.CompletionItemKind.Struct;
    case 'column':
      return monaco.languages.CompletionItemKind.Field;
    default:
      return monaco.languages.CompletionItemKind.Text;
  }
}

function buildStaticCompletionSources(t: ReturnType<typeof createTranslator>): SqlCompletionSource[] {
  const keywordSources = COMMON_SQL_KEYWORDS.map((keyword, index) => ({
    label: keyword,
    insertText: keyword,
    kind: 'keyword' as const,
    detail: t('sql.keywordDetail'),
    sortText: `1_${String(index).padStart(3, '0')}_${keyword}`,
  }));

  const functionSources = COMMON_SQL_FUNCTIONS.map((name, index) => ({
    label: name,
    insertText: `${name}($1)`,
    kind: 'function' as const,
    detail: t('sql.functionDetail'),
    sortText: `2_${String(index).padStart(3, '0')}_${name}`,
    insertAsSnippet: true,
  }));

  const snippetSources = COMMON_SQL_SNIPPETS.map((item, index) => ({
    label: item.label,
    insertText: item.insertText,
    kind: 'snippet' as const,
    detail: t(item.detailKey as any),
    sortText: `0_${String(index).padStart(3, '0')}_${item.label}`,
    insertAsSnippet: true,
  }));

  return [...snippetSources, ...keywordSources, ...functionSources];
}

function getEditorModel(editor: Monaco.editor.ICodeEditor): Monaco.editor.ITextModel | null {
  return editor.getModel();
}

function getSortedSelections(editor: Monaco.editor.ICodeEditor): Monaco.Selection[] {
  return [...(editor.getSelections() ?? [])].sort((a, b) => {
    if (a.startLineNumber !== b.startLineNumber) {
      return a.startLineNumber - b.startLineNumber;
    }
    return a.startColumn - b.startColumn;
  });
}

function getSelectedText(editor: Monaco.editor.ICodeEditor): string {
  const model = getEditorModel(editor);
  if (!model) return '';

  const selections = getSortedSelections(editor);
  if (selections.length === 0) {
    return '';
  }

  if (selections.every((selection) => selection.isEmpty())) {
    return selections.map((selection) => model.getLineContent(selection.startLineNumber)).join(model.getEOL());
  }

  return selections.map((selection) => model.getValueInRange(selection)).join(model.getEOL());
}

function getLineDeleteSelections(editor: Monaco.editor.ICodeEditor): Monaco.Selection[] {
  const model = getEditorModel(editor);
  if (!model) return [];

  return getSortedSelections(editor).map((selection) => {
    const lineNumber = selection.startLineNumber;
    const nextLineNumber = Math.min(lineNumber + 1, model.getLineCount());
    const nextLineColumn = lineNumber === model.getLineCount() ? model.getLineMaxColumn(lineNumber) : 1;
    return new monaco.Selection(lineNumber, 1, nextLineNumber, nextLineColumn);
  });
}

function getCursorSelectionAfterInsert(selection: Monaco.Selection, text: string): Monaco.Selection {
  const start = selection.getStartPosition();
  const lines = text.split(/\r\n|\r|\n/);
  const endLineNumber = start.lineNumber + lines.length - 1;
  const endColumn = lines.length === 1 ? start.column + text.length : lines[lines.length - 1].length + 1;
  return new monaco.Selection(endLineNumber, endColumn, endLineNumber, endColumn);
}

function selectAllSqlEditorText(editor: Monaco.editor.ICodeEditor): void {
  const model = getEditorModel(editor);
  if (!model) return;

  editor.setSelection(model.getFullModelRange(), 'sqlite-sql-editor-select-all');
}

async function copySqlEditorSelection(editor: Monaco.editor.ICodeEditor): Promise<void> {
  const text = getSelectedText(editor);
  if (text) {
    await bridge.writeClipboard(text);
  }
}

async function cutSqlEditorSelection(editor: Monaco.editor.ICodeEditor): Promise<void> {
  const model = getEditorModel(editor);
  if (!model) return;

  const selectedText = getSelectedText(editor);
  if (!selectedText) return;

  await bridge.writeClipboard(selectedText);
  const selections = getSortedSelections(editor);
  const deleteSelections = selections.every((selection) => selection.isEmpty())
    ? getLineDeleteSelections(editor)
    : selections;

  editor.pushUndoStop();
  editor.executeEdits(
    'sqlite-sql-editor-cut',
    deleteSelections.map((selection) => ({ range: selection, text: '', forceMoveMarkers: true })),
  );
  editor.pushUndoStop();
}

async function pasteIntoSqlEditor(editor: Monaco.editor.ICodeEditor): Promise<void> {
  const text = await bridge.readClipboard();
  if (!text) return;

  const selections = getSortedSelections(editor);
  if (selections.length === 0) return;

  editor.pushUndoStop();
  editor.executeEdits(
    'sqlite-sql-editor-paste',
    selections.map((selection) => ({ range: selection, text, forceMoveMarkers: true })),
    selections.map((selection) => getCursorSelectionAfterInsert(selection, text)),
  );
  editor.pushUndoStop();
}

function handleSqlEditorClipboardKeyDown(
  event: KeyboardEvent,
  editor: Monaco.editor.ICodeEditor,
): void {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) {
    return;
  }

  const key = event.key.toLowerCase();
  if (!['a', 'c', 'v', 'x'].includes(key)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  if (key === 'a') {
    selectAllSqlEditorText(editor);
    return;
  }
  if (key === 'c') {
    void copySqlEditorSelection(editor);
    return;
  }
  if (key === 'x') {
    void cutSqlEditorSelection(editor);
    return;
  }
  void pasteIntoSqlEditor(editor);
}

export default function SqlExecutor({ dark, defaultPageSize, editorFontSize, language }: SqlExecutorProps) {
  const t = useMemo(() => createTranslator(language), [language]);
  const snap = useSnapshot(dbState);
  const sqlSnap = useSnapshot(sqlState);
  const [sql, setSql] = useState('SELECT * FROM sqlite_master WHERE type = \'table\';');
  const [result, setResult] = useState<ResultState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const completionSourcesRef = useRef<SqlCompletionSource[]>([]);
  const panelRadius = 6;
  const panelShellStyle = {
    padding: 1,
    borderRadius: panelRadius,
    background: 'var(--sqlite-border)',
  } as const;

  const staticCompletionSources = useMemo(() => buildStaticCompletionSources(t), [t]);

  useEffect(() => {
    void loadHistory();
  }, []);

  const completionSources = useMemo(() => {
    if (!snap.initialized) {
      return staticCompletionSources;
    }

    const schemaSources = snap.tables.flatMap((table, tableIndex) => {
      const tableInsertText = getIdentifierInsertText(table.name);
      const tableSources: SqlCompletionSource[] = [
        {
          label: table.name,
          insertText: tableInsertText,
          kind: 'table',
          detail: t('sql.tableDetail', { count: table.rowCount }),
          sortText: `3_${String(tableIndex).padStart(3, '0')}_${table.name}`,
          commitCharacters: ['.', ' '],
        },
        {
          label: `SELECT * FROM ${table.name}`,
          insertText: `SELECT *\nFROM ${tableInsertText}\nLIMIT \${1:100};`,
          kind: 'snippet',
          detail: t('sql.tableQuery'),
          sortText: `0_table_${String(tableIndex).padStart(3, '0')}_${table.name}`,
          insertAsSnippet: true,
        },
      ];

      try {
        const columns = helper.getTableSchema(table.name);
        columns.forEach((column, columnIndex) => {
          const name = String(column.name);
          const type = column.type ? String(column.type) : t('sql.undeclaredType');
          tableSources.push({
            label: {
              label: name,
              detail: type,
              description: table.name,
            },
            insertText: getIdentifierInsertText(name),
            kind: 'column',
            detail: `${table.name}.${name}`,
            documentation: t('sql.columnTypeDoc', { type }),
            sortText: `4_${String(tableIndex).padStart(3, '0')}_${String(columnIndex).padStart(3, '0')}_${name}`,
          });
        });

        if (columns.length > 0) {
          const columnList = columns.map((column) => getIdentifierInsertText(String(column.name))).join(', ');
          tableSources.push({
            label: `SELECT columns FROM ${table.name}`,
            insertText: `SELECT ${columnList}\nFROM ${tableInsertText}\nLIMIT \${1:100};`,
            kind: 'snippet',
            detail: t('sql.tableColumnsQuery'),
            sortText: `0_columns_${String(tableIndex).padStart(3, '0')}_${table.name}`,
            insertAsSnippet: true,
          });
        }
      } catch {
        // 表结构可能刚被 SQL 修改，下一次刷新会重新生成提示。
      }

      return tableSources;
    });

    return [...staticCompletionSources, ...schemaSources];
  }, [snap.initialized, snap.tables, snap.version, staticCompletionSources, t]);

  useEffect(() => {
    completionSourcesRef.current = completionSources;
  }, [completionSources]);

  useEffect(() => {
    const disposable = monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: [' ', '.', '"'],
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        return {
          suggestions: completionSourcesRef.current.map((source) => ({
            label: source.label,
            kind: getCompletionKind(source.kind),
            detail: source.detail,
            documentation: source.documentation,
            insertText: source.insertText,
            insertTextRules: source.insertAsSnippet
              ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
              : undefined,
            sortText: source.sortText,
            range,
            commitCharacters: source.commitCharacters,
          })),
        };
      },
    });

    return () => disposable.dispose();
  }, []);

  const run = useCallback((rawSql?: string) => {
    const text = (rawSql ?? sql).trim();
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
  }, [sql]);

  const format = () => setSql(SQLiteHelper.formatSQL(sql));

  const resizeColumn = useCallback((columnName: string, width: number) => {
    const key = getColumnWidthKey('sql-result', columnName);
    setColumnWidths((prev) => ({ ...prev, [key]: width }));
  }, []);

  const resultColumns = useMemo(
    () =>
      result?.columns.map((c) => {
        const width = columnWidths[getColumnWidthKey('sql-result', c)] ?? DEFAULT_RESULT_COLUMN_WIDTH;
        return {
          title: c,
          dataIndex: c,
          key: c,
          width,
          ellipsis: true,
          onHeaderCell: () => ({
            width,
            resizable: true,
            onColumnResize: (nextWidth: number) => resizeColumn(c, nextWidth),
          }) as ResizableHeaderCellProps,
          render: (v: unknown) =>
            v === null || v === undefined ? <Tag className="sqlite-tag sqlite-tag-null">NULL</Tag> : String(v),
        };
      }) ?? [],
    [columnWidths, resizeColumn, result?.columns],
  );

  const tableComponents = useMemo(
    () => ({
      header: {
        cell: ResizableHeaderCell,
      },
    }),
    [],
  );

  const tableScrollX = useMemo(() => {
    const width = resultColumns.reduce((total, col) => total + col.width, 0);
    return Math.max(MIN_RESULT_TABLE_WIDTH, width);
  }, [resultColumns]);

  if (!snap.initialized) {
    return <Empty description={t('sql.databaseNotReady')} style={{ marginTop: 80 }} />;
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 12, gap: 10 }}>
      <Space>
        <Button type="primary" icon={<CaretRightOutlined />} loading={running} onClick={() => run()}>
          {t('sql.execute')}
        </Button>
        <Button icon={<FormatPainterOutlined />} onClick={format}>
          {t('sql.format')}
        </Button>
        <Dropdown
          trigger={['click']}
          menu={{
            items:
              sqlSnap.history.length === 0
                ? [{ key: 'empty', label: t('sql.noHistory'), disabled: true }]
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
                      label: t('sql.clearHistory'),
                      danger: true,
                      onClick: () => {
                        clearHistory();
                        message.success(t('sql.historyCleared'));
                      },
                    },
                  ],
          }}
        >
          <Button icon={<HistoryOutlined />}>{t('sql.history', { count: sqlSnap.history.length })}</Button>
        </Dropdown>
      </Space>

      <div style={panelShellStyle}>
        <div
          className="sqlite-sql-editor-panel"
          style={{
            height: 220,
            borderRadius: panelRadius - 1,
            overflow: 'hidden',
            background: 'var(--sqlite-editor-background)',
          }}
        >
          <Editor
            key={`sql-editor-${language}`}
            height="220px"
            language="sql"
            theme={dark ? 'vs-dark' : 'light'}
            value={sql}
            onChange={(v) => setSql(v ?? '')}
            options={{
              minimap: { enabled: false },
              fontSize: editorFontSize,
              lineNumbersMinChars: 3,
              padding: { top: 10, bottom: 10 },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              quickSuggestions: true,
              suggestOnTriggerCharacters: true,
              snippetSuggestions: 'top',
              overviewRulerBorder: false,
              overviewRulerLanes: 0,
              scrollbar: {
                verticalScrollbarSize: 6,
                horizontalScrollbarSize: 6,
                alwaysConsumeMouseWheel: false,
              },
            }}
            onMount={(editor, monaco) => {
              editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => run(editor.getValue()));
              editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC, () => {
                void copySqlEditorSelection(editor);
              });
              editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX, () => {
                void cutSqlEditorSelection(editor);
              });
              editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, () => {
                void pasteIntoSqlEditor(editor);
              });
              const handleKeyDownCapture = (event: KeyboardEvent) => {
                handleSqlEditorClipboardKeyDown(event, editor);
              };
              editor.getContainerDomNode().addEventListener('keydown', handleKeyDownCapture, true);
              editor.onDidDispose(() => {
                editor.getContainerDomNode().removeEventListener('keydown', handleKeyDownCapture, true);
              });
              editor.addAction({
                id: 'sqlite-sql-editor-copy',
                label: t('sql.copyVscode'),
                contextMenuGroupId: '9_cutcopypaste',
                contextMenuOrder: -3,
                run: (currentEditor) => copySqlEditorSelection(currentEditor),
              });
              editor.addAction({
                id: 'sqlite-sql-editor-cut',
                label: t('sql.cutVscode'),
                contextMenuGroupId: '9_cutcopypaste',
                contextMenuOrder: -2,
                run: (currentEditor) => cutSqlEditorSelection(currentEditor),
              });
              editor.addAction({
                id: 'sqlite-sql-editor-paste',
                label: t('sql.pasteVscode'),
                contextMenuGroupId: '9_cutcopypaste',
                contextMenuOrder: -1,
                run: (currentEditor) => pasteIntoSqlEditor(currentEditor),
              });
              editor.onKeyDown((event) => {
                const browserEvent = event.browserEvent;
                const isModifierPressed = browserEvent.metaKey || browserEvent.ctrlKey;
                const key = browserEvent.key.toLowerCase();
                if (isModifierPressed && ['a', 'c', 'f', 'v', 'x', 'y', 'z'].includes(key)) {
                  browserEvent.stopPropagation();
                }
              });
            }}
          />
        </div>
      </div>

      {error && <Alert type="error" title={error} showIcon />}

      <div style={{ ...panelShellStyle, flex: 1, minHeight: 0 }}>
        <div
          style={{
            height: '100%',
            borderRadius: panelRadius - 1,
            overflow: 'hidden',
            background: 'var(--sqlite-editor-background)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {result && !result.empty && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                borderBottom: '1px solid var(--sqlite-border)',
                flexShrink: 0,
              }}
            >
              <Tag className="sqlite-tag sqlite-tag-info">{t('common.rows', { count: result.rows.length })}</Tag>
              {result.changed && (
                <Tag className="sqlite-tag sqlite-tag-changed">{t('sql.affectedRows', { count: result.rowsModified })}</Tag>
              )}
            </div>
          )}
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: result ? 10 : 14 }}>
            {result && result.empty ? (
              <Alert
                type="success"
                showIcon
                title={
                  result.changed
                    ? t('sql.successChanged', { count: result.rowsModified })
                    : t('sql.successNoResult')
                }
              />
            ) : result ? (
              <Table
                key={`sql-result-${defaultPageSize}`}
                size="small"
                rowKey={(_, i) => String(i)}
                tableLayout="fixed"
                classNames={{ root: 'sqlite-data-table sqlite-sql-result-table' }}
                dataSource={result.rows.map((row, i) => {
                  const obj: any = { __i: i };
                  result.columns.forEach((c, ci) => (obj[c] = row[ci]));
                  return obj;
                })}
                components={tableComponents}
                columns={resultColumns}
                scroll={{ x: tableScrollX }}
                pagination={{
                  defaultPageSize,
                  showSizeChanger: true,
                  pageSizeOptions: PAGE_SIZE_OPTIONS,
                  showTotal: (total) => t('table.totalRows', { total }),
                }}
              />
            ) : (
              <div
                style={{
                  height: '100%',
                  minHeight: 160,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 4px',
                }}
              >
                <Typography.Text type="secondary">{t('sql.viewResultsAfterRun')}</Typography.Text>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
