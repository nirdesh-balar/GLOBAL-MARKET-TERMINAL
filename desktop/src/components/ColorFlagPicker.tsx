import { useEffect, useRef } from 'react';
import { X, Check } from 'lucide-react';
import { FLAG_COLORS, ORDERED_FLAG_COLORS, type FlagColor } from '../flags/constants';

export function ColorFlagPicker({
  currentColor,
  onSelectColor,
  onRemoveFlag,
  onClose,
  symbolName,
  position
}: {
  currentColor?: FlagColor | null;
  onSelectColor: (color: FlagColor) => void;
  onRemoveFlag?: () => void;
  onClose: () => void;
  symbolName: string;
  position?: { x: number; y: number };
}) {
  const containerRef = useRef<HTMLDivElement>(null);

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
        onClose();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onClose]);

  // Adjust coordinates to ensure flyout stays on screen
  const x = position ? Math.max(10, Math.min(position.x, window.innerWidth - 240)) : undefined;
  const y = position ? Math.max(10, Math.min(position.y, window.innerHeight - 130)) : undefined;

  const style: React.CSSProperties = position
    ? { position: 'fixed', left: x, top: y, zIndex: 1100 }
    : {};

  return (
    <div
      ref={containerRef}
      className="color-flag-picker-popover"
      style={style}
      role="dialog"
      aria-label={`Flag color for ${symbolName}`}
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
              style={{ backgroundColor: def.hex }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectColor(col);
                onClose();
              }}
            >
              {isSelected && <Check size={12} color="#ffffff" strokeWidth={3} />}
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
