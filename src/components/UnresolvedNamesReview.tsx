import React, { useState } from 'react';
import { Owner } from '../types';
import { addNameAlias } from '../utils/ownerMatch';
import { AlertTriangle, Link2, UserPlus, X } from 'lucide-react';

export interface UnresolvedNameItem {
  rawName: string;
  rowIndices: number[]; // indices into the staging array this name affects
}

interface UnresolvedNamesReviewProps {
  unresolvedNames: UnresolvedNameItem[];
  owners: Owner[];
  onResolve: (rawName: string, ownerId: string) => void;
  onCreateNewOwner: (rawName: string) => void;
  onClose: () => void;
}

export default function UnresolvedNamesReview({
  unresolvedNames,
  owners,
  onResolve,
  onCreateNewOwner,
  onClose,
}: UnresolvedNamesReviewProps) {
  const [selections, setSelections] = useState<Record<string, string>>({});

  const handleLink = (rawName: string) => {
    const ownerId = selections[rawName];
    if (!ownerId) return;
    addNameAlias(ownerId, rawName);
    onResolve(rawName, ownerId);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h3 className="text-base font-black text-slate-800">
              Unresolved Names ({unresolvedNames.length})
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-xs text-slate-500">
          These names didn't match any known owner alias. Link each to an existing
          owner (this adds it as a permanent alias for all future uploads), or
          confirm it's a genuinely new owner.
        </p>
        <div className="space-y-3">
          {unresolvedNames.map((item) => (
            <div key={item.rawName} className="border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="font-mono font-bold text-sm text-slate-800">
                "{item.rawName}"
                <span className="ml-2 text-[10px] font-sans font-semibold text-slate-400">
                  {item.rowIndices.length} row(s) affected
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="text-xs border border-slate-300 rounded-lg px-2 py-1.5"
                  value={selections[item.rawName] || ''}
                  onChange={(e) =>
                    setSelections({ ...selections, [item.rawName]: e.target.value })
                  }
                >
                  <option value="">Select existing owner...</option>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleLink(item.rawName)}
                  disabled={!selections[item.rawName]}
                  className="inline-flex items-center gap-1 text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary-light disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg cursor-pointer"
                >
                  <Link2 className="h-3 w-3" /> Link as Alias
                </button>
                <button
                  type="button"
                  onClick={() => onCreateNewOwner(item.rawName)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg cursor-pointer"
                >
                  <UserPlus className="h-3 w-3" /> Register as New Owner
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
