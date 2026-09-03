import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Section from './Section';
import { formatTime24to12, parseIsoDate, toIsoDate } from '../lib/format';
import type { CalendarItem, Errors } from '../types';

interface Props {
  month: string; // any date inside the month, as YYYY-MM-DD
  today: string;
  items: CalendarItem[] | null;
  errors: Errors | null;
  loading: boolean;
  onMonth: (month: string) => void;
  onSelect?: (item: CalendarItem) => void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** The grid runs Monday to Sunday and always fills whole weeks. */
export function gridFor(month: string): string[] {
  const first = parseIsoDate(month);
  first.setDate(1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const days: string[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(toIsoDate(d));
    // Stop after the week that carries the last day of the month.
    if (i >= 27 && d.getMonth() !== first.getMonth() && d.getDay() === 0) break;
  }
  return days;
}

const shiftMonth = (month: string, by: number) => {
  const d = parseIsoDate(month);
  d.setDate(1);
  d.setMonth(d.getMonth() + by);
  return toIsoDate(d);
};

export default function MonthCalendar({ month, today, items, errors, loading, onMonth, onSelect }: Props) {
  const days = useMemo(() => gridFor(month), [month]);
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items ?? []) {
      if (!map.has(item.date)) map.set(item.date, []);
      map.get(item.date)!.push(item);
    }
    return map;
  }, [items]);

  const thisMonth = parseIsoDate(month).getMonth();
  const label = parseIsoDate(month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const total = items?.length ?? 0;

  return (
    <Section
      title="Release calendar"
      subtitle={loading && !items ? 'Loading…' : `${total} release${total === 1 ? '' : 's'} in ${label}`}
      errors={errors}
      action={
        <div className="flex items-center gap-1 rounded-xl border border-line bg-night-800 p-1">
          <button type="button" className="rounded-lg p-1.5 text-fog-300 hover:bg-white/5" onClick={() => onMonth(shiftMonth(month, -1))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" className="min-w-[9.5rem] rounded-lg px-2 py-1 text-sm font-medium hover:bg-white/5" onClick={() => onMonth(today)} title="Back to this month">
            {label}
          </button>
          <button type="button" className="rounded-lg p-1.5 text-fog-300 hover:bg-white/5" onClick={() => onMonth(shiftMonth(month, 1))} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      }
    >
      <div className="hidden grid-cols-7 gap-2 pb-2 md:grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="label px-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
        {days.map((day) => {
          const date = parseIsoDate(day);
          const outside = date.getMonth() !== thisMonth;
          const isToday = day === today;
          const list = byDay.get(day) ?? [];
          // On a phone the six-week grid is unreadable, so only days with something show.
          if (list.length === 0 && !isToday) {
            return (
              <div key={day} className={`hidden min-h-[4.5rem] flex-col rounded-xl border border-transparent p-2 md:flex ${outside ? 'opacity-30' : ''}`}>
                <DayNumber date={date} outside={outside} isToday={false} />
              </div>
            );
          }
          return (
            <div
              key={day}
              className={`card flex min-h-[4.5rem] flex-col p-2 ${outside ? 'opacity-60' : ''} ${isToday ? 'border-accent-500 ring-1 ring-accent-500/50' : ''}`}
            >
              <DayNumber date={date} outside={outside} isToday={isToday} />
              <ul className="scroll-col mt-1.5 flex max-h-[9.5rem] flex-col gap-1 overflow-y-auto pr-0.5">
                {list.map((item) => {
                  const radarr = item.source === 'radarr';
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={onSelect ? () => onSelect(item) : undefined}
                        disabled={!onSelect}
                        title={`${item.title} · ${item.subtitle}`}
                        className={`block w-full border-l-2 px-1.5 py-1 text-left ${radarr ? 'border-l-live bg-live/5' : 'border-l-glow bg-glow/5'} ${
                          onSelect ? 'transition-colors hover:bg-white/[0.06]' : ''
                        }`}
                      >
                        <p className="truncate text-[11px] font-semibold leading-tight">{item.title}</p>
                        <p className="truncate font-mono text-[10px] text-fog-500">
                          {radarr ? (item.event ?? 'Release') : item.subtitle.split(' · ')[0]}
                          {!radarr && item.time ? ` ${formatTime24to12(item.time)}` : ''}
                          {item.hasFile ? ' ✓' : ''}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {list.length > 3 && <p className="label mt-1 !text-[9px]">{list.length} releases</p>}
            </div>
          );
        })}
      </div>

      {!loading && total === 0 && <p className="mt-3 text-center text-xs text-fog-700">Nothing scheduled in {label}.</p>}
    </Section>
  );
}

function DayNumber({ date, outside, isToday }: { date: Date; outside: boolean; isToday: boolean }) {
  return (
    <div className="flex items-baseline justify-between px-0.5">
      <span className={`font-mono text-xs tabular-nums ${isToday ? 'font-bold text-accent-300' : outside ? 'text-fog-700' : 'text-fog-300'}`}>
        {String(date.getDate()).padStart(2, '0')}
      </span>
      <span className="label !text-[9px] md:hidden">{date.toLocaleDateString(undefined, { weekday: 'short' })}</span>
      {isToday && <span className="label !text-accent-300">Today</span>}
    </div>
  );
}
