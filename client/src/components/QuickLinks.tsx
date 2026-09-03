import { useState } from 'react';
import { Activity, Box, ChevronLeft, ChevronRight, Download, Globe, HardDrive, Link2, Pencil, Plus, Server, Shield, Terminal, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../api';
import type { LinkIcon, QuickLink } from '../types';

interface Props {
  items: QuickLink[] | null;
  loading: boolean;
  /** Called after a save or delete succeeds, so the parent can refetch. */
  onChange: () => void;
  notify: (message: string, tone?: 'ok' | 'error') => void;
}

const ICONS: Record<LinkIcon, typeof Link2> = {
  link: Link2,
  server: Server,
  shield: Shield,
  activity: Activity,
  'hard-drive': HardDrive,
  box: Box,
  download: Download,
  terminal: Terminal,
  globe: Globe,
};
const ICON_ORDER = Object.keys(ICONS) as LinkIcon[];

/** A quiet grid of squares that jump elsewhere on the network. */
export default function QuickLinks({ items, loading, onChange, notify }: Props) {
  const [editing, setEditing] = useState<QuickLink | 'new' | null>(null);
  if (loading && !items) return null;

  const list = items ?? [];
  const save = async (link: QuickLink) => {
    const next = list.some((l) => l.id === link.id) ? list.map((l) => (l.id === link.id ? link : l)) : [...list, link];
    try {
      await api.saveLinks(next);
      setEditing(null);
      onChange();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Could not save that link', 'error');
    }
  };
  const remove = async (id: string) => {
    try {
      await api.saveLinks(list.filter((l) => l.id !== id));
      setEditing(null);
      onChange();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Could not remove that link', 'error');
    }
  };
  const move = async (id: string, by: -1 | 1) => {
    const i = list.findIndex((l) => l.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    try {
      await api.saveLinks(next);
      onChange();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Could not reorder that link', 'error');
    }
  };

  if (list.length === 0 && editing === null) {
    return (
      <button
        type="button"
        onClick={() => setEditing('new')}
        className="card flex w-full items-center gap-3 border-dashed p-4 text-left text-sm text-fog-500 hover:border-line hover:text-fog-300"
      >
        <Plus className="h-4 w-4 shrink-0" />
        Add a link to anything else on your network — Unraid, Tracearr, Portainer, whatever else you reach for.
      </button>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {list.map((link, i) => (
          <Tile
            key={link.id}
            link={link}
            onEdit={() => setEditing(link)}
            onMoveBack={i > 0 ? () => move(link.id, -1) : undefined}
            onMoveForward={i < list.length - 1 ? () => move(link.id, 1) : undefined}
          />
        ))}
        <button
          type="button"
          onClick={() => setEditing('new')}
          aria-label="Add a link"
          className="card flex h-[74px] w-[74px] flex-col items-center justify-center gap-1 border-dashed text-fog-500 hover:border-line hover:text-fog-300"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {editing !== null && (
        <LinkEditor
          link={editing === 'new' ? null : editing}
          onSave={save}
          onDelete={editing !== 'new' ? () => remove(editing.id) : undefined}
          onCancel={() => setEditing(null)}
        />
      )}
    </>
  );
}

function Tile({
  link,
  onEdit,
  onMoveBack,
  onMoveForward,
}: {
  link: QuickLink;
  onEdit: () => void;
  /** Undefined at either end of the row -- nothing to swap with. */
  onMoveBack?: () => void;
  onMoveForward?: () => void;
}) {
  const Icon = ICONS[link.icon ?? 'link'] ?? Link2;
  const [customFailed, setCustomFailed] = useState(false);
  const [faviconFailed, setFaviconFailed] = useState(false);
  // Priority: an explicit icon address, then a curated pick, then the
  // site's own favicon, then the generic fallback. If the custom address
  // 404s, fall back straight to generic rather than the target's unrelated
  // favicon -- picking a custom icon was a deliberate choice to override it.
  const custom = link.iconUrl && !customFailed ? link.iconUrl : null;
  const favicon = !custom && !link.icon && !faviconFailed ? faviconUrl(link.url) : null;

  return (
    <div className="group/tile relative">
      <a
        href={link.url}
        target="_blank"
        rel="noreferrer noopener"
        title={link.label}
        className="card flex h-[74px] w-[74px] flex-col items-center justify-center gap-1.5 p-2 text-center transition-colors hover:bg-white/[0.035]"
      >
        {custom ? (
          <img src={custom} alt="" className="h-6 w-6 rounded" onError={() => setCustomFailed(true)} />
        ) : favicon ? (
          <img src={favicon} alt="" className="h-6 w-6 rounded" onError={() => setFaviconFailed(true)} />
        ) : (
          <Icon className="h-6 w-6 text-fog-300" strokeWidth={1.75} />
        )}
        <span className="w-full truncate text-[11px] leading-tight text-fog-500">{link.label}</span>
      </a>

      {/* One hover-reveal strip rather than three separate floating badges,
          which got crowded at this tile size. */}
      <div className="pointer-events-none absolute inset-x-0 -top-1.5 flex justify-center opacity-0 transition-opacity group-hover/tile:opacity-100 group-focus-within/tile:opacity-100">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-line bg-night-800 p-0.5 shadow-card">
          <button
            type="button"
            onClick={onMoveBack}
            disabled={!onMoveBack}
            aria-label={`Move ${link.label} earlier`}
            className="flex h-5 w-5 items-center justify-center rounded-full text-fog-300 hover:text-fog-100 disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${link.label}`}
            className="flex h-5 w-5 items-center justify-center rounded-full text-fog-300 hover:text-fog-100"
          >
            <Pencil className="h-2.5 w-2.5" />
          </button>
          <button
            type="button"
            onClick={onMoveForward}
            disabled={!onMoveForward}
            aria-label={`Move ${link.label} later`}
            className="flex h-5 w-5 items-center justify-center rounded-full text-fog-300 hover:text-fog-100 disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** The browser fetches this directly — Cuesheet's server is never involved. */
function faviconUrl(url: string): string | null {
  try {
    return `${new URL(url).origin}/favicon.ico`;
  } catch {
    return null;
  }
}

const inputCls =
  'w-full rounded-xl border border-line bg-night-900 px-3 py-2 text-sm placeholder:text-fog-700 focus:border-accent-500/60 focus:outline-none focus:ring-2 focus:ring-accent-500/25';

function LinkEditor({
  link,
  onSave,
  onDelete,
  onCancel,
}: {
  link: QuickLink | null;
  onSave: (link: QuickLink) => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(link?.label ?? '');
  const [url, setUrl] = useState(link?.url ?? '');
  const [icon, setIcon] = useState<LinkIcon | null>(link?.icon ?? null);
  const [customUrl, setCustomUrl] = useState(link?.iconUrl ?? '');
  const [customMode, setCustomMode] = useState(Boolean(link?.iconUrl));
  const [error, setError] = useState<string | null>(null);

  const pickCurated = (key: LinkIcon | null) => {
    setIcon(key);
    setCustomMode(false);
  };
  const pickCustom = () => {
    setIcon(null);
    setCustomMode(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return setError('Give it a name.');
    if (!url.trim()) return setError('Give it an address.');
    if (customMode && !customUrl.trim()) return setError('Give the icon an address, or switch back to Auto.');
    setError(null);
    // crypto.randomUUID() only exists in a secure context (HTTPS, or the
    // loopback exception for 127.0.0.1) -- Cuesheet is plain HTTP on a LAN
    // address, so the browser never has it. The server already assigns an
    // id when one isn't sent, so a new link just goes without one.
    onSave({
      id: link?.id ?? '',
      label: label.trim(),
      url: url.trim(),
      icon: customMode ? null : icon,
      iconUrl: customMode ? customUrl.trim() : null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-night-950/70 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label={link ? 'Edit link' : 'Add a link'}
        className="card relative w-full max-w-sm p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{link ? 'Edit link' : 'Add a link'}</h2>
          <button type="button" onClick={onCancel} aria-label="Close" className="rounded-lg p-1 text-fog-300 hover:bg-white/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-semibold text-fog-300">Name</span>
          <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Tracearr" autoFocus />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-semibold text-fog-300">Address</span>
          <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://192.168.1.10:9080" />
        </label>

        <div className="mb-4">
          <span className="mb-1.5 block text-xs font-semibold text-fog-300">Icon</span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => pickCurated(null)}
              className={`rounded-lg border px-2.5 py-1.5 text-xs ${!customMode && icon === null ? 'border-accent-500/60 bg-accent-500/10 text-fog-100' : 'border-line text-fog-500 hover:text-fog-300'}`}
            >
              Auto
            </button>
            {ICON_ORDER.map((key) => {
              const Icon = ICONS[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => pickCurated(key)}
                  aria-label={key}
                  title={key}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border ${!customMode && icon === key ? 'border-accent-500/60 bg-accent-500/10 text-fog-100' : 'border-line text-fog-500 hover:text-fog-300'}`}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </button>
              );
            })}
            <button
              type="button"
              onClick={pickCustom}
              className={`rounded-lg border px-2.5 py-1.5 text-xs ${customMode ? 'border-accent-500/60 bg-accent-500/10 text-fog-100' : 'border-line text-fog-500 hover:text-fog-300'}`}
            >
              Custom
            </button>
          </div>
          {customMode ? (
            <input
              className={`${inputCls} mt-2`}
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="http://192.168.1.194:4050/svg/radarr.svg"
              autoFocus
            />
          ) : (
            <p className="mt-1.5 text-[11px] text-fog-500">Auto uses the site's own icon; pick one, or point at your own icon server.</p>
          )}
        </div>

        {error && <p className="mb-3 text-xs text-tally-hold">{error}</p>}

        <div className="flex items-center justify-between gap-2">
          {onDelete ? (
            <button type="button" onClick={onDelete} className="btn-ghost !text-tally-hold" aria-label="Delete link">
              <Trash2 className="h-4 w-4" />
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
