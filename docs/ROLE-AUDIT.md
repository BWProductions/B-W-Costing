# Phase 18 — Role & Access Control Audit

**Date:** 2026-05-30 (Saturday)
**Author:** Audit by Claude, commissioned by Bibi
**Status:** Read-only audit. No code changes made.
**Purpose:** Document the current state of role-based access control before any tightening work begins.

---

## TL;DR — The Five Things You Need To Know

1. 🚨 **`requireRole` middleware exists but is NEVER USED.** Every route is protected only by `requireAuth` (logged-in check). Any authenticated user can hit any route by typing the URL directly. The sidebar hides links by role, but that's UI, not security.

2. 🚨 **5 of 6 production users have `founder` role.** Only Shane'2 (`marketing@bwproductions.co.za`) has anything else (`ops_director`). The PERMISSIONS object referencing `finance_director` and `account_director` is **aspirational** — nobody has those roles in production.

3. 🚨 **Two parallel role systems exist and disagree.**
   - `src/lib/auth.ts` says canonical roles are: `founder | ops_director | finance_director | account_director | crew`
   - `src/lib/permissions.ts` says canonical roles are: `founder | ops_director | accounts | crew | read_only`
   - **Neither is wrong, but they can't both be right.** The codebase uses `auth.ts` in production. `permissions.ts` is dead code.

4. 🟡 **The helper functions in `permissions.ts` (`canSeePrices`, `canSeeBanking`, `canEditOperational`, `canManageUsers`, `maskBanking`, `maskPrice`, `roleLabel`) are exported but only used inside `permissions.ts` itself.** All real authz uses `can(user, 'X')` from `auth.ts` instead.

5. 🟢 **Founder-only routes ARE properly protected** via the `admin.use('*')` guard in `src/routes/admin.ts` calling `can(user, 'manageUsers')`. This is the one route group that actually enforces role at runtime. Everything else relies on UI hiding.

---

## Production Reality Check

### Users in production D1 (as of audit date)

| ID | Email | Name | Role | Active |
|---|---|---|---|---|
| 1 | info@bwproductions.co.za | Bibi Burness | founder | ✅ |
| 3 | bibi@bwproductions.co.za | Bernie Burness | founder | ✅ |
| 5 | shanevanstaden844@gmail.com | shane' | founder | ✅ |
| 6 | bookings@bwproductions.co.za | Jocelyn | founder | ✅ |
| 7 | marketing@bwproductions.co.za | Shane'2 | **ops_director** | ✅ |
| 4 | rebel@bwproductions.co.za | Revel Ravenhill | founder | ❌ |

### What this means in practice

- **All 5 active users can do everything.** Role-based restriction effectively does nothing today.
- **The crew/finance/account_director roles are unused.** No one assigned to those.
- Any user can navigate to `/admin/users/new`, `/admin/repair-contacts`, `/admin/backup`, etc. — because the `manageUsers` check returns `true` for all of them.
- Tightening roles **before re-assigning users to non-founder roles** would lock people out instantly. **Step 1 of any rollout = decide who is what.**

---

## Role Strings Found In Code

When you count *real* role strings (excluding noise like `'user'` as a context key, `'admin'` as a nav-key, `'driver'` as a crew-type), the inventory is:

| Role | Mentions in code | Notes |
|---|---|---|
| `founder` | 49 | Used everywhere; the only fully-supported role |
| `ops_director` | 39 | Used in nav, FIELD_ADMIN_AUTO_ROLES, PERMISSIONS |
| `crew` | 26 | Defined in auth.ts; nobody actually has it |
| `finance_director` | 22 | Defined in auth.ts + admin.ts; nobody has it |
| `account_director` | 15 | Defined in auth.ts + admin.ts; nobody has it |
| `accounts` | 3 | **Phantom — defined in permissions.ts only, never used elsewhere** |
| `read_only` | 4 | **Phantom — defined in permissions.ts only, never used elsewhere** |

**Total real role references: ~158** (not "63" as I estimated yesterday — yesterday's count was overstated).

---

## Two Parallel Role Systems (The Core Conflict)

### System A — `src/lib/auth.ts` (the one production actually uses)

```typescript
export type UserRole = 'founder' | 'ops_director' | 'finance_director' | 'account_director' | 'crew'
```

Used by:
- `can(user, permission)` — the function actually gating admin routes
- `PERMISSIONS` matrix — actually enforced by `can()`
- `ROLE_LABELS` — displayed in the sidebar user badge
- `verifySessionToken` / login — typecasts the DB role to `UserRole`

### System B — `src/lib/permissions.ts` (dead code, never called)

```typescript
export type CanonicalRole = 'founder' | 'ops_director' | 'accounts' | 'crew' | 'read_only'
```

Defines:
- `canSeePrices()`, `canSeeBanking()`, `canOverrideStockShortage()`, `canOverrideVendorRegistration()`, `canEditOperational()`, `canManageUsers()`, `maskBanking()`, `maskPrice()`, `roleLabel()`
- `normaliseRole()` — has fallback `'admin' → 'founder'`, `'ops' → 'ops_director'`

**None of these helpers are imported or called anywhere outside `permissions.ts` itself.** Confirmed by `grep -rn "canSeeBanking\|canEditOperational\|canManageUsers" src/`.

### Why this matters

If we adopt System A as canonical (recommended — it's what runs in production), we delete System B entirely.

If we adopt System B (cleaner semantics — `accounts` and `read_only` are more honest names than `finance_director` and `account_director`), we have to:
- Rename existing users' roles in D1
- Update the admin.ts `ROLE_OPTIONS` array
- Rewire every `can(user, X)` call to use new role names

System A wins on inertia. System B wins on clarity. **My recommendation is below.**

---

## Authorization By Route — The Matrix

### Mount order (from `src/index.tsx`, line 60-290)

| Order | Route | Auth chain | Real role gate? |
|---|---|---|---|
| 1 | `/field/admin/planner-extractor` | requireAuth (inherited) | ❌ None |
| 2 | `/field/admin/products` | requireAuth | ❌ None |
| 3 | `/field/admin` | requireAuth | ❌ None |
| 4 | `/health` | (none — public for monitoring) | ❌ N/A |
| 5 | `/musicbus`, `/dispatch` | token-gated (not session) | ❌ N/A |
| 6 | `/api/cron/*` | bearer token | ❌ N/A |
| 7 | `/admin/stock/returns` | requireAuth | ❌ None |
| 8 | `/admin/stock/damages` | requireAuth | ❌ None |
| 9 | `/admin/stock` | requireAuth | ❌ None |
| 10 | `/admin/brands` | requireAuth | ❌ None |
| 11 | `/admin/brand-shares` | requireAuth | ❌ None |
| 12 | `/admin/brand-digest` | requireAuth | ❌ None |
| 13 | `/admin/audit` | requireAuth + `gateRoles(user)` | ✅ founder, ops_director, finance_director |
| 14 | `/admin/*` (catch-all) | requireAuth + `can(user, 'manageUsers')` | ✅ founder only |
| 15 | `/account` | requireAuth | ❌ None (intentional — own account) |
| 16 | `/fleet`, `/clients`, `/suppliers`, `/events`, `/quotes` | requireAuth | ❌ None |

### Translation: What this means

- **Any logged-in user** can manage stock, edit damages, view brand pages, manage brand-share links, edit brand digest subscriptions, view all clients, edit all quotes, manage suppliers, manage fleet.
- **Audit viewer** is the only sensitive route gated to senior roles. (Works correctly.)
- **`/admin/*` user management** is properly founder-locked. (Works correctly.)
- The sidebar **hides** Stock Admin and Music Bus from non-founder/non-ops_director users, but a crew member who knew the URL `/admin/stock` could still hit it.

---

## Files That Define Roles Or Role-Related Constants

| File | Constant / Type | Lines | Role set | Status |
|---|---|---|---|---|
| `src/lib/auth.ts` | `UserRole` type | 3 | founder, ops_director, finance_director, account_director, crew | ✅ The "real" system |
| `src/lib/auth.ts` | `ROLE_LABELS` | 12-18 | (5 above) | ✅ Used in sidebar |
| `src/lib/auth.ts` | `PERMISSIONS` | 21-39 | (5 above) | ✅ Used by `can()` |
| `src/lib/permissions.ts` | `CanonicalRole` type | 9 | founder, ops_director, **accounts**, crew, **read_only** | ❌ Dead — different roles, never imported |
| `src/lib/permissions.ts` | `ALL_ROLES` | 11 | (5 above) | ❌ Dead |
| `src/lib/permissions.ts` | `normaliseRole()` | 15-23 | maps legacy strings | ❌ Dead — only called within permissions.ts |
| `src/lib/permissions.ts` | 6× `canX()` helpers | 28-66 | uses CanonicalRole | ❌ Dead — never imported elsewhere |
| `src/lib/layout.ts` | nav `roles:` arrays | 40-58 | mixes ops_director, finance_director, account_director, crew | ✅ Active — used to hide nav links |
| `src/routes/admin.ts` | `ROLE_OPTIONS` | 24-30 | founder, ops_director, finance_director, account_director, crew | ✅ Active — populates user-create dropdown |
| `src/routes/admin.ts` | `ROLE_COLORS` | 32-38 | (5 above) | ✅ Active — badge colours |
| `src/routes/admin.ts` | `ROLE_LABELS_REPAIR` | 816+ | repair, electrical, plumbing, etc. | ⚠️ Different concept — "repair contact role", NOT user role |
| `src/routes/field.ts` | `FIELD_ADMIN_AUTO_ROLES` | 4263 | founder, ops_director | ✅ Active — auto-fills admin field |
| `src/routes/planner-extractor.ts` | `FIELD_ADMIN_AUTO_ROLES` | 19 | founder, ops_director | ⚠️ Duplicated — should reuse the one in field.ts |
| `src/routes/audit-viewer.ts` | `gateRoles()` | 44-46 | founder, ops_director, finance_director | ✅ Active — only real route-level gate outside admin |
| `src/middleware/auth.ts` | `requireRole(...roles)` | 19-26 | accepts any string | ❌ Defined but NEVER CALLED |

---

## Where Authorization Is Actually Enforced

### A. Real route-level enforcement (2 places)

1. **`src/routes/admin.ts` line 15-21** — Founder-only guard on the entire `/admin/*` chain (excluding `/admin/stock`, `/admin/brands`, etc. which are mounted before this catch-all)
   ```typescript
   admin.use('*', async (c, next) => {
     if (!user || !can(user, 'manageUsers')) {
       return c.html('<p>Access denied.</p>', 403)
     }
     await next()
   })
   ```

2. **`src/routes/audit-viewer.ts` line 44-46** — Manual inline check using `gateRoles()`
   ```typescript
   function gateRoles(user: AuthUser): boolean {
     return ['founder', 'ops_director', 'finance_director'].includes(user.role)
   }
   ```

### B. Visibility-only enforcement (the rest of the app)

- **Sidebar nav hiding** — `src/lib/layout.ts` line 64-68
- **Per-element show/hide in templates** — `can(user, 'viewMargins')` in `quotes.ts`, `dashboard.ts` (4 sites)
- **Conditional content rendering** — `can(user, 'viewCostBuild')` etc.

These hide UI but **don't stop the HTTP request from succeeding** if someone types the URL.

### C. Auth bypass / public surfaces (intentional)

- `/health` — no auth (monitoring)
- `/api/cron/*` — bearer token (workflows)
- `/musicbus`, `/dispatch` — share-token gated (drivers don't log in)
- `/public/brand/*` — share-token gated (brand owners don't log in)
- `/field/*` — public mobile entry (drivers/crew don't log in for delivery notes)

---

## High-Risk Routes That Should Be Gated But Aren't

Routes where any authenticated user can perform sensitive actions today:

| Route | What it does | Should be limited to |
|---|---|---|
| `POST /admin/stock/*` | Edit master stock, change qty_on_hand, mark items inactive | founder, ops_director |
| `POST /admin/stock/damages/*` | Approve/reject damage reports, change repair cost | founder, ops_director |
| `POST /admin/stock/returns/*` | Mark stock returned, reconcile shortages | founder, ops_director |
| `POST /admin/brands/*` | Edit brand details, set sharing tokens | founder, ops_director |
| `POST /admin/brand-shares/*` | Create/revoke brand-share tokens (security-critical — these are public URLs!) | founder only |
| `POST /admin/brand-digest/*` | Add/remove brand owner email subscriptions | founder, ops_director |
| `POST /admin/stock/alerts/*` | Add/remove low-stock alert recipients | founder, ops_director |
| `POST /events/*/edit` | Edit calendar event details | founder, ops_director |
| `POST /quotes/*/edit` | Edit quotes (price, margin visible) | founder, ops_director, finance_director, account_director |
| `POST /clients/*/edit` | Edit client banking, contact info | founder, ops_director |
| `POST /suppliers/*/edit` | Edit supplier banking | founder only |
| `POST /fleet/*/edit` | Edit vehicle status | founder, ops_director |

**Today, all of these are accessible to any logged-in user.** Right now that's fine because everyone is `founder`, but the moment we re-assign someone to `crew` or `account_director`, they'll be able to do things they shouldn't.

---

## Recommended Path Forward (Three Phases)

### Phase 18a — Decide & Document (15 minutes, no code)

You and Bernie answer these questions, in writing:

1. **Which role set is canonical?**
   - **Recommendation: keep `auth.ts` as canonical** (`founder | ops_director | finance_director | account_director | crew`). It matches what's in production; the alternative requires re-typing every user's role.
   - If we adopt this, **delete `src/lib/permissions.ts` entirely** — it's all dead code.

2. **Should `finance_director` and `account_director` collapse into a single role?**
   - Reality check: you don't currently have anyone in those roles. Are you going to hire one? If not, simplify to `founder | ops_director | accounts | crew`.
   - **Recommendation: collapse to `founder | ops_director | accounts | crew | read_only`** (5 roles), where `accounts` = formerly finance_director, `read_only` = view-only outside crew (e.g., investor, advisor).

3. **Who gets which role going forward?**

   | User | Today | Recommended |
   |---|---|---|
   | Bibi (info@) | founder | founder |
   | Bernie (bibi@) | founder | founder |
   | shane' (shanevanstaden844@) | founder | ops_director or crew? |
   | Jocelyn (bookings@) | founder | accounts or ops_director? |
   | Shane'2 (marketing@) | ops_director | account_director or accounts? |

### Phase 18b — Cleanup & Consolidate (~2 hours, low-risk)

Code-only refactor, **no permission changes yet**:

1. Delete `src/lib/permissions.ts` (dead code)
2. Delete `requireRole` from `src/middleware/auth.ts` (dead — switch to `can()` pattern)
3. Move `FIELD_ADMIN_AUTO_ROLES` to a single shared constant in `src/lib/auth.ts`
4. Remove the dead helper functions duplicated in `account.ts` / `suppliers.ts`
5. Update `ROLE_OPTIONS` in `admin.ts` to import from `auth.ts` (single source of truth)
6. Add `PERMISSIONS` entries for every operational action: `manageStock`, `manageDamages`, `manageBrandShares`, `viewAuditLog`, etc.

**Risk:** Zero — no behavioural change, just collapsing duplication.

### Phase 18c — Actually Tighten (~3 hours, requires testing)

Replace the inline `admin.use('*')` guards with consistent middleware:

1. Add `requireCan(permission)` middleware to `src/middleware/auth.ts`:
   ```typescript
   export const requireCan = (perm: keyof typeof PERMISSIONS) =>
     createMiddleware<Env>(async (c, next) => {
       const user = c.get('user')
       if (!user || !can(user, perm)) {
         return c.html('<h1>403 — Not authorised</h1>', 403)
       }
       await next()
     })
   ```

2. Apply to every sensitive route mount:
   ```typescript
   app.route('/admin/stock', stockAdmin)   // becomes:
   stockAdmin.use('*', requireCan('manageStock'))
   ```

3. **Per-router guards** for fine-grained control (e.g., GET = view = wider, POST = mutate = narrower).

4. **Test with each role** in dev D1 before deploying. Specifically:
   - Create a `crew` test user, log in as them, try to hit every `/admin/*` URL → expect 403
   - Create an `accounts` test user, verify they can view quotes but not edit suppliers
   - Verify the sidebar hides things correctly

5. Deploy on a **Monday morning**, not a Friday evening. Bernie and Shanae both reachable.

**Risk:** Medium. Without testing, this is how Shanae's locked-out-of-stock email lands at 7am Monday. With testing, it's clean.

---

## Phase 18 Effort Estimate

| Phase | Time | Risk | Production change |
|---|---|---|---|
| 18a — Decision document | 15 min (you + Bernie) | Zero | None |
| 18b — Code consolidation | 2 hours | Low | Imports only, no behaviour |
| 18c — Route-level tightening | 3 hours + 1 hour testing | Medium | Yes — could lock people out |
| **Total** | **~6 hours of dev + 15 min from you** | | |

---

## What I Would Do If I Were You

1. **Don't touch this on a weekend.** This is a Monday-morning project.
2. **Phase 18a first.** Until you decide who gets what role, code work is premature.
3. **Phase 18b is safe to do anytime** — it's pure cleanup, deletes ~100 lines of dead code. Could be done as a quiet PR.
4. **Phase 18c — schedule a 4-hour window** on a Monday morning with Bernie reachable. Roll out, smoke-test with multiple test users, ready to revert.

---

## Open Questions For You

1. Do you want to keep `finance_director` and `account_director` as separate roles, or collapse to `accounts`?
2. Should `crew` be able to view their own pay-related screens, or is `crew` purely operational (delivery notes, etc.)?
3. Should there be a `read_only` role for external advisors/investors/auditors who need visibility but can't change anything?
4. Who's running this when we do Phase 18c — do you want me to drive, or do you want to pair with Bernie watching?

---

**End of audit. No production changes were made. All findings are based on `main` branch as of commit `5daff4d`.**
