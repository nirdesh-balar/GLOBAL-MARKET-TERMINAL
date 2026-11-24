import { useEffect, useRef } from 'react';
import { X, Check } from 'lucide-react';
import { FLAG_COLORS, ORDERED_FLAG_COLORS, type FlagColor } from '../flags/constants';

export function ColorFlagPicker({
  currentColor,
  onSelectColor,
  onRemoveFlag,
  onClose,
  symbolName,
  position,
  compact = false,
  trigger,
}: {
  currentColor?: FlagColor | null;
  onSelectColor: (color: FlagColor) => void;
  onRemoveFlag?: () => void;
  onClose: () => void;
  symbolName: string;
  position?: { x: number; y: number };
  compact?: boolean;
  trigger?: HTMLButtonElement;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (compact) containerRef.current?.querySelector<HTMLButtonElement>('.color-chip-btn.selected,.color-chip-btn')?.focus({ preventScroll: true });
  }, [compact]);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        trigger?.focus({ preventScroll: true });
        onClose();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onClose, trigger]);

  // Adjust coordinates to ensure flyout stays on screen
  const x = position ? Math.max(10, Math.min(position.x, window.innerWidth - (compact ? 166 : 240))) : undefined;
  const y = position ? Math.max(10, Math.min(position.y, window.innerHeight - (compact ? 284 : 130))) : undefined;

  const style: React.CSSProperties = position
    ? { position: 'fixed', left: x, top: y, zIndex: 1100 }
    : {};

  return (
    <div
      ref={containerRef}
      className={`color-flag-picker-popover ${compact ? 'watchlist-flag-popover' : ''}`}
      style={style}
      role="dialog"
      aria-label={`Flag color for ${symbolName}`}
      onKeyDown={e => {
        if (!compact || !['ArrowDown','ArrowUp','Home','End'].includes(e.key)) return;
        const choices = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('.color-chip-btn,.unflag-btn'));
        const current = choices.indexOf(document.activeElement as HTMLButtonElement);
        const last = choices.length - 1;
        const target = e.key === 'Home' ? 0 : e.key === 'End' ? last :
            e.key === 'ArrowDown' ? Math.min(current + 1, last) : Math.max(current - 1, 0);
        choices[target]?.focus();
        e.preventDefault();
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="picker-header">
        <span className="picker-title">Flag {symbolName}</span>
        <button
          className="picker-close-btn"
          aria-label="Close flag picker"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <X size={13} />
        </button>
      </div>

      <div className="picker-colors-row" role="group" aria-label="Available flag colors">
        {ORDERED_FLAG_COLORS.map((col) => {
          const def = FLAG_COLORS[col];
          const isSelected = currentColor === col;
          return (
            <button
              key={col}
              data-testid={`flag-color-${col}`}
              aria-label={`Flag as ${def.name}`}
              title={`${def.name} (${def.defaultLabel})`}
              className={`color-chip-btn ${isSelected ? 'selected' : ''}`}
              style={compact ? undefined : { backgroundColor: def.hex }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectColor(col);
                trigger?.focus({ preventScroll: true });
                onClose();
              }}
            >
              {compact && <><i style={{ backgroundColor: def.hex }}/><span>{def.name}</span></>}
              {isSelected && <Check size={12} strokeWidth={3} />}
            </button>
          );
        })}
      </div>

      {currentColor && onRemoveFlag && (
        <div className="picker-footer">
          <button
            data-testid="remove-flag-btn"
            className="unflag-btn"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveFlag();
              trigger?.focus({ preventScroll: true });
              onClose();
            }}
          >
            <X size={12} />
            <span>Remove flag</span>
          </button>
        </div>
      )}
    </div>
  );
}
