# Real account management + secure admin setup + monthly cloud storage

## 1. Remove the published default admin password

- `src/lib/bootstrap.functions.ts`: stop shipping a literal password. First-run setup generates a strong random password server-side (crypto random), creates only the admin account, logs it once server-side and returns it once to the caller. Still a hard no-op once any profile exists.
- `src/components/LoginView.tsx`: username and password start empty for every portal (admin, owner, float manager). Also remove the two "SSO" buttons that silently signed in with the built-in admin credentials; they become a clear "not enabled" state instead of a hidden backdoor.

## 2. Real account management (replaces the fake local user list)

New `src/lib/accounts.functions.ts` — privileged server functions, each one first verifying the caller is an admin (`has_role`), then using the service-role client loaded inside the handler:

- `listUserAccounts` — accounts from Auth + `profiles` + `user_roles`, joined with the linked agent team (`owners.user_id`) or staff member (`personnel.user_id`).
- `createUserAccount` — creates the login (email confirmed), inserts the role row (`owner` / `float_manager`), links it to the chosen team or staff member, generates a random password when the admin does not type one, and returns the password once so the admin can hand it over.
- `updateUserAccount` — email / display name / username / linkage changes.
- `resetUserPassword` — sets a new or randomly generated password, returned once.
- `deleteUserAccount` — deletes the login, clears the link on the team/staff row (role and profile rows drop with it).

Every one writes an audit log row.

### UI rewiring

- `src/components/PeopleManagementView.tsx`: the Users tab reads from `listUserAccounts` instead of browser storage; create / reset-password / delete call the new functions and show real success and error states (including the generated password, copyable, shown once). All `hasidadi_users` reads and writes removed, along with the local password-hashing path for these accounts.
- `src/components/OwnerSyncDashboard.tsx`: delete the block that invented an account per owner with the shared password `agentpassword`. Sync no longer creates logins; the admin creates them from People Management.
- `src/utils/ownerDeletion.ts`: owner deletion calls `deleteUserAccount` for the linked login instead of editing browser storage.
- `src/utils/passwordHash.ts` stays only if something else still uses it; otherwise it is removed.

## 3. Monthly report rows now saved to the database (like weekly)

- New migration: `monthly_servicing_records`, mirroring `weekly_servicing_records` (reporting month + phone unique, owner link, status, transactions, value, raw row, uploader), with the same access rules — staff manage all rows, a team owner reads only their own — plus the required grants.
- New `src/lib/monthly.functions.ts` + `monthly.server.ts` mirroring the weekly pair: save (replacing that month), fetch, list months, delete.
- `src/components/UploadReportsView.tsx`: the monthly upload writes to the database alongside the existing offline copy, exactly as the weekly upload already does. Monthly purge/delete also clears these rows.

## Verification

Type-check, then test end to end against the live backend: create an owner login from People Management, sign in as that owner, reset its password, sign in again, delete it and confirm sign-in fails. Confirm a monthly upload's per-agent rows are readable after clearing browser data.

## Notes

- Existing accounts already in the real system are unaffected. Any "accounts" that only existed in browser storage were never able to sign in and will not appear in the new list — those people need a real login created once.
- The current admin password stays as it is today; this change only removes the published default from the source and the login form.
