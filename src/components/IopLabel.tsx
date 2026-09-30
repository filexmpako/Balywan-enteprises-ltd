export type IopSource = 'daily' | 'weekly' | 'monthly';

const TAG_STYLES: Record<IopSource, string> = {
  daily: 'bg-blue-100 text-blue-700 border-blue-200',
  weekly: 'bg-purple-100 text-purple-700 border-purple-200',
  monthly: 'bg-slate-100 text-slate-700 border-slate-300',
};

/**
 * "IOP" always carries its source: Daily MGT IOP (our tills paid a wakala
 * outside our base) and report IOP (a base wakala served by an outside
 * super-agent) are different measures and must never be read as one.
 */
export default function IopLabel({ source }: { source: IopSource }) {
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      IOP
      <span className={`rounded border px-1 py-px text-[8px] font-black uppercase leading-none tracking-wider ${TAG_STYLES[source]}`}>
        {source}
      </span>
    </span>
  );
}
