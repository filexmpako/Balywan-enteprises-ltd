# KPI 1 IOP = wakalas served by our owners but not in our base

## Verified current behaviour
In the KPI engine, an owner's IOP volume is the higher of two numbers:
- Daily MGT IOP: our owners' tills paid a wakala number not in the Base Wakala Index (the rule you want).
- Weekly report IOP column: value for wakalas that are in our base, serviced by outside networks (the wrong measure for KPI 1).

When the weekly figure is higher, it replaces the correct one, and the Source column says "weekly".

## Change
- KPI 1 IOP for each owner will come only from Daily MGT: money our owners' tills sent to wakalas outside our base, dated in the selected month.
- The weekly report's IOP column will no longer feed KPI 1 IOP. It stays in the IOP settlement / variance cards, where it is compared against Daily MGT.
- Base volume rules stay the same (higher of Daily MGT and weekly report).
- If the month's Monthly report exists, it still overrides everything, as it does now.
- The Source label for IOP will read "Daily MGT".

## Technical details
- `src/utils/kpiEngine.ts` `calculateMtdVolumes`: set `iopVolume = dailyIop`, `iopSource = 'daily'` in the non-monthly branch; stop reading `b.iopValue` into the report map for the weekly case.
- Add a node:test case to the existing kpiEngine tests: an owner with daily IOP 100 and weekly IOP 500 gets KPI 1 IOP = 100.
- Remove any now-unused code left behind.
