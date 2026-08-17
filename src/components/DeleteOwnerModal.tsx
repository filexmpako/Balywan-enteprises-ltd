import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Trash2, X, ShieldAlert, CheckCircle2, Lock, Smartphone, Signal, Camera, UserX } from 'lucide-react';
import { getOwnerDeletionImpact, deleteOwnerCascade, OwnerDeletionImpact } from '../utils/ownerDeletion';

export interface DeleteOwnerModalProps {
  isOpen: boolean;
  ownerId: string | null;
  ownerName: string | null;
  onClose: () => void;
  onSuccess: (toastMessage: string) => void;
}

export default function DeleteOwnerModal({
  isOpen,
  ownerId,
  ownerName,
  onClose,
  onSuccess,
}: DeleteOwnerModalProps) {
  const [impact, setImpact] = useState<OwnerDeletionImpact | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && ownerId) {
      setLoadingImpact(true);
      setError(null);
      setTypedName('');
      getOwnerDeletionImpact(ownerId)
        .then(result => {
          setImpact(result);
        })
        .catch(err => {
          console.error('Failed to get owner deletion impact:', err);
          setError('Could not load owner details for deletion.');
        })
        .finally(() => {
          setLoadingImpact(false);
        });
    } else {
      setImpact(null);
      setTypedName('');
      setError(null);
    }
  }, [isOpen, ownerId]);

  if (!isOpen || !ownerId) return null;

  const targetName = ownerName || impact?.ownerName || '';
  const isNameMatched = typedName.trim() === targetName.trim();

  const handleDelete = async () => {
    if (!isNameMatched || isDeleting) return;

    setIsDeleting(true);
    setError(null);

    try {
      const res = await deleteOwnerCascade(ownerId);
      const summaryMsg = `Owner "${targetName}" deleted. ${res.tillsUnassigned} tills and ${res.baseWakalasUnassigned} wakala unassigned, ${res.photosDeleted} photos removed${res.loginAccountDeleted ? ', login account deleted' : ''}.`;
      onSuccess(summaryMsg);
      onClose();
    } catch (err: any) {
      console.error('Failed to delete owner:', err);
      setError(err?.message || 'An error occurred during owner deletion.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-rose-200 overflow-hidden"
        >
          {/* Header */}
          <div className="bg-rose-600 p-5 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl shrink-0">
                <ShieldAlert className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-black tracking-tight leading-tight">Delete Owner Record</h3>
                <p className="text-xs text-rose-100 font-medium">Irreversible Cascading Action</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5 font-sans">
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-800 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                {error}
              </div>
            )}

            <div className="p-3.5 bg-rose-50/80 border border-rose-200/80 rounded-xl text-xs text-rose-950 space-y-1">
              <p className="font-extrabold flex items-center gap-1.5 text-rose-900">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                Warning: This action cannot be undone!
              </p>
              <p className="text-rose-800/90 leading-relaxed">
                You are about to delete <strong className="font-bold text-rose-950">{targetName}</strong> from the master owner roster.
              </p>
            </div>

            {/* Impact Details */}
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                Impact Summary
              </span>

              {loadingImpact ? (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs font-medium text-slate-500 animate-pulse">
                  Analyzing system dependencies...
                </div>
              ) : (
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="flex items-center gap-2 font-medium">
                      <UserX className="h-4 w-4 text-rose-600" />
                      Owner Profile
                    </span>
                    <span className="font-mono font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                      Permanently Deleted
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-700">
                    <span className="flex items-center gap-2 font-medium">
                      <Smartphone className="h-4 w-4 text-amber-600" />
                      Assigned Tills ({impact?.tillsUnassigned || 0})
                    </span>
                    <span className="font-mono font-bold text-slate-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      Unassigned (Preserved)
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-700">
                    <span className="flex items-center gap-2 font-medium">
                      <Signal className="h-4 w-4 text-indigo-600" />
                      Base ({impact?.baseWakalasUnassigned || 0}) / IOP ({impact?.iopWakalasRemoved || 0}) Wakalas
                    </span>
                    <span className="font-mono font-bold text-slate-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      Unassigned (Preserved)
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-700">
                    <span className="flex items-center gap-2 font-medium">
                      <Lock className="h-4 w-4 text-slate-600" />
                      Login Account
                    </span>
                    <span className="font-mono font-bold text-slate-700">
                      {impact?.loginAccountDeleted ? (
                        <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          {impact.loginEmail || 'Account Deleted'}
                        </span>
                      ) : (
                        <span className="text-slate-500 italic">None linked</span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-700">
                    <span className="flex items-center gap-2 font-medium">
                      <Camera className="h-4 w-4 text-slate-600" />
                      Uploaded Photos
                    </span>
                    <span className="font-mono font-bold text-slate-700">
                      {impact?.photosDeleted || 0} photos deleted
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Type to confirm pattern */}
            <div className="space-y-2 pt-1 border-t border-slate-100">
              <label className="block text-xs font-bold text-slate-700">
                To confirm, type <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-rose-700 select-all">{targetName}</span> in the field below:
              </label>
              <input
                type="text"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder={`Type "${targetName}" to confirm`}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl font-mono text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={!isNameMatched || isDeleting}
              className={`inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition-all cursor-pointer ${
                isNameMatched && !isDeleting
                  ? 'bg-rose-600 hover:bg-rose-700 ring-2 ring-rose-500/20'
                  : 'bg-rose-300 cursor-not-allowed opacity-60'
              }`}
            >
              <Trash2 className="h-4 w-4" />
              {isDeleting ? 'Deleting Owner...' : 'Permanently Delete Owner'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
