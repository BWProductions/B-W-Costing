# Restore point — 15/16 Sep 2026 — "Approved by Bernie: dashboard and staff wages look right"

Live version at this point: **v2026-09-15-11** (https://bwprodsystem.co.za/wages-version)
Git tag: **restore-2026-09-15-approved**  ·  Handover spec: `../handover-2026-09-15-rate-rules-payroll-excel.pdf`

## What this point contains
- Code: rate rules v4 + midnight split, rate-choice reviews, calendar window, single tick, Select-all fix,
  edit buttons, Payroll Excel (6 tabs), locked missed shifts shown under "Finally submitted shifts".
- Data snapshot for payroll week 2026-09-12 → 2026-09-18 (taken after the clean-up):
  - `paid_rows.json` — 101 paid shifts incl. 24 missed (approved 694,75 h · wages R60 025,65 in the Excel)
  - `reviews.json` — all reviews from 5 Sep on, with Bernie's decisions
  - `drafts.json` — drafts from 5 Sep on
  - `removed_audit.json` — every row the office removed (Erick Aug/3 Sep, Givemore duplicates) with reasons
  - `loans_deductions.json` — loans, repayments, fixed deductions
  - `bw-payroll-…-at-restore-point.xlsx` — the auditor Excel exactly as generated at this point

## Restore the code
```bash
git checkout restore-2026-09-15-approved
npm run build
npx wrangler pages deploy dist --project-name bw-productions --branch main --commit-dirty=true
curl https://bwprodsystem.co.za/wages-version   # expect v2026-09-15-11
```

## Restore a row's money (example)
Look the shift up in `paid_rows.json` and put `gross_wage`, `total_amount`, `hourly_rate_snapshot`,
`calculation_version` back with a single UPDATE on `wage_shifts` (never delete). Removed duplicates can be
re-inserted from `removed_audit.json` if ever needed.
