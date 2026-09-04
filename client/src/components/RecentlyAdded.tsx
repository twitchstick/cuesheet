import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Poster from './Poster';
import Section, { Empty, SkeletonRow } from './Section';
import { timeAgo } from '../lib/format';
import type { Errors, RecentItem } from '../types';

interface Props {
  items: RecentItem[] | null;
  errors: Errors | null;
  loading: boolean;
  /** How many posters the row shows. Ignored in the full-page view. */
  limit?: number;
  full?: boolean;
  onSelect?: (item: RecentItem) => void;
}

type Filter = 'all' | 'movies' | 'series';

export default function RecentlyAdded({ items, errors, loading, limit = 15, full = false, onSelect }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const visible = useMemo(() => {
    const list = (items ?? []).filter((i) => (filter === 'all' ? true : filter === 'movies' ? i.type === 'movie' : i.type !== 'movie'));
    return full ? list : list.slice(0, limit);
  }, [items, filter, full, limit]);

  return (
    <Section
      title="Recently added"
      subtitle="Fresh arrivals across movies and series"
      errors={errors}
      action={
        <div className="seg" role="group" aria-label="Filter">
          {(['all', 'movies', 'series'] as Filter[]).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'movies' ? 'Movies' : 'Series'}
            </button>
          ))}
        </div>
      }
    >
      {loading && !items ? (
        <SkeletonRow />
      ) : visible.length === 0 ? (
        <Empty>{items && items.length ? 'Nothing in this filter yet.' : 'Nothing new in the library yet.'}</Empty>
      ) : full ? (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
          {visible.map((item) => (
            <Card key={item.id} item={item} onSelect={onSelect} />
          ))}
        </div>
      ) : (
        <ScrollRow>
          {visible.map((item) => (
            <div key={item.id} className="w-32 shrink-0 snap-start sm:w-36 lg:w-40">
              <Card item={item} onSelect={onSelect} />
            </div>
          ))}
        </ScrollRow>
      )}
    </Section>
  );
}

/** A horizontally scrolling strip with arrows that appear only when there is
 * more to see. Exported for Recently Requested, which shares this exact
 * scroll-row treatment. */
export function ScrollRow({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ start: el.scrollLeft > 8, end: el.scrollLeft < max - 8 });
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure, children]);

  const nudge = (direction: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(240, el.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <div className="group relative">
      <div ref={ref} onScroll={measure} className="scroll-row -mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-2">
        {children}
      </div>
      <Arrow side="left" show={edges.start} onClick={() => nudge(-1)} />
      <Arrow side="right" show={edges.end} onClick={() => nudge(1)} />
    </div>
  );
}

function Arrow({ side, show, onClick }: { side: 'left' | 'right'; show: boolean; onClick: () => void }) {
  if (!show) return null;
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Scroll back' : 'Scroll forward'}
      className={`absolute top-[38%] hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-night-900/90 text-fog-100 shadow-card backdrop-blur transition-opacity hover:bg-night-700 focus:opacity-100 md:flex md:opacity-0 md:group-hover:opacity-100 ${
        side === 'left' ? '-left-3' : '-right-3'
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function Card({ item, onSelect }: { item: RecentItem; onSelect?: (item: RecentItem) => void }) {
  const body = (
    <>
      <div className="relative">
        <Poster
          src={item.poster}
          alt={item.title}
          kind={item.type === 'movie' ? 'movie' : 'tv'}
          className="shadow-poster transition-transform duration-200 group-hover/card:-translate-y-0.5"
        />
        <span className="absolute right-2 top-2 rounded-md bg-night-950/75 px-1.5 py-0.5 text-[11px] font-medium text-fog-300 backdrop-blur">{timeAgo(item.addedAt)}</span>
      </div>
      <figcaption className="mt-2.5 text-left">
        <p className="truncate text-sm font-semibold leading-tight" title={item.title}>
          {item.title}
        </p>
        <p className="truncate text-xs text-fog-500" title={item.subtitle}>
          {meta(item)}
        </p>
      </figcaption>
    </>
  );

  if (!onSelect) return <figure className="group/card min-w-0">{body}</figure>;
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      aria-label={`${item.title} — details`}
      className="group/card block w-full min-w-0 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
    >
      {body}
    </button>
  );
}

function meta(item: RecentItem): string {
  switch (item.type) {
    case 'movie':
      return `Movie${item.year ? ` · ${item.year}` : ''}`;
    case 'episode':
      return `Series · ${item.subtitle.split(' · ')[0]}`;
    case 'season':
      return `Series · ${item.subtitle}`;
    default:
      return `Series${item.year ? ` · ${item.year}` : ''}`;
  }
}
