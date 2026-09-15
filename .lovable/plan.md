# Dashboard, Weekly Reports, Wakala Status & Owner Issues

## 1. KPI cards instead of the dropdown

Replace the KPI Performance Summary dropdown/list with a row of status cards, one per KPI:

- KPI 1 — Servicing value vs monthly target
- KPI 2 — Served wakala vs target
- KPI 3 — Active vs inactive wakalas
- KPI 4 — Products

Each card shows: KPI name, target, achieved, percentage, and a colour status badge (Green 90%+, Blue 70%+, Yellow 60%+, Red below). All four are computed and recorded on daily and weekly data as it arrives — none of them waits for a monthly report. Clicking a card opens the matching detail page (targets / base wakala / audit).

## 2. Transaction summary of the day

New summary block on the dashboard for the selected day: number of transactions, total value, cash-in, cash-out, commission, active tills, plus top movements. The same block is reused on the audit page, filtered to the audit's period, so both read from one component and one calculation.

## 3. Weekly report parsing and appending

- Each uploaded week is stored as its own week and appended to the history; re-uploading a week replaces only that week.
- Weekly totals accumulate across the month so that by the last week of the month the accumulated figures match the shape of the monthly report: total volume, base volume, IOP volume, transactions, active/inactive, served/unserved.
- Add per-week **updated volume** and **IOP volume** columns to the weekly progression table and chart, with a running month-to-date total.
- Weekly numbers feed KPI 1–4 and each owner's dashboard for the same period.

## 4. Penalty

Month-end penalty charged by the telco on the money the bank serves to wakalas, at a rate of 0.05 (rate stored in settings, not hardcoded). Shown on the dashboard as an accruing month-to-date figure and per owner, calculated from the served volume for the month.

## 5. Base Wakala — real Active/Inactive status

- The Active/Inactive column stops being a manual toggle and reflects the system rule: a wakala is **Active when its combined cash-in + cash-out transaction count for the week reaches the threshold (default 25)**, otherwise Inactive. Status refreshes every time a weekly report is uploaded.
- Wakalas with no data for the week are shown as "No data", never silently Inactive.
- **Status history:** every weekly evaluation is recorded, so each wakala's row can show its status for the previous month and the two months before that (and a full history view). Historical reports use the status that applied in the reported period, not today's status.
- Filters gain "Active / Inactive / No data" driven by the computed status.

## 6. Manual rule configuration

A settings panel (admin only) for the counting rule:

- Transaction threshold for Active (default 25)
- Whether cash-in and cash-out are combined or counted separately
- Evaluation window (weekly)
- Penalty rate (default 0.05)

Changes apply to future evaluations and can be re-run over stored weeks; every change is written to the audit log.

## 7. Owner dashboard

- Each owner sees their wakalas with the same real Active/Inactive status and the week it was measured, plus their served/unserved and volume figures.
- **Report an issue:** an owner can send a message to the admin about a specific problem wakala (pick wakala, category, description). Admin gets it in an inbox with status Open / In progress / Resolved, can reply, and the owner sees the reply and resolution on their own dashboard. In-app only, no email.

## Technical notes

- New table `wakala_status_history` (msisdn, owner_id, period/week, transactions_ci, transactions_co, is_active, evaluated_at) with owner-scoped read policies and staff write; written by weekly ingestion.
- New table `wakala_issues` (+ `wakala_issue_messages`) for the owner→admin thread; RLS so an owner sees only their own threads, staff see all.
- Rule + penalty settings stored in the existing `app_settings` table under a single `activity_rules` key, read through one helper so dashboard, weekly engine and base wakala all use the same values.
- Activity rule implemented as one shared function used by the weekly engine, base wakala view and KPI 3 — Daily MGT's existing served/unserved rule and the `servicing_status` column reading stay unchanged.
- Weekly accumulation extends the existing weekly engine/history utilities; daily figures come from the existing daily transaction records.
- KPI cards, the day transaction summary and the penalty figure are presentation layers over these shared calculations.
