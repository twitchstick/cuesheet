import { useMemo } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import Section from './Section';
import { addDays, formatTime24to12, parseIsoDate } from '../lib/format';
import type { CalendarItem, Errors } from '../types';

interface Props {
  start: string;
  today: string;
  items: CalendarItem[] | null;
  errors: Errors | null;
  loading: boolean;
  onShift: (days: number) => void;
}

export default function WeekCalendar({ start, today, items, errors, loading, onShift }: Props) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const d of days) map.set(d, []);
    for (const item of items ?? []) map.get(item.date)?.push(item);
    return map;
  }, [days, items]);

  const first = parseIsoDate(days[0]);
  const last = parseIsoDate(days[6]);
  const monthLabel =
    first.getMonth() === last.getMonth()
      ? first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : `${first.toLocaleDateString(undefined, { month: 'short' })} – ${last.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
  const isCurrentWeek = today >= days[0] && today <= days[6];

  return (
    <Section
      title="Coming this week"
      subtitle="Monitored Sonarr and Radarr releases at a glance"
      errors={errors}
      action={
        <div className="flex items-center gap-1 rounded-xl border border-line bg-night-800 p-1">
          <button type="button" className="rounded-lg p-1.5 text-fog-300 hover:bg-white/5" onClick={() => onShift(-7)} aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" className="rounded-lg px-2 py-1 text-sm font-medium hover:bg-white/5" onClick={() => onShift(0)} title="Back to this week">
            {monthLabel}
          </button>
          <button type="button" className="rounded-lg p-1.5 text-fog-300 hover:bg-white/5" onClick={() => onShift(7)} aria-label="Next week">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      }
    >
      <div className="grid gap-2.5 md:grid-cols-7">
        {days.map((day) => {
          const date = parseIsoDate(day);
          const isToday = day === today;
          const list = byDay.get(day) ?? [];
          const hideOnMobile = !isToday && !loading && list.length === 0;
          return (
            <div key={day} className={`card flex-col p-3 md:min-h-[150px] ${isToday ? 'border-accent-500 ring-1 ring-accent-500/60' : ''} ${hideOnMobile ? 'hidden md:flex' : 'flex'}`}>
              <div className="mb-2.5 flex items-baseline justify-between">
                <span className={`text-[11px] font-bold uppercase tracking-wider ${isToday ? 'text-fog-100' : 'text-fog-300'}`}>{date.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                <span className={`text-[11px] ${isToday ? 'font-semibold text-accent-300' : 'text-fog-500'}`}>
                  {date.getDate()}
                  {isToday && <span className="ml-1 uppercase tracking-wider">· Today</span>}
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {loading && !items && [0].map((i) => <li key={i} className="h-12 animate-pulse rounded-lg bg-night-700" />)}
                {list.map((item) => {
                  const radarr = item.source === 'radarr';
                  return (
                    <li
                      key={item.id}
                      title={`${item.title} · ${item.subtitle}${item.network ? ` · ${item.network}` : ''}`}
                      className={`rounded-lg border px-2.5 py-2 ${radarr ? 'border-live/30 bg-live/10' : 'border-glow/30 bg-glow/10'}`}
                    >
                      <p className="flex items-center gap-1 text-xs font-semibold leading-tight">
                        <span className="truncate">{item.title}</span>
                        {item.hasFile && <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" aria-label="Downloaded" />}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-fog-500">
                        {radarr ? `${item.event ?? 'Release'} · Radarr` : `${item.subtitle.split(' · ')[0]} · Sonarr`}
                        {!radarr && item.time ? ` · ${formatTime24to12(item.time)}` : ''}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      {!loading && items && items.length === 0 && <p className="mt-3 text-center text-xs text-fog-700">{isCurrentWeek ? 'Nothing scheduled this week.' : 'Nothing scheduled that week.'}</p>}
    </Section>
  );
}
