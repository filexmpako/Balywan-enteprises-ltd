-- Enable Supabase Realtime on daily_transaction_records so a dashboard left
-- open on one device sees a Daily MGT upload made from another device
-- without needing to sign in again (see refreshDailyTransactions/
-- subscribeToDailyTransactions in src/lib/cloudSync.ts).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'daily_transaction_records'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_transaction_records;
  END IF;
END $$;
