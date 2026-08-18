# Weekly KPI on the Admin Dashboard, Owner Sync, and Real KPI1 Percentages

## What's true today (verified)

- Weekly KPI workbooks are parsed on upload and stored: rows in IndexedDB (`weeklyServicingRows`) and summaries in `weeklyKpiHistory`.
- The weekly served/unserved analysis exists only inside `KPIReportsView.tsx` (`computeWeeklyWakalaStats` / `loadWeeklyWakalaStats`, saved to `weeklyWakalaStatsHistory`). The Admin Dashboard never reads any weekly data — it only renders the monthly `dashboardKPIs` rows.
- The weekly analysis is company-wide only; there is no per-owner weekly split, so nothing reaches the Owner dashboard.
- Owner `performance` is seeded with literal constants — `92` in `OwnerSyncDashboard.tsx`, `88` in four places in `PeopleManagementView.tsx`, `85` in `OwnersView.tsx`, `100` in `UploadReportsView.tsx` — and those constants are what the owner cards and filters display until a Daily MGT recalculation happens to overwrite them.

## What will be built

### 1. Shared weekly analysis engine

Move the weekly served/unserved logic out of `KPIReportsView.tsx` into a reusable util (`src/utils/weeklyKpiEngine.ts`), keeping the exact same activity rules already in use (`Wakala_Status = 1`, served when `SA_Servicing_Txns > 6` or `SA_Servicing_Val > 600000`). The engine gains a per-owner breakdown, resolving each weekly row's MSISDN through the Base Wakala index and owner till registry — the same resolution path the monthly/daily engines use, so unassigned tills stay unassigned rather than being dropped.

Results are stored as an append-only history keyed by `reportingWeek` + upload timestamp: uploading a new week adds an entry; re-uploading the same week replaces only that week's entry. Nothing overwrites the running series.

### 2. Admin Dashboard weekly section

Add a "Weekly KPI Progression" block to `DashboardView.tsx`, below the existing monthly KPI Performance Summary:

- One row per uploaded week: served / unserved wakalas, active / inactive, weekly servicing value, and cumulative month-to-date value.
- Company-wide attainment against the live KPI1 target (same `getCompanyTotalKPI1Target` the monthly summary already uses), plus a pace indicator comparing cumulative progress to the expected week-by-week pace.
- Appends automatically as each new weekly report is uploaded (listens to the existing `servicing-rows-updated` event).

### 3. Owner dashboard sync

On the Owner dashboard (`OwnerDetailsView.tsx`), add a "Weekly Checkpoints" card driven by the per-owner weekly breakdown: served vs unserved wakalas for that owner each week, weekly servicing value, cumulative MTD, and attainment against that owner's KPI1 monthly target (from `calculateKPI1` / manual targets — never from the uploaded snapshot). Owners with no weekly rows show an explicit "No weekly data for this period" state rather than zeros.

### 4. Remove hardcoded KPI1 performance percentages

Replace every literal `performance` seed (92 / 88 / 85 / 100) with a derived value: an owner's performance is their live KPI1 achievement percentage (served volume ÷ monthly target) computed by the existing engine, and `null`/"Not yet tracked" when the owner has no target or no transactions yet. The owner cards, the Top-20% / Below-70% filters, and the high-performer stats then all read the same live number, and newly created owners start with no score instead of a fake one.

## Technical notes

- New file: `src/utils/weeklyKpiEngine.ts` (pure functions — parsing/classification stays where it is).
- Edits: `src/components/KPIReportsView.tsx` (delegates to the engine, unchanged UI), `src/components/DashboardView.tsx`, `src/components/OwnerDetailsView.tsx`, `src/components/OwnersView.tsx`, `src/components/PeopleManagementView.tsx`, `src/components/OwnerSyncDashboard.tsx`, `src/components/UploadReportsView.tsx`.
- Storage: `weeklyWakalaStatsHistory` gains a `byOwner` array per week; it is already a synced document key, so it persists to the backend alongside `weeklyKpiHistory` with existing RLS.
- No schema migration and no change to the upload/parse path.