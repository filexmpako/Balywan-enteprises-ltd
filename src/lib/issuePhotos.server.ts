import type { SupabaseClient } from '@supabase/supabase-js';
import { ensurePrivateBucket, parseImageDataUrl } from './storageImages.server';

/**
 * Photos on wakala issues, kept in a private bucket under
 * `<issueId>/<messageKey>/<file>` — messageKey is `issue` for the original
 * report or the reply's message id. Access follows the issue itself: whoever
 * can read the issue under RLS (its owner, or staff) can add and view photos.
 */
type DB = SupabaseClient<any, any, any>;

const ISSUE_PHOTO_BUCKET = 'issue-photos';
const MAX_PHOTOS_PER_MESSAGE = 3;
const SAFE_KEY = /^[A-Za-z0-9_-]{1,64}$/;

export class IssuePhotoError extends Error {}

async function assertCanSeeIssue(userDb: DB, issueId: string): Promise<void> {
  if (!SAFE_KEY.test(issueId)) throw new IssuePhotoError('Unknown issue.');
  const { data, error } = await userDb.from('wakala_issues').select('id').eq('id', issueId).maybeSingle();
  if (error) throw new Error(`wakala_issues read: ${error.message}`);
  if (!data) throw new IssuePhotoError('You cannot access this issue.');
}

export async function storeIssuePhoto(
  userDb: DB,
  adminDb: DB,
  issueId: string,
  messageKey: string,
  dataUrl: string,
): Promise<void> {
  await assertCanSeeIssue(userDb, issueId);
  if (!SAFE_KEY.test(messageKey)) throw new IssuePhotoError('Unknown message.');
  const image = parseImageDataUrl(dataUrl);
  await ensurePrivateBucket(adminDb, ISSUE_PHOTO_BUCKET);
  const folder = `${issueId}/${messageKey}`;
  const { data: existing } = await adminDb.storage.from(ISSUE_PHOTO_BUCKET).list(folder, { limit: 100 });
  if ((existing?.length || 0) >= MAX_PHOTOS_PER_MESSAGE) {
    throw new IssuePhotoError(`Up to ${MAX_PHOTOS_PER_MESSAGE} photos per message.`);
  }
  const { error } = await adminDb.storage
    .from(ISSUE_PHOTO_BUCKET)
    .upload(`${folder}/${Date.now()}-${crypto.randomUUID()}.${image.ext}`, image.bytes, {
      contentType: image.contentType,
      upsert: false,
    });
  if (error) throw new Error(`issue photo upload: ${error.message}`);
}

/** Short-lived links to every photo on an issue, grouped by message key. */
export async function listIssuePhotoLinks(userDb: DB, adminDb: DB, issueId: string): Promise<Record<string, string[]>> {
  await assertCanSeeIssue(userDb, issueId);
  const bucket = adminDb.storage.from(ISSUE_PHOTO_BUCKET);
  const { data: folders, error } = await bucket.list(issueId, { limit: 1000 });
  if (error) {
    if (/not found/i.test(error.message)) return {};
    throw new Error(`issue photos list: ${error.message}`);
  }
  const out: Record<string, string[]> = {};
  for (const folder of folders || []) {
    if (!SAFE_KEY.test(folder.name)) continue;
    const { data: files } = await bucket.list(`${issueId}/${folder.name}`, { limit: 100, sortBy: { column: 'name', order: 'asc' } });
    const paths = (files || []).filter((f) => f.id).map((f) => `${issueId}/${folder.name}/${f.name}`);
    if (!paths.length) continue;
    const { data: signed } = await bucket.createSignedUrls(paths, 600);
    out[folder.name] = (signed || []).map((s) => s.signedUrl).filter(Boolean) as string[];
  }
  return out;
}
