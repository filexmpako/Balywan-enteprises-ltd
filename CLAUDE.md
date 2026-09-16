# Working rules for this project

## Change request workflow

For every amendment/change request given for this project, follow these steps in order:

1. **Verify first.** Before writing any code, check the request against the current
   codebase to confirm whether it describes a real bug or a genuinely missing
   feature. Don't assume the report is accurate — trace the actual code path
   (state, data flow, the relevant components/utils) and confirm the claim.
2. **Explain the plan.** State how the fix/feature will be implemented before
   implementing it (what files change, the approach, why).
3. **Implement it.** Then make the change.

If verification shows the claim doesn't hold (no bug found, feature already exists,
etc.), say so plainly instead of implementing something unnecessary.
