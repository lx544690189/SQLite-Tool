import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, ThHTMLAttributes } from 'react';
import { translate } from '../i18n';

const MIN_COLUMN_WIDTH = 80;
const MAX_COLUMN_WIDTH = 720;

export interface ResizableHeaderCellProps extends ThHTMLAttributes<HTMLTableCellElement> {
  width?: number;
  resizable?: boolean;
  onColumnResize?: (width: number) => void;
}

export function clampColumnWidth(width: number) {
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)));
}

export function getColumnWidthKey(namespace: string, columnName: string) {
  return `${namespace}:${columnName}`;
}

export function ResizableHeaderCell({
  children,
  width,
  resizable,
  onColumnResize,
  className,
  style,
  ...rest
}: ResizableHeaderCellProps) {
  const startRef = useRef({ x: 0, width: 0 });

  const handlePointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!resizable || !width || !onColumnResize) return;

    event.preventDefault();
    event.stopPropagation();
    startRef.current = { x: event.clientX, width };
    document.body.classList.add('sqlite-column-resizing');

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const delta = moveEvent.clientX - startRef.current.x;
      onColumnResize(clampColumnWidth(startRef.current.width + delta));
    };

    const handlePointerUp = () => {
      document.body.classList.remove('sqlite-column-resizing');
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  return (
    <th
      {...rest}
      className={['sqlite-resizable-header-cell', className].filter(Boolean).join(' ')}
      style={{ ...style, width }}
    >
      {children}
      {resizable && (
        <span
          className="sqlite-column-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label={translate('resizable.resizeColumn')}
          onPointerDown={handlePointerDown}
        />
      )}
    </th>
  );
}
