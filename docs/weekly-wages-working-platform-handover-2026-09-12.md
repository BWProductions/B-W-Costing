# Weekly Wages Working Platform — Handover

Date: 2026-09-12
Project path: `/home/user/webapp`
Cloudflare Pages project: `bw-productions`
Primary live URL: https://bwprodsystem.co.za/wages
Pages preview URL at handover time: https://b19f6eb8.bw-productions.pages.dev
Baseline restore tag: `weekly-wages-working-platform-baseline-2026-09-12`
Baseline code commit: `1936aea` (`Persist exact selected staff mapping across wages flow`)
Handover document snapshot: stored in git history on `main` together with this document
Backup expectation: downloadable project archive containing this handover + git history

## 1. Purpose of this handover
This handover is the reference snapshot for the **Weekly Wages Working Platform** as it was configured during the 2026-09-12 wages/timesheet work session.

Use this document for three things:
1. To understand how the weekly wages flow is supposed to work.
2. To brief a new AI chat so it does not re-break approved behavior.
3. To restore the project back to this baseline if later edits damage the worker wages UI.

## 2. What this wages system is
The wages system is the worker-facing timesheet flow at:
- `/wages`
- `/wages/login?...`
- `/wages/...` worker pages

It is **not** a separate standalone app. It is a safe-proxy enhancement layer over the upstream wages site.

### Architecture
- Framework: Hono + TypeScript
- Hosting: Cloudflare Pages / Worker
- Main implementation file for wages overlay: `src/index.tsx`
- Upstream wages origin proxied by worker: `https://3c3bcb89.bw-productions.pages.dev`
- Enhancement injection class: `WagesUiInjector`
- The worker rewrites proxied HTML and injects CSS + JavaScript for the wages UI behavior.

## 3. Locked baseline behavior approved in this session
This is the behavior future changes should preserve unless the user explicitly changes the spec again.

### 3.1 General worker behavior
- Wages pages are enhanced by the worker, not edited upstream directly.
- HTML responses under `/wages*` are returned with no-cache headers so users should not need a hard refresh to see changes.
- Shared-device flow must work safely.

### 3.2 No-cache headers
The worker currently sets these headers on proxied HTML responses:
- `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`
- `Pragma: no-cache`
- `Expires: 0`
- `Surrogate-Control: no-store`

Purpose:
- Prevent stale wages UI from sticking in browser/proxy cache.

### 3.3 Dashboard / home page behavior
Approved dashboard expectations from this session:
- The **Add Current Shift** button is styled dark/navy.
- The worker-facing **Save Shift Temporarily** action is yellow.
- On the dashboard page only, the extra red **MISSED SHIFT** block that was sitting underneath **Add Current Shift** has been removed.
- Visible worker-facing wording should use **MISSED SHIFT** / **missed shift**, not the old `MissShift` spelling.
- The old staff-side **Return to Dashboard** access is removed from the worker flow.
- **Switch person** forces logout first, then returns to `/wages` so another worker can use the same device safely.
- The old **Last payroll** helper / unwanted helper copy is removed.
- The payroll week picker is unlocked safely.

### 3.4 Current shift flow
Approved expectations:
- Worker can add a current shift through the standard flow.
- Button styling remains:
  - Add Current Shift = dark/navy
  - Save Shift Temporarily = yellow
- Bulk Final Submission helper exists for shift lists.

### 3.5 Missed shift flow
Approved / intended missed-shift behavior from this session:
- Missed shift pages show a distinct red missed-shift banner / identity.
- Visible worker-facing wording should read **MISSED SHIFT** / **missed shift** rather than `MissShift`.
- The flow must capture the exact work date, venue, work type / role, description, and times.
- The flow persists backend claim/review metadata for payroll handling.
- The missed-shift page should not drift back to the old Saturday/Monday-only behavior.
- The duplicate top **Date worked** control on the missed-shift page was specifically targeted for removal; future edits must not accidentally reintroduce it.
- The work-type dropdown on the missed-shift form was restored after selector cleanup had removed it; future edits must preserve that dropdown.
- The UI around missed-shift date handling was highly sensitive during this session; future edits here must be made extremely carefully.

### 3.6 Hidden / removed items in worker flow
- Hide the visible **Next Overnight Shift** prompt.
- Remove unwanted guidance / old helper wording that was not approved.

### 3.7 Approved visual baseline to preserve
When someone says “put it back to how it looked when it was approved”, this is the baseline they mean:
- Dashboard / home screen keeps the approved worker-friendly appearance, with the main current-shift call-to-action in dark/navy.
- The worker-facing **Save Shift Temporarily** action is yellow.
- The extra red **MISSED SHIFT** block that previously sat under **Add Current Shift** on the dashboard is not present there anymore.
- Missed-shift pages themselves still carry a strong red missed-shift visual identity so workers can see they are not in the normal shift flow.
- Visible wording uses **MISSED SHIFT** / **missed shift** instead of `MissShift`.
- The missed-shift screen shows one intended `Date worked` control, not a duplicated top selector row.
- Staff-specific work-type dropdowns should follow the approved worker mapping and persist through the worker flow.

### 3.8 Summary of what was intentionally changed in this session
This handover baseline includes these intentional wages-related changes from the session:
- fixed the shared-device switch-person/logout flow
- applied worker-safe no-cache behavior so changes appear on normal refresh
- preserved the approved button color styling for current-shift and temporary-save actions
- corrected the dashboard worker flow appearance
- corrected visible missed-shift wording
- removed duplicate missed-shift date controls
- restored the missed-shift work-type dropdown after it was accidentally removed
- persisted the exact selected staff profile so the correct mapped dropdown follows the worker

## 4. Exact staff work-type mapping approved by user
These mappings were explicitly provided and approved by the user.

### Specific assigned dropdowns
- **Givemore Chifetete Kuziwa**
  - House
  - Team Assistance

- **Takavaudza Chokuda (Takka)**
  - House/Garden
  - Warehouse Team

- **Thina Dyani**
  - Normal only

- **Bhekizitha Maphosa (Bheki)**
  - Music Bus
  - Normal

- **John Simbarashe Mhlanga (Jay)**
  - Music Bus
  - Normal

- **Brian Ndlovu (Sipho)**
  - Music Bus
  - Normal

- **Joshua Motsamai Nteo**
  - Music Bus
  - Normal

### Fallback for unmapped staff
If a staff member is not in the explicit mapping list, the current fallback options in code are:
- Normal
- House
- House/Garden
- Warehouse Team
- Team Assistance
- Music Bus

## 5. Key wages-specific code areas
All of the sensitive wages logic discussed today is in `src/index.tsx`.

### Important constants / sections
- `ORIGIN` — upstream proxied wages source
- `WagesUiInjector` — injected CSS/JS enhancements
- `STAFF_WORK_TYPE_PROFILES` — approved mapped work-type list
- `ACTIVE_STAFF_PROFILE_KEY` — selected staff mapping persistence across wages flow
- `CLAIM_WEEK_STORAGE_KEY`
- `MISSED_MODE_STORAGE_KEY`

### Important helper functions
- `decorateButtons()`
- `fixSwitchPerson()`
- `unlockPayrollWeekPicker()`
- `enhanceMissedShiftForms()`
- `resolveStaffWorkTypeProfile()`
- `resolveWorkTypeOptions()`
- `restoreWorkTypeField()`
- `detectAndPersistActiveStaffProfile()`
- `proxyRequest()`

### Important caution
The wages system is fragile because UI behavior is injected into proxied HTML. Small changes in selectors, regex, or DOM cleanup can accidentally:
- remove the wrong field
- remove the wrong dropdown
- break staff-specific mappings
- restore duplicate date controls
- break missed-shift behavior
- change the approved dashboard appearance
- make the selected worker lose the correct work-type mapping across the wages flow

## 6. Today’s relevant git history
Recent commits directly tied to this wages session:
- `1936aea` Persist exact selected staff mapping across wages flow
- `9a8e083` Persist staff mapping across wages forms
- `6448bf9` Restore work type dropdown on missed shift form
- `8c85d22` Restrict Thina work type to normal only
- `e9f7593` Remove top missed-shift duplicate date selector
- `ef12ec3` Remove duplicate missed shift date selector row
- `490c590` Revert "Remove top missed shift date worked control"
- `08cb185` Remove top missed shift date worked control
- `e360b2b` Force remove duplicate missed shift select field
- `ccc1361` Remove duplicate missed shift date field
- `007f41d` Remove dashboard missed shift button only
- `5f53784` Fix wages enhancer regex escaping in injected script
- `8522c41` Fix missshift dashboard injection and launch flow
- `b762acf` Adjust wages UI styling and disable HTML caching

## 7. Files and paths that matter most for wages
### Core project files
- `/home/user/webapp/src/index.tsx`
- `/home/user/webapp/package.json`
- `/home/user/webapp/ecosystem.config.cjs`
- `/home/user/webapp/README.md`

### Local run / build
```bash
cd /home/user/webapp
npm run build
pm2 start ecosystem.config.cjs
curl http://localhost:3000/health
```

### Deploy
```bash
cd /home/user/webapp
npm run build
npx wrangler pages deploy dist --project-name bw-productions
```

## 8. Safe restore strategy
This is the important part.

### Option A — restore by git tag (fastest code restore)
A restore tag has been created for this handover baseline:
- `weekly-wages-working-platform-baseline-2026-09-12`

To restore back to this baseline in a future chat:
```bash
cd /home/user/webapp
git fetch --tags || true
git checkout weekly-wages-working-platform-baseline-2026-09-12
npm run build
npx wrangler pages deploy dist --project-name bw-productions
```

If you want the branch to point back there again:
```bash
cd /home/user/webapp
git checkout main
git reset --hard weekly-wages-working-platform-baseline-2026-09-12
npm run build
npx wrangler pages deploy dist --project-name bw-productions
```

### Option B — restore from full backup archive
A full project backup should be kept together with this handover document. That is the safest restore if git history or working tree gets messy.

Recommended restore process from backup:
1. Download the backup archive.
2. Extract it back to the original path.
3. Rebuild.
4. Redeploy.

### Option C — restore by specific commit
If needed, the current baseline code commit is:
- `1936aea`

Restore example:
```bash
cd /home/user/webapp
git checkout 1936aea
npm run build
npx wrangler pages deploy dist --project-name bw-productions
```

## 9. What a future AI must NOT casually change
Unless the user explicitly approves it, do **not** casually change:
- wages button styling
- dashboard structure
- missed-shift date UI
- any duplicate date-field cleanup logic
- work-type mapping logic
- selected-staff persistence logic
- switch-person flow
- no-cache response headers
- helper text / guidance wording

If a future AI touches the wages overlay, it should treat `src/index.tsx` as a high-risk file.

## 10. Known sensitive behaviors to verify after any future change
After any future wages change, a future AI should verify at minimum:
1. `/wages` loads
2. no-cache headers still exist on `/wages`
3. worker can switch person safely
4. dashboard still matches the approved layout, including no extra red MISSED SHIFT block under Add Current Shift
5. Add Current Shift button styling still correct
6. Save Shift Temporarily still yellow
7. visible `MISSED SHIFT` / `missed shift` wording is still correct
8. staff-specific work-type mapping still correct
9. missed-shift page still shows the correct fields
10. no duplicate date controls appear
11. work-type dropdown still appears and is not removed by selector cleanup
12. selected staff identity still persists properly across the wages flow so the exact mapped dropdown follows the worker

## 11. New-chat briefing block
Paste the block below into a new chat if you want the next AI to understand the baseline immediately.

```text
You are working on the B&W Productions Weekly Wages Working Platform inside /home/user/webapp.

Before changing anything, read:
- /home/user/webapp/docs/weekly-wages-working-platform-handover-2026-09-12.md
- /home/user/webapp/src/index.tsx
- /home/user/webapp/README.md

This wages system is a Cloudflare Pages / Hono safe-proxy overlay over an upstream wages site. The worker injects UI fixes into /wages pages.

High-risk file: src/index.tsx.
Do not casually change selectors, date-field cleanup, staff mapping, missed-shift logic, dashboard structure, button styling, or no-cache headers.

Locked work-type mapping:
- Givemore Chifetete Kuziwa → House, Team Assistance
- Takavaudza Chokuda (Takka) → House/Garden, Warehouse Team
- Thina Dyani → Normal only
- Bhekizitha Maphosa (Bheki) → Music Bus, Normal
- John Simbarashe Mhlanga (Jay) → Music Bus, Normal
- Brian Ndlovu (Sipho) → Music Bus, Normal
- Joshua Motsamai Nteo → Music Bus, Normal

Restore tag for known wages baseline:
- weekly-wages-working-platform-baseline-2026-09-12
- baseline commit 1936aea

If asked to restore the wages system, prefer restoring to the tag/commit above and redeploying.
```

## 12. Final summary
This handover is the operational reference for the Weekly Wages Working Platform baseline established during the 2026-09-12 session.

Keep this file together with:
- the backup archive
- the git restore tag
- the project backup link

That gives you three safety nets:
1. written handover
2. git restore point
3. full project archive
