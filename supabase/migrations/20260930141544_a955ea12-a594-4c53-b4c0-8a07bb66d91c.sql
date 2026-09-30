-- F13: add real FK constraints for columns that are FK-shaped but currently
-- unenforced, for the cases where the reference is reliable. Manager-id
-- columns (float_requests.confirmed_by_manager_id/rejected_by_manager_id,
-- loan_records.approved_by_manager_id/marked_paid_by_manager_id) are
-- deliberately excluded: verified in src/components/FloatManagerView.tsx
-- that these fall back to the acting user's email or the literal string
-- 'float_manager' when no personnel record is selected, so they are not
-- reliably a personnel_id and a hard FK there would reject legitimate
-- writes. daily_transaction_records.wakala_id is also excluded: verified
-- it is always written null today (no wakalas row it could reference).
--
-- Null out any existing orphaned references first so the ADD CONSTRAINT
-- below cannot fail on data already in the table — same defensive pattern
-- already used in src/lib/wakalaStatus.functions.ts for owner_id.
UPDATE public.float_requests fr
SET loan_id = NULL
WHERE fr.loan_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.loan_records lr WHERE lr.id = fr.loan_id);

UPDATE public.daily_transaction_records dtr
SET attributed_owner_id = NULL
WHERE dtr.attributed_owner_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.owners o WHERE o.owner_id = dtr.attributed_owner_id);

UPDATE public.classification_audit_records car
SET owner_id = NULL
WHERE car.owner_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.owners o WHERE o.owner_id = car.owner_id);

ALTER TABLE public.float_requests
  ADD CONSTRAINT float_requests_loan_id_fkey
  FOREIGN KEY (loan_id) REFERENCES public.loan_records(id) ON DELETE SET NULL;

ALTER TABLE public.daily_transaction_records
  ADD CONSTRAINT daily_transaction_records_attributed_owner_id_fkey
  FOREIGN KEY (attributed_owner_id) REFERENCES public.owners(owner_id) ON DELETE SET NULL;

ALTER TABLE public.classification_audit_records
  ADD CONSTRAINT classification_audit_records_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES public.owners(owner_id) ON DELETE SET NULL;

-- F16: file_upload_archives is queried by file_name (src/lib/uploads.server.ts)
-- with no supporting index — only file_hash (unique, partial) and
-- (status, target_date)/report_type were indexed.
CREATE INDEX IF NOT EXISTS idx_file_upload_archives_filename
  ON public.file_upload_archives (file_name);