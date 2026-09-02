import { useMemo, useState } from 'react';
import Poster from './Poster';
import Section, { Empty, SkeletonRow } from './Section';
import { timeAgo } from '../lib/format';
import type { Errors, RecentItem } from '../types';

interface Props {
  items: RecentItem[] | null;
  errors: Errors | null;
  loading: boolean;
  full?: boolean;
}

type Filter = 'all' | 'movies' | 'series';

export default function RecentlyAdded({ items, errors, loading, full = false }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const visible = useMemo(() => {
    const list = (items ?? []).filter((i) => (filter === 'all' ? true : filter === 'movies' ? i.type === 'movie' : i.type !== 'movie'));
    return full ? list : list.slice(0, 6);
  }, [items, filter, full]);

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
      ) : (
        <div className={full ? 'grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8' : 'grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6'}>
          {visible.map((item) => (
            <figure key={item.id} className="group min-w-0">
              <div className="relative">
                <Poster src={item.poster} alt={item.title} kind={item.type === 'movie' ? 'movie' : 'tv'} className="shadow-poster transition-transform duration-200 group-hover:-translate-y-0.5" />
                <span className="absolute right-2 top-2 rounded-md bg-night-950/75 px-1.5 py-0.5 text-[10px] font-medium text-fog-300 backdrop-blur">{timeAgo(item.addedAt)}</span>
              </div>
              <figcaption className="mt-2.5">
                <p className="truncate text-sm font-semibold leading-tight" title={item.title}>
                  {item.title}
                </p>
                <p className="truncate text-xs text-fog-500" title={item.subtitle}>
                  {meta(item)}
                </p>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </Section>
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
