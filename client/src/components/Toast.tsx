import { CheckCircle2, XCircle } from 'lucide-react';

export interface ToastMessage {
  id: number;
  message: string;
  tone: 'ok' | 'error';
}

export default function Toasts({ items }: { items: ToastMessage[] }) {
  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((t) => (
        <div key={t.id} className="card animate-rise flex items-center gap-2 px-3 py-2 text-sm shadow-lg">
          {t.tone === 'ok' ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-rose-400" />}
          {t.message}
        </div>
      ))}
    </div>
  );
}
