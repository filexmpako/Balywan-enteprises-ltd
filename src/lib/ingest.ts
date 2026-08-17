import { classifyServicingRows, summarizeClassification } from '../utils/classification';
import { ingestServicingRows } from './hasidadi.functions';

/**
 * Authoritative ingestion path: classification + persistence happen on the
 * server against Postgres. If the device is offline we classify locally so
 * field work continues, and the rows stay queued in the offline cache.
 */
export async function ingestClassified(
  rows: any[],
  meta: { fileName?: string; reportType?: string; fileSize?: number; uploadedByName?: string } = {},
) {
  try {
    const result = await ingestServicingRows({ data: { rows, ...meta } });
    return { summary: result.summary, source: 'server' as const, uploadId: result.uploadId };
  } catch (err) {
    console.warn('[ingest] server ingestion unavailable, classifying locally', err);
    const registry = (key: string) => {
      try {
        return JSON.parse(localStorage.getItem(key) || '[]');
      } catch {
        return [];
      }
    };
    const classified = classifyServicingRows(
      rows,
      registry('saTillRegistry'),
      registry('baseWakalaIndex'),
      registry('tillsList'),
      registry('ownersList'),
    );
    return { summary: summarizeClassification(classified), source: 'offline' as const, uploadId: null };
  }
}
