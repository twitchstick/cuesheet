import Poster from './Poster';
import Section, { Empty, SkeletonRow } from './Section';
import { ScrollRow } from './RecentlyAdded';
import { timeAgo } from '../lib/format';
import type { LifecycleItem, LifecycleStage } from '../types';

interface Props {
  items: LifecycleItem[] | null;
  loading: boolean;
  /** How many posters the row shows. */
  limit?: number;
  /** Every card opens the same place -- the full Requests trace -- rather
   * than a per-item detail panel, since Radarr/Sonarr detail is already
   * one tap further in from there. */
  onOpen: () => void;
}

const STAGE_LABEL: Record<LifecycleStage, string> = {
  requested: 'Requested',
  monitored: 'Monitored',
  downloading: 'Downloading',
  importing: 'Importing',
  available: 'Available',
};

function meta(item: LifecycleItem): string {
  const label = STAGE_LABEL[item.stage];
  if ((item.stage === 'downloading' || item.stage === 'importing') && item.progress != null) {
    return `${label} · ${Math.round(item.progress * 100)}%`;
  }
  return label;
}

/**
 * The same poster-row theme as Recently Added, right below it -- what the
 * house just asked for, not just what arrived. Sourced from the same
 * lifecycle poll Requests/Downloads already use, so this adds no new
 * request of its own.
 */
export default function RecentlyRequested({ items, loading, limit = 15, onOpen }: Props) {
  const visible = (items ?? []).slice(0, limit);

  return (
    <Section title="Recently requested" subtitle="What the house has just asked for">
      {loading && !items ? (
        <SkeletonRow />
      ) : visible.length === 0 ? (
        <Empty>Nothing requested yet.</Empty>
      ) : (
        <ScrollRow>
          {visible.map((item) => (
            <div key={item.id} className="w-32 shrink-0 snap-start sm:w-36 lg:w-40">
              <Card item={item} onOpen={onOpen} />
            </div>
          ))}
        </ScrollRow>
      )}
    </Section>
  );
}

function Card({ item, onOpen }: { item: LifecycleItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${item.title} — open Requests`}
      className="group/card block w-full min-w-0 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
    >
      <div className="relative">
        <Poster
          src={item.poster}
          alt={item.title}
          kind={item.mediaType === 'movie' ? 'movie' : 'tv'}
          className="shadow-poster transition-transform duration-200 group-hover/card:-translate-y-0.5"
        />
        <span className="absolute right-2 top-2 rounded-md bg-night-950/75 px-1.5 py-0.5 text-[11px] font-medium text-fog-300 backdrop-blur">{timeAgo(item.createdAt)}</span>
      </div>
      <figcaption className="mt-2.5 text-left">
        <p className="truncate text-sm font-semibold leading-tight" title={item.title}>
          {item.title}
        </p>
        <p className="truncate text-xs text-fog-500">{meta(item)}</p>
        {/* Who asked, and in what quality once that's known -- a nice-to-know
            underneath the stage that's actually driving the card. */}
        <p className="mt-0.5 truncate text-[11px] text-fog-700" title={item.quality ? `${item.requestedBy} · ${item.quality}` : item.requestedBy}>
          {item.requestedBy}
          {item.quality && <span className="text-fog-500"> · {item.quality}</span>}
        </p>
      </figcaption>
    </button>
  );
}
