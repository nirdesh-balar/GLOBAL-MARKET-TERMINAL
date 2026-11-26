import { memo, useMemo } from 'react';
import { Clock3 } from 'lucide-react';
import { clockFormatter, clockText, useChartClock } from './clockStore';

export const ChartClock = memo(function ChartClock({ id, zone, onOpen }: {
  id: string;
  zone: string;
  onOpen: () => void;
}) {
  const seconds = useChartClock();
  const formatter = useMemo(() => clockFormatter(zone), [zone]);
  return <button className="chart-zone-button" title={`Wall clock · ${zone} · Change display time zone`}
    aria-label={`Time zone pane ${id}`} aria-haspopup="dialog" onClick={onOpen}>
    <Clock3 size={12} aria-hidden="true" />
    <time dateTime={new Date(seconds * 1000).toISOString()} data-testid={`chart-clock-${id}`}>
      {clockText(formatter, seconds)}
    </time>
  </button>;
});
