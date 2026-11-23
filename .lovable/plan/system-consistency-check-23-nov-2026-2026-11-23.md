# System consistency check (23 Nov 2026)

## What I found in the data

| # | Problem | Size | Effect |
|---|---------|------|--------|
| 1 | Base Wakala entries with no owner | 437 | Their weekly results count for nobody (2,203 weekly rows have no owner) |
| 2 | Daily MGT rows not credited to any owner | 51,517 of 76,504 (67%) | KPI 1 volume and activity are too low for owners |
| 3 | Registered SA tills with no owner | 514 of 516 | Most likely the reason for #2: tills can't credit volume to an owner |
| 4 | Daily MGT November missing days | Nov 10–15 (6 days) | November volume and activity too low |
| 5 | Weekly reports missing | Oct W1, Nov W1, W2 (only Nov W3 uploaded) | Weekly cards empty or wrong for those weeks |
| 6 | Monthly report November | not uploaded yet | Expected, month not finished |
| 7 | Floats sent and not returned, older than 7 days | 16 | These owners are blocked from requesting new float |
| 8 | Staff with no owner linked | 31 | They don't appear under any owner |
| 9 | Staff without a login | 30 | They can't sign in |
| 10 | Tills shared by more than one staff member | 9 tills | Same question as ADAM/MBILINYI on Petro's till |
| 11 | Priority wakalas not in Base Wakala Index | 4 | They can't count toward KPI 2 |
| 12 | Owner without a login | 1 | Cannot sign in |
| 13 | Scores change between page loads (known bug) | MASOUD, MOHAMED | Served/active counts read before the wakala list finishes loading |

## What I propose to fix

1. **Fix the loading bug (#13)** so an owner's KPI scores are the same every time.
2. **Check #3 first:** confirm whether the 514 tills really have no owner, or whether the till-to-owner link is missing in storage. If tills have owners elsewhere (Base Wakala / staff records), link them automatically; that should fix most of #2.
3. **Add a "Data health" card for the admin** listing items 1–12 with counts and the names of the missing days/weeks, so you can see gaps without asking me.
4. Items you must do yourself: upload missing Daily MGT (Nov 10–15) and weekly reports (Oct W1, Nov W1, W2), assign the 437 wakalas, follow up on the 16 old floats.

## Technical notes
- Loading bug: OwnerKpiOverview / OwnerDetailsView must wait for the owner's portfolio to be fully loaded before computing served/active.
- Till link: inspect sa_tills.owner_id vs owners/personnel.assigned_till and the attribution in daily_transaction_records.
- Data health card: read-only queries in an admin server function; no data changes.
