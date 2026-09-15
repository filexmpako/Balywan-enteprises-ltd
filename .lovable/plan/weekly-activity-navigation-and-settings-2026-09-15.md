# Weekly Activity, Navigation, and Settings

## Build
- Correct weekly upload normalization so transaction count and servicing amount survive header variations and duplicate rows.
- Classify a Wakala as active only when both configured thresholds are met: transaction count and amount.
- Recompute weekly summaries and saved historical statuses with the same shared rule, without changing Daily MGT logic.
- Add separate transaction and amount controls to Settings, with a clear live rule summary and validation.
- Make the desktop navigation collapse to an icon rail while retaining the existing mobile drawer behavior.
- Refresh the Settings page into a cleaner, organized administration workspace using existing brand styles.

## Technical details
- Extend the existing activity-rule shape compatibly so previously saved settings receive a safe default amount threshold.
- Expand weekly spreadsheet aliases for transaction and amount fields and aggregate them per normalized MSISDN.
- Keep served/unserved classification independent and sourced only from `servicing_status`.
- Preserve all current routes, permissions, data, and dashboard calculations outside weekly active/inactive status.

## Verification
- Run focused rule tests/type checks.
- Verify Settings, collapsed/expanded navigation, weekly cards, and owner profile statuses in desktop and mobile previews.
