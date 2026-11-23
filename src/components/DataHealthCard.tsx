import { useEffect, useState } from 'react';
import { fetchDataHealth, type DataHealth } from '../lib/dataHealth.functions';

export default function DataHealthCard({ period }: { period: string }) {
  const [h, setH] = useState<DataHealth | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setH(null);
    fetchDataHealth({ data: { period } }).then(setH).catch(e => setErr(String(e?.message ?? e)));
  }, [period]);

  return (
    <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient">
      <h3 className="mb-3 font-mono text-xs font-black uppercase tracking-wider text-brand-primary">Data health · {period}</h3>
      {err && <p className="text-xs text-destructive">{err}</p>}
      {!h && !err && <p className="text-xs text-brand-text-variant">Checking…</p>}
      {h && (
        <div className="space-y-3 text-xs">
          <ul className="grid gap-2 sm:grid-cols-2">
            {h.items.map(i => (
              <li key={i.label} className="flex items-start justify-between gap-3 rounded-lg bg-muted p-2">
                <span><b>{i.label}</b><br /><span className="text-brand-text-variant">{i.hint}</span></span>
                <span className={`font-mono text-sm font-black ${i.count ? 'text-destructive' : 'text-brand-primary'}`}>{i.count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
          <p><b>Missing Daily MGT days:</b> {h.missingDays.length ? h.missingDays.map(d => d.slice(8)).join(', ') : 'none'}</p>
          <p><b>Weekly reports uploaded:</b> {h.weeks.join(' · ') || 'none'}</p>
        </div>
      )}
    </div>
  );
}
