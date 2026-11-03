# Float Manager: clearer filters + action for owners with unreturned float

## What's wrong today (checked in code)
- Filters are All / Pending / Confirmed / Returned / Completed / Rejected. "Returned" also shows completed and loan-converted requests, so it overlaps with "Completed".
- There is no filter for "got float and hasn't returned it".
- When an owner with an unreturned float asks for more, the request looks like any other Pending one: no warning, no special action.

## Changes
1. **New filter chips, one meaning each, color-coded with counts:**
   - Pending (waiting for the manager to send) – amber
   - Not returned (sent, nothing back yet) – red, shows days outstanding
   - Returned – awaiting check (return logged, not yet completed) – blue
   - Completed – green
   - Converted to loan – purple
   - Rejected – grey
   - All
2. **Status badge on every card** in the same color as its chip.
3. **"Has unreturned float" warning** on a Pending request when that owner still has a Not returned float: red banner showing amount and days outstanding.
4. **Actions for those requests:**
   - "Reject – return previous float first" (one click, records that reason).
   - "Send anyway" needs a second confirm step that shows the outstanding amount.
   - "View outstanding float" jumps to the Not returned filter for that owner.
5. A summary card at the top: "Owners with unreturned float" with count and total TZS.

## Technical
- Only `src/components/FloatManagerView.tsx` changes: new filter definitions plus a `ownerHasOutstanding(ownerId)` helper. Rejection uses the existing `handleDenyRequest` with a preset reason. No database changes.
- Remove the old `hasReturn`/overlapping filter logic after the change.
