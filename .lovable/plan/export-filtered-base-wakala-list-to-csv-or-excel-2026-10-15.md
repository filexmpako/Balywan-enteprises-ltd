# Export filtered Base Wakala list to CSV or Excel

## What you'll get

On the Base Wakala Index page, next to the search and filter dropdowns, a new **Export** button with two choices: **CSV** and **Excel (.xlsx)**. Whichever filters are active at that moment (search text, status, owner, district) decide what gets exported — the file contains exactly the rows you see, all of them, not just the current page. This makes it easy to pull out e.g. "all INACTIVE terminals in Ilala assigned to one owner" for follow-ups.

## How it works

- The export reads the same filtered list the table already shows, so what you see is what you download.
- Each row includes: Wakala Code, Terminal Name, MSISDN, Alt MSISDN, Owner (matched name or Unassigned/Unmatched), Ward, District, Region, live Status (Active / Inactive / No data), and the recent monthly status history.
- The file is generated in the browser and downloads straight to the phone or computer — no server work, no extra data charges beyond the click.
- File name includes the date and active filters, e.g. `base-wakala-inactive-ilala-2026-10-15.csv`.
- The button shows the row count ("Export 248 rows") so you know what you're getting before clicking.

## Technical details

- Single file change: `src/components/BaseWakalaIndexView.tsx` — add an Export dropdown button in the filter toolbar, plus a small `buildExportRows()` helper mapping `filteredItems` to flat export rows.
- CSV: built with a plain string builder (quotes/commas escaped), downloaded via a Blob — no new dependency.
- Excel: `exceljs` package (added via bun), imported dynamically so it only loads when someone clicks Excel export. One worksheet, bold header row, frozen top row, auto column widths.
- Download uses the standard anchor + object URL pattern; works on Android and desktop. On iPhones the file opens in the share sheet so it can be saved to Files.
- No backend, database, or permission changes. Admin-only page, so no owner-facing impact.

## Verification

- Type-check passes.
- Playwright check on the preview: apply a filter, click Export CSV, confirm the downloaded file's row count matches the filtered count shown on screen.
