import { classifyServicingRows, summarizeClassification, ClassifiedRow } from '../utils/classification';
import { ClassificationAuditRecord, ClassificationBucket } from '../types/classificationAudit';

export * from '../utils/mappingEngine';
export * from '../utils/classification';

/**
 * Transaction Classification Engine Service (Phase 1)
 * Evaluates daily transactions against registered SA Tills and Base Wakala Index
 * following the strict 3-tier lookup chain.
 */
export {
  classifyServicingRows,
  summarizeClassification
};
export type { ClassifiedRow, ClassificationAuditRecord, ClassificationBucket };
