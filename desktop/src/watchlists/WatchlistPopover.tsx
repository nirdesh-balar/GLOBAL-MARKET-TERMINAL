import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function WatchlistPopover({ anchor, label, onClose, children }: {
    anchor: HTMLButtonElement;
    label: string;
    onClose: (restoreFocus?: boolean) => void;
    children: ReactNode;
}) {
    const surface = useRef<HTMLDivElement>(null);
    const dismiss = useRef(onClose);
    dismiss.current = onClose;

    useLayoutEffect(() => {
        const panel = surface.current;
        if (!panel) return;
        const position = () => {
            const rect = anchor.getBoundingClientRect();
            const width = panel.offsetWidth;
            const below = window.innerHeight - rect.bottom - 9;
            const above = rect.top - 9;
            const flip = below < Math.min(panel.scrollHeight, 240) && above > below;
            panel.style.maxHeight = `${Math.max(72, flip ? above : below)}px`;
            panel.style.left = `${Math.max(6, Math.min(rect.left, window.innerWidth - width - 6))}px`;
            panel.style.top = `${Math.max(6, flip ? rect.top - panel.offsetHeight - 4 : rect.bottom + 4)}px`;
        };
        position();
        (panel.querySelector<HTMLButtonElement>('[aria-pressed="true"]') ||
            panel.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus();
        const outside = (event: PointerEvent) => {
            if (!panel.contains(event.target as Node) && !anchor.contains(event.target as Node)) dismiss.current(false);
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopImmediatePropagation();
            dismiss.current();
        };
        window.addEventListener('resize', position);
        document.addEventListener('pointerdown', outside);
        document.addEventListener('keydown', escape, true);
        return () => {
            window.removeEventListener('resize', position);
            document.removeEventListener('pointerdown', outside);
            document.removeEventListener('keydown', escape, true);
        };
    }, [anchor]);

    return createPortal(
        <div ref={surface} role="group" aria-label={label} className="watchlist-popover" onKeyDown={event => {
            if (!(event.target instanceof HTMLButtonElement)) return;
            const buttons = Array.from(event.currentTarget.querySelectorAll('button:not(:disabled)'));
            const index = buttons.indexOf(event.target);
            const last = buttons.length - 1;
            const target = event.key === 'ArrowDown' ? Math.min(index + 1, last) :
                event.key === 'ArrowUp' ? Math.max(index - 1, 0) :
                event.key === 'Home' ? 0 : event.key === 'End' ? last : -1;
            if (target < 0) return;
            event.preventDefault();
            (buttons[target] as HTMLButtonElement)?.focus();
        }}>{children}</div>,
        anchor.closest('.terminal-shell') || document.body,
    );
}
