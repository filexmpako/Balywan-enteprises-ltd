export type ClassificationBucket = 
  | 'SA_INTERNAL' 
  | 'BASE' 
  | 'IOP';

export interface ClassificationAuditRecord {
  id: string;
  transactionId: string;
  timestamp: string;
  rawMsisdn: string;
  normalizedMsisdn: string;
  amount: number; // Raw serviced value
  ownerId: string;
  matchedEntityId?: string;
  matchedEntityType?: 'SA_TILL' | 'BASE_WAKALA' | 'NONE';
  classificationBucket: ClassificationBucket;
  ruleTriggered: string; // E.g., "Matched SA Till (Owner Match)"
}
