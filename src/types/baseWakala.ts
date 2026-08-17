export interface BaseWakalaEntity {
  id: string;
  wakalaName: string;
  wakalaCode: string;     // Unique terminal code (Primary Key match)
  msisdn: string;         // Standardized via normalizeMsisdn()
  ownerId: string;
  ownerName: string;
  siteWard?: string;
  district?: string;
  region?: string;
  altMsisdn?: string;     // Standardized via normalizeMsisdn()
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
  location?: { lat: number; lng: number; accuracy?: number; address?: string; capturedAt?: string };

  // Optional legacy compatibility fields
  code?: string;
  fullName?: string;
  alternateNumber?: string;
}

export type DeltaConflictType = 
  | 'EXACT_MATCH'           // No change needed
  | 'NEW_TERMINAL'          // Completely new Wakala terminal
  | 'DELTA_OWNER_REASSIGN'  // wakalaCode/msisdn exists but owner changed
  | 'DATA_UPDATED';         // Metadata updated (ward/district/etc.)

export interface BaseWakalaReconciliationStage {
  id: string;
  rawRecord: Partial<BaseWakalaEntity>;
  conflictType: DeltaConflictType;
  existingRecord?: BaseWakalaEntity;
  selectedAction: 'ACCEPT' | 'OVERWRITE' | 'IGNORE';
}
