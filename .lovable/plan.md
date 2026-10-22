# Owner profile: KPI Overview matching the sheet layout

Replace the KPI overview at the top of each owner's profile with three compact tables and a weighted summary, laid out like the sample sheet. Figures come from this owner's data for the selected month.

## KPI 1 - SA Value Servicing
Columns: Month, SA Name, SA Base, Monthly Target, Per Day Target, Served Value, Achievement %.
- SA Base = owner's wakala count
- Per Day Target = monthly target / 24 (same as today)
- Achievement = served value / monthly target

## KPI 2 - Agent Servicing and Priority
Two rows, Normal Wakala and Priority, plus a total row.
Columns: Month, Type, SA Base, Target Served, Served, Unserved, Achievement %.
- Target Served = 80% of base (sample: 191 of 239, 23 of 29)
- Row share: Normal = served/target x 70%, Priority = served/target x 30% (sample: 53% + 6% = 60%)
- Served/unserved use the existing weekly servicing status (Weekly wins, Daily fallback)

## KPI 3 - Agent Activity
Columns: Month, SA Name, SA Base, Active Target, Active, Inactive, KPI 3 %.
- Active Target = 90% of base (sample: 241 of 268)
- Active/inactive from the latest weekly report in the month, using the configured activity rule

## Summary
| KPI | Actual | Weight | Performance |
|---|---|---|---|
| KPI 1 | % | 40% | actual x 40% |
| KPI 2 | % | 50% | actual x 50% |
| KPI 3 | % | 10% | actual x 10% |

Bottom bar: overall performance = sum of the three (sample 53%). Weight cells colored green / amber / red by how well that KPI is doing. Actuals capped at 100% when weighting.

## Style
Clean table cards with the app's navy header rows, light row stripes, green achievement cells. Scrolls sideways on phones.

## Technical
- New `OwnerKpiOverview.tsx` component, rendered in `OwnerDetailsView` in place of the current KPI overview cards; reuses `ownerMtdData`, portfolio (priority vs normal), and weekly series already computed there.
- Pure calculator `utils/ownerKpiScore.ts` with tests for the sample numbers (40%, 53%+6%=60%, 74%, overall 53%).
- Remove the replaced overview cards and any now-unused code.

## Assumptions to confirm
- Weights 40/50/10, 80% served target, 90% active target, and the 70/30 normal/priority split are inferred from the sample; tell me if they differ or should be editable in Settings.
