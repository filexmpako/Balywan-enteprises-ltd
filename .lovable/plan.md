# Agent Management, Category Thresholds & Period-Correct Reporting

An agent = one wakala/till. Its owner is its team. Transaction counts and values come from the Daily MGT uploads. Categories are auto-assigned from the uploaded file on import and can be overridden by the admin.

Note on data: there are currently 1,704 wakala records but zero daily transaction rows in the database, so the new counts and Active/Inactive results will show zeros until Daily MGT files are uploaded. Nothing else blocks the build.

## Priority 1

### Agent categories and thresholds (configuration)
- New Settings section "Agent Categories": create/edit/delete a category with a name, required transaction count, required transaction value, and whether both or either must be met to count as Active.
- A default category is seeded so every agent always has a threshold.
- On upload, each agent is placed in a category from its file column (region/zone label) if a matching category exists, otherwise the default. Admin can change an agent's category individually or for a selected group.

### Active / Inactive logic
- One shared rule used everywhere: for the chosen period, total the agent's transactions and value from the daily records, compare against that agent's category requirement, and mark ACTIVE or INACTIVE.
- Status is always computed for the period being viewed, never copied from "today".

### Agent Management page
- Sortable, searchable table: agent name, agent number/ID, phone, category, team (owner), status badge, transaction count, transaction value, joining/registration date, region/district.
- Search by name, number or phone. Filters for category, team, status and period.
- Summary strip above the table: total / active / inactive agents, total transactions, total value.

### Agent profile
- Opens on clicking any agent row: identity details, category, team, current status, and location/contact info.
- Transaction summary card: count, value, target required, progress against target.
- Weekly and monthly performance blocks plus a status-history table.
- Action buttons: call, SMS, WhatsApp, view transactions, view report.

### Transaction summary and period picker
- Shared period selector: today, this week, this month, previous week, previous month, custom range.
- Every agent screen and report respects the selected period.

## Priority 2

### Weekly agent report
- One row per agent: agent, category, transactions, value, target, status.
- Filters: week, category, team, agent, status. Summary cards on top; table below; export/print.

### Monthly agent report
- Totals: total agents, active, inactive, transaction count, value.
- Breakdowns by category, by team, and per agent, computed from that month's actual transactions.

### Month-end status and status history
- At month end (and on demand for past months) the system stores each agent's transaction count, value, category requirement and resulting status for that month.
- Historical reports read those stored rows, so an agent who becomes active later does not turn active in an older month's report.
- Where a past month has no stored row yet, it is back-filled once from the stored daily transactions and then frozen.

### Team performance
- Per-owner roll-up: agents, active/inactive split, transactions, value, attainment, and movement versus the previous period.

## Deferred to a later pass (Priority 3)
Clickable dashboard cards that drill into these new lists, the dedicated IOP report, and broader export/print polish. Say the word and I fold them in.

## Technical notes
- New tables: `agent_categories` (name, required txns, required value, rule mode), `agent_category_assignments` (wakala msisdn → category, source: auto/manual), `agent_status_history` (msisdn, period, period type, txns, value, required values, status, frozen_at). Staff-write / staff-read policies plus grants, matching existing tables.
- New server functions in `src/lib/agents.functions.ts` for the agent list, agent detail, weekly/monthly report aggregation and month-end freezing, aggregating `daily_transaction_records` by `branch_msisdn` and `reporting_date` and joining `base_wakala_index` + `owners`.
- A single shared status resolver (`src/utils/agentStatus.ts`) used by list, profile, reports and the freeze job — the existing Daily MGT and weekly servicing rules stay untouched.
- New admin views: `AgentManagementView`, `AgentProfileView`, `AgentWeeklyReportView`, `AgentMonthlyReportView`, plus a categories panel in `SettingsView`, wired into the existing sidebar and hash routes.
