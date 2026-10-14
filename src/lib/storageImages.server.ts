import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Photos kept in private Storage buckets (float receipts, issue photos).
 * Buckets are created by the server on first use; nothing is public — files
 * are only ever handed out as short-lived signed links after an access check.
 */
type DB = SupabaseClient<any, any, any>;

export class ImageUploadError extends Error {}

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function parseImageDataUrl(dataUrl: string): { bytes: Uint8Array; contentType: string; ext: string } {
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i.exec(String(dataUrl || ''));
  const contentType = match ? match[1].toLowerCase() : '';
  const ext = IMAGE_TYPES[contentType];
  if (!match || !ext) throw new ImageUploadError('The file must be a photo (JPG, PNG, WEBP, GIF or HEIC).');
  const binary = atob(match[2]);
  if (binary.length > MAX_IMAGE_BYTES) throw new ImageUploadError('The photo is too large (max 8 MB).');
  return { bytes: Uint8Array.from(binary, (c) => c.charCodeAt(0)), contentType, ext };
}

export async function ensurePrivateBucket(adminDb: DB, bucket: string): Promise<void> {
  const { data } = await adminDb.storage.getBucket(bucket);
  if (data) return;
  const { error } = await adminDb.storage.createBucket(bucket, { public: false });
  if (error && !/already exists/i.test(error.message)) throw new Error(`${bucket} bucket: ${error.message}`);
}
