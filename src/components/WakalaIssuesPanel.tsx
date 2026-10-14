import { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Send, Plus, CheckCircle2, Clock, AlertCircle, X, Loader2, Camera } from 'lucide-react';
import {
  createWakalaIssue,
  listWakalaIssues,
  listIssueMessages,
  postIssueMessage,
  updateIssueStatus,
  uploadIssuePhoto,
  listIssuePhotos,
  type WakalaIssue,
} from '../lib/issues.functions';

const MAX_PHOTOS = 3;

/** Shrinks a phone photo (max 1600px, JPEG) so it uploads quickly on mobile data. */
function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the photo.'));
    reader.onload = () => {
      const src = String(reader.result || '');
      const img = new Image();
      img.onerror = () => resolve(src); // a format the browser cannot draw: send as is
      img.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(src);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

/** Up to MAX_PHOTOS photos chosen before sending, with remove buttons. */
function PhotoPicker({ photos, onChange, disabled }: { photos: string[]; onChange: (p: string[]) => void; disabled?: boolean }) {
  const add = async (files: FileList | null) => {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, room);
    const shrunk = await Promise.all(picked.map(shrinkImage));
    onChange([...photos, ...shrunk]);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {photos.map((p, i) => (
        <div key={i} className="relative">
          <img src={p} alt="" className="h-14 w-14 rounded-lg border border-slate-200 object-cover" />
          <button
            type="button"
            onClick={() => onChange(photos.filter((_, j) => j !== i))}
            className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-0.5 text-rose-600 shadow cursor-pointer"
            aria-label="Remove photo"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      {photos.length < MAX_PHOTOS && (
        <label className={`inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-[11px] font-bold text-slate-600 ${disabled ? 'opacity-50' : 'cursor-pointer hover:bg-slate-50'}`}>
          <Camera className="h-3.5 w-3.5" />
          {photos.length ? 'Add photo' : `Attach photos (up to ${MAX_PHOTOS})`}
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={disabled}
            className="hidden"
            onChange={e => {
              void add(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      )}
    </div>
  );
}

function PhotoStrip({ urls }: { urls?: string[] }) {
  if (!urls?.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-2">
      {urls.map(u => (
        <a key={u} href={u} target="_blank" rel="noreferrer">
          <img src={u} alt="Attached photo" className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
        </a>
      ))}
    </div>
  );
}

interface Props {
  /** 'owner' shows the report form and only that owner's issues. */
  mode: 'owner' | 'admin';
  ownerId?: string;
  ownerName?: string;
  senderName: string;
  /** Wakala list the owner can pick from: [{ msisdn, name }]. */
  wakalas?: Array<{ msisdn: string; name?: string }>;
}

const CATEGORIES = ['Float shortage', 'System/technical', 'Terminal not working', 'Fraud concern', 'Training', 'Other'];

const STATUS_STYLES: Record<string, string> = {
  Open: 'bg-amber-50 text-amber-700 border-amber-200',
  'In Progress': 'bg-blue-50 text-blue-700 border-blue-200',
  Resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export default function WakalaIssuesPanel({ mode, ownerId, ownerName, senderName, wakalas = [] }: Props) {
  const [issues, setIssues] = useState<WakalaIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [formPhotos, setFormPhotos] = useState<string[]>([]);
  const [replyPhotos, setReplyPhotos] = useState<string[]>([]);
  // Photo links of the open issue, by message key ('issue' = the report itself).
  const [photosByKey, setPhotosByKey] = useState<Record<string, string[]>>({});

  /** Uploads photos to an issue message; returns how many failed. */
  const uploadPhotos = async (issueId: string, messageKey: string, photos: string[]) => {
    let failed = 0;
    for (const dataUrl of photos) {
      try {
        await uploadIssuePhoto({ data: { issueId, messageKey, dataUrl } });
      } catch {
        failed += 1;
      }
    }
    return failed;
  };

  const [form, setForm] = useState({
    wakalaMsisdn: '',
    wakalaName: '',
    category: CATEGORIES[0],
    subject: '',
    description: '',
    priority: 'Normal',
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listWakalaIssues({ data: mode === 'owner' && ownerId ? { ownerId } : {} });
      setIssues(res.issues || []);
    } catch (err: any) {
      setError(err?.message || 'Could not load messages.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [mode, ownerId]);

  const openMessages = async (issueId: string) => {
    setOpenIssueId(issueId);
    setMessages([]);
    setPhotosByKey({});
    if (issueId !== openIssueId) setReplyPhotos([]);
    try {
      const [res, photos] = await Promise.all([
        listIssueMessages({ data: { issueId } }),
        listIssuePhotos({ data: { issueId } }).catch(() => ({ photos: {} as Record<string, string[]> })),
      ]);
      setMessages(res.messages || []);
      setPhotosByKey(photos.photos || {});
    } catch (err: any) {
      setError(err?.message || 'Could not load the conversation.');
    }
  };

  const submitIssue = async () => {
    if (!ownerId) return;
    if (!form.wakalaMsisdn.trim() || !form.subject.trim() || !form.description.trim()) {
      setError('Wakala, subject and description are all required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await createWakalaIssue({
        data: {
          ownerId,
          ownerName: ownerName || senderName,
          wakalaMsisdn: form.wakalaMsisdn.trim(),
          wakalaName: form.wakalaName || undefined,
          category: form.category,
          subject: form.subject.trim(),
          description: form.description.trim(),
          priority: form.priority,
        },
      });
      const failed = formPhotos.length ? await uploadPhotos(created.issue.id, 'issue', formPhotos) : 0;
      if (failed) setError(`The issue was sent, but ${failed} photo(s) could not be uploaded. Open the conversation to add them again.`);
      setShowForm(false);
      setFormPhotos([]);
      setForm({ wakalaMsisdn: '', wakalaName: '', category: CATEGORIES[0], subject: '', description: '', priority: 'Normal' });
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not send the message.');
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!openIssueId || (!reply.trim() && replyPhotos.length === 0)) return;
    setBusy(true);
    try {
      const sent = await postIssueMessage({
        data: {
          issueId: openIssueId,
          body: reply.trim() || 'Photo attached',
          senderName,
          senderRole: mode === 'admin' ? 'admin' : 'owner',
        },
      });
      const failed = replyPhotos.length && sent.id ? await uploadPhotos(openIssueId, sent.id, replyPhotos) : 0;
      if (failed) setError(`The reply was sent, but ${failed} photo(s) could not be uploaded.`);
      setReply('');
      setReplyPhotos([]);
      await openMessages(openIssueId);
    } catch (err: any) {
      setError(err?.message || 'Could not send the reply.');
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (issueId: string, status: string) => {
    setBusy(true);
    try {
      await updateIssueStatus({ data: { issueId, status } });
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not update the status.');
    } finally {
      setBusy(false);
    }
  };

  const visible = useMemo(
    () => (statusFilter === 'all' ? issues : issues.filter(i => i.status === statusFilter)),
    [issues, statusFilter],
  );

  const counts = useMemo(
    () => ({
      open: issues.filter(i => i.status === 'Open').length,
      progress: issues.filter(i => i.status === 'In Progress').length,
      resolved: issues.filter(i => i.status === 'Resolved').length,
    }),
    [issues],
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-brand-primary" />
          <h3 className="text-sm font-extrabold text-slate-900">
            {mode === 'admin' ? 'Wakala Issues Inbox' : 'Report a Wakala Issue to Admin'}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold px-2 py-1 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
            {counts.open} open
          </span>
          <span className="text-[10px] font-bold px-2 py-1 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
            {counts.progress} in progress
          </span>
          <span className="text-[10px] font-bold px-2 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
            {counts.resolved} resolved
          </span>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-xs rounded-xl border border-slate-200 px-2 py-1.5 bg-slate-50 font-semibold"
          >
            <option value="all">All</option>
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
          </select>
          {mode === 'owner' && (
            <button
              onClick={() => setShowForm(v => !v)}
              className="text-xs font-bold rounded-xl bg-brand-primary text-white px-3 py-1.5 flex items-center gap-1 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> New
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5 mb-3 flex items-center gap-1.5">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {showForm && mode === 'owner' && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 mb-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Wakala</label>
              {wakalas.length > 0 ? (
                <select
                  value={form.wakalaMsisdn}
                  onChange={e => {
                    const hit = wakalas.find(w => w.msisdn === e.target.value);
                    setForm(f => ({ ...f, wakalaMsisdn: e.target.value, wakalaName: hit?.name || '' }));
                  }}
                  className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 bg-white"
                >
                  <option value="">Select a wakala…</option>
                  {wakalas.map(w => (
                    <option key={w.msisdn} value={w.msisdn}>
                      {w.name ? `${w.name} — ${w.msisdn}` : w.msisdn}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={form.wakalaMsisdn}
                  onChange={e => setForm(f => ({ ...f, wakalaMsisdn: e.target.value }))}
                  placeholder="Wakala phone number"
                  className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 bg-white"
                />
              )}
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Category</label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 bg-white"
              >
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Subject</label>
              <input
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="Short summary"
                className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 bg-white"
              >
                <option value="Low">Low</option>
                <option value="Normal">Normal</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">What is the problem?</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 bg-white"
            />
          </div>
          <PhotoPicker photos={formPhotos} onChange={setFormPhotos} disabled={busy} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 cursor-pointer">
              Cancel
            </button>
            <button
              onClick={submitIssue}
              disabled={busy}
              className="text-xs font-bold px-3 py-2 rounded-xl bg-brand-primary text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send to Admin
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-xs text-slate-500 py-6 text-center">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="text-xs text-slate-500 py-6 text-center">No issues yet.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {visible.map(issue => (
            <div key={issue.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-extrabold text-slate-900">{issue.subject}</p>
                  <p className="text-[11px] text-slate-500">
                    {issue.wakala_name ? `${issue.wakala_name} · ` : ''}{issue.wakala_msisdn} · {issue.category}
                    {mode === 'admin' ? ` · ${issue.owner_name}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${STATUS_STYLES[issue.status] || ''}`}>
                    {issue.status}
                  </span>
                  {mode === 'admin' && issue.status !== 'In Progress' && issue.status !== 'Resolved' && (
                    <button onClick={() => changeStatus(issue.id, 'In Progress')} className="text-[10px] font-bold text-blue-700 cursor-pointer flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Start
                    </button>
                  )}
                  {mode === 'admin' && issue.status !== 'Resolved' && (
                    <button onClick={() => changeStatus(issue.id, 'Resolved')} className="text-[10px] font-bold text-emerald-700 cursor-pointer flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Resolve
                    </button>
                  )}
                  <button
                    onClick={() => (openIssueId === issue.id ? setOpenIssueId(null) : openMessages(issue.id))}
                    className="text-[10px] font-bold text-slate-600 cursor-pointer"
                  >
                    {openIssueId === issue.id ? 'Close' : 'Conversation'}
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-600 mt-1">{issue.description}</p>

              {openIssueId === issue.id && <PhotoStrip urls={photosByKey.issue} />}

              {openIssueId === issue.id && (
                <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 p-3">
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {messages.length === 0 ? (
                      <p className="text-[11px] text-slate-500">No replies yet.</p>
                    ) : (
                      messages.map(m => (
                        <div key={m.id} className="text-[11px]">
                          <span className="font-bold text-slate-800">{m.sender_name}</span>
                          <span className="text-slate-400"> · {new Date(m.created_at).toLocaleString()}</span>
                          <p className="text-slate-700">{m.body}</p>
                          <PhotoStrip urls={photosByKey[String(m.id)]} />
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <input
                      value={reply}
                      onChange={e => setReply(e.target.value)}
                      placeholder="Write a reply…"
                      className="flex-1 text-xs rounded-xl border border-slate-200 px-3 py-2 bg-white"
                    />
                    <button
                      onClick={sendReply}
                      disabled={busy || (!reply.trim() && replyPhotos.length === 0)}
                      className="text-xs font-bold px-3 py-2 rounded-xl bg-brand-primary text-white cursor-pointer disabled:opacity-60"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-2">
                    <PhotoPicker photos={replyPhotos} onChange={setReplyPhotos} disabled={busy} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
