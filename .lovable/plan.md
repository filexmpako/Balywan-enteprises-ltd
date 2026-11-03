# Float Manager: clearer filters + action for owners blocked by unreturned float

## What the code does today (checked)
- **Owner side:** an owner cannot request new float while any earlier request is not Completed or Rejected. The request form is simply hidden. Nothing tells the owner why, and the float manager can't see or lift that block.
- **Server side:** the block exists only on the screen. The server accepts a new request even when an old float is unreturned, so the rule can be bypassed.
- **Float manager filters:** All / Pending / Confirmed / Returned / Completed / Rejected. "Returned" also includes completed and loan-converted requests, so it overlaps with "Completed". There is no "sent but not returned" view.

## Changes
1. **Filter chips with one meaning each, color-coded with counts:**
   - Pending (waiting for the manager to send), amber
   - Not returned (sent, nothing back yet), red, with days outstanding
   - Returned, awaiting check (return logged, not completed), blue
   - Completed, green
   - Converted to loan, purple
   - Rejected, grey
   - All
2. **Same-color status badge** on every request card.
3. **New "Blocked owners" panel** in the float manager portal: owners who can't request because a previous float isn't returned, with amount, days outstanding and the request it's waiting on. Actions:
   - **Send reminder** (in-app message to the owner to return the float).
   - **Allow one new request**: a one-time exception that lets that owner submit one more request. It's recorded with the manager's name and cleared once used.
   - **Convert shortfall to loan** (existing action), which unblocks the owner when they've returned part of it.
   - **View request**, which jumps to that request under "Not returned".
4. **Owner screen:** instead of a hidden form, the owner sees "Return your previous float of TZS X (sent N days ago) before requesting again", or "Exception granted by <manager>: you may request once" when allowed.
5. **Server enforcement:** a new request is refused while the owner has an unreturned float, unless a one-time exception exists. The exception is used up on submit.
6. **Summary card:** "Owners with unreturned float", with count and total TZS.

## Technical
- `src/components/FloatManagerView.tsx`: new filter definitions, blocked-owners panel, badges.
- `src/components/FloatManagementPanel.tsx`: blocked message plus exception notice.
- `src/lib/float.server.ts`: on `create`, check for an outstanding request. Add a staff action `grant_request_exception` that stores `extras.requestException = { by, at }` on the blocking request (existing `extras` jsonb, so no schema change). The exception is consumed on create.
- Reminder reuses the existing owner/admin issue-messaging path.
- Test: create is rejected while a float is outstanding, and accepted once after an exception is granted.
- Remove the old overlapping `hasReturn` filter logic.
