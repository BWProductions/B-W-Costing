# Test Script — Phases 9–17 + Edit-After-Sign

**For:** Shanae (and Bibi/Bernie when needed)
**Date generated:** 29 May 2026
**Goal:** Walk through every recent feature, confirm it works, log anything broken.

---

## How to use this script

1. Work through tests **top to bottom**. They're ordered to make sense in your day.
2. For each test, **read what should happen** before you click.
3. After clicking, check the actual result against the **expected result**.
4. If it matches → tick the box.
5. If it doesn't match → **don't tick**, write down what you saw in the "Notes" column, and message Bibi a screenshot.
6. Don't worry if you find bugs — that's the whole point. Better now than during a live SAB event.

**Login URLs:**
- Production: <https://bwprodsystem.co.za>
- You'll need to be logged in for almost every test. Log in once at the start with `marketing@bwproductions.co.za`.

---

## Section A — Stock Returns (Phase 9)

**What it is:** When stock comes back from an event, you record what came back. Anything missing becomes a damage/shortage automatically.

| # | Test | What should happen | ✅ | Notes |
|---|---|---|---|---|
| A1 | Open <https://bwprodsystem.co.za/admin/stock/returns> | Page loads showing pending returns (or "you're up to date" if none) | ☐ | |
| A2 | Click "New Return from Event" (if any past event is shown) | A return form opens with the event's allocated items pre-loaded | ☐ | |
| A3 | Change one quantity (e.g. allocated was 24 but only 22 came back) and click Save Draft | Return is saved as a draft, you can see it in the list with status "draft" | ☐ | |
| A4 | Re-open that draft, then click "Complete Return" | Status changes to "completed", stock movement is logged, the 2 missing items show as a shortage on the event | ☐ | |
| A5 | Try to complete the same return twice (refresh and click Complete again) | Should NOT double-count. Either the button is gone or you get a clear error | ☐ | |

**If A1 fails (page won't load):** stop here, message Bibi. The whole section is broken.
**If A2 shows no events:** that's fine — means no completed events have allocations yet. Skip to Section B.

---

## Section B — Damages (Phase 11)

**What it is:** When something comes back broken, it gets logged here. Lifecycle is: open → approved → written-off / recovered / cancelled.

| # | Test | What should happen | ✅ | Notes |
|---|---|---|---|---|
| B1 | Open <https://bwprodsystem.co.za/admin/stock/damages> | Page loads with list of damage records | ☐ | |
| B2 | Click on any "open" damage record | Detail page shows item, qty, reason, who reported, photo (if any) | ☐ | |
| B3 | Click "Approve" on an open damage | Status changes to "approved", you can now write-off or recover | ☐ | |
| B4 | On an approved record, click "Write off" | Status → "written_off", stock movement is logged, item count in stock is reduced | ☐ | |
| B5 | On a different approved record, click "Recover" instead | Status → "recovered" (means we got it back or it was fixable) | ☐ | |
| B6 | Look at the stock movements log afterwards | The write-off / recover should appear as a movement with reason `damage_writeoff` or `damage_recovered` | ☐ | |

**If you don't see any "open" damages:** that's fine. Just confirm B1 loads and tick A1+B1 only.

---

## Section C — Event Costs & P&L (Phase 12)

**What it is:** See how much we made (or lost) per event. Costs auto-calculate based on km, days, vehicles. You can override any number with a reason.

| # | Test | What should happen | ✅ | Notes |
|---|---|---|---|---|
| C1 | Open <https://bwprodsystem.co.za/admin/costs> | Monthly P&L page loads for current month with a list of events + costs + revenue | ☐ | |
| C2 | Change the month dropdown to April 2026 | Page reloads with April's events | ☐ | |
| C3 | Click on any event row | Per-event cost detail page opens, showing line-items for fuel, daily allowance, vehicle hire, etc. | ☐ | |
| C4 | Click "Override" on any cost (e.g. fuel) | A box appears asking for new value + reason | ☐ | |
| C5 | Enter R500 + reason "test override — please ignore" and save | Cost row now shows the new value with a small badge indicating it's overridden, the totals update | ☐ | |
| C6 | Click <https://bwprodsystem.co.za/admin/costs/defaults> | Defaults page loads showing fuel R/km, daily allowance, etc. | ☐ | |
| C7 | Change the daily allowance from R250 to R300, save | Saves successfully, future calculations use R300 | ☐ | |
| C8 | **Reset** the daily allowance back to R250 before you leave | Critical — otherwise next month's P&L is wrong | ☐ | |

**Reminder:** Anything you change in C7 sticks until you change it back. Use the override test in C4–C5 if you want to test without affecting real data.

---

## Section D — Client-Facing Brand Pages (Phase 13)

**What it is:** A way to give SAB / Castle / Carling a read-only link to see their own stock and events. They can't see prices or other brands.

| # | Test | What should happen | ✅ | Notes |
|---|---|---|---|---|
| D1 | Open <https://bwprodsystem.co.za/admin/brand-shares> | Page lists all share tokens by brand | ☐ | |
| D2 | Click "Create new token" for any brand (e.g. Castle Lite) | A 128-bit token is generated, you can copy the share URL | ☐ | |
| D3 | Copy the share URL and open it in a **private browsing window** (so no cookie) | The brand page loads with the brand's data, watermarked, read-only — NO prices shown | ☐ | |
| D4 | Go back to <https://bwprodsystem.co.za/admin/brand-shares> and click "Views" on that token | A page shows that your private window visit was logged with timestamp + IP | ☐ | |
| D5 | Click "Revoke" on the token | Token is deactivated | ☐ | |
| D6 | Open the same share URL again in private mode | Page shows "this link has been revoked" (NOT the brand data) | ☐ | |
| D7 | Confirm: nothing on the public brand page shows R / pricing / margin / cost | Confirmed — only quantities and brand-relevant info | ☐ | |

**Critical security test:** If D7 fails — i.e. a client could see our prices — **stop and tell Bibi immediately**.

---

## Section E — Quote ↔ Event Linker (Phase 14)

**What it is:** Connects a quote to the calendar event it eventually became. So when you look at an event, you can see the quote it came from, and vice versa.

| # | Test | What should happen | ✅ | Notes |
|---|---|---|---|---|
| E1 | Open <https://bwprodsystem.co.za/admin/quote-link> | Page shows two tabs: "Orphans" (events without quotes / quotes without events) and "Linked" | ☐ | |
| E2 | Click "Orphans" tab | List of orphan events on left, orphan quotes on right | ☐ | |
| E3 | Pick an orphan event, find a matching orphan quote, click "Link" | They move out of the orphan list into the "Linked" tab | ☐ | |
| E4 | Open the calendar event you just linked | You should see the quote number displayed on the event card | ☐ | |
| E5 | Open the quote you just linked | You should see the event date/name displayed on the quote | ☐ | |
| E6 | Go back to <https://bwprodsystem.co.za/admin/quote-link> and click "Unlink" on that pair | They go back to orphan lists | ☐ | |

**If E1 page is empty (no orphans):** That's actually a *good* sign — means everything is already linked. Skip the rest.

---

## Section F — Mobile Field Stock Check-Out (Phase 15)

**What it is:** A phone-friendly screen for the warehouse team to tick off stock as it physically leaves for an event.

⚠️ **Open this section ON YOUR PHONE** — that's the whole point.

| # | Test | What should happen | ✅ | Notes |
|---|---|---|---|---|
| F1 | On your phone, log in then open <https://bwprodsystem.co.za/field/stock-checkout> | Mobile-optimised page loads with big tap targets, list of upcoming events with stock allocated | ☐ | |
| F2 | If "No upcoming events with allocations" → that's correct right now | We have 0 allocations in production currently. This will populate once events get stock assigned | N/A | |
| F3 | Tap an event (if any) | Per-event pick list opens with each item, qty needed, qty already checked out, a numeric input + big "Check Out" button | ☐ | |
| F4 | Enter a quantity and tap "Check Out" | Progress bar updates, stock movement logged with `reason_category=event_dispatch`, the item shows X/Y where X = total checked out | ☐ | |
| F5 | Check out the same item again with another qty | Numbers stack correctly (e.g. you check out 5, then 3 more = 8/10 shown) | ☐ | |
| F6 | When you reach the allocated total, the row goes green with ✓ | Item appears as "Fully loaded", input is replaced with green badge | ☐ | |

**Honesty note:** Right now there are 0 allocations in production. You can confirm F1 loads, but F3–F6 won't have data to test until allocations exist. That's a known data state, not a bug.

---

## Section G — Audit Viewer + Login History (Phase 16)

**What it is:** A log of every meaningful change in the system + every login attempt. So if anything goes wrong, you can see who did what and when.

| # | Test | What should happen | ✅ | Notes |
|---|---|---|---|---|
| G1 | Open <https://bwprodsystem.co.za/admin/audit> | Page loads with a table of recent changes — your most recent edits should be visible | ☐ | |
| G2 | Use the "user" filter to show only edits by `marketing@bwproductions.co.za` | Table filters to just your edits | ☐ | |
| G3 | Click the small CSV button at the top right | A CSV file downloads with the filtered data | ☐ | |
| G4 | Open <https://bwprodsystem.co.za/admin/audit/logins> | Login history page loads showing every login attempt (successful + failed) | ☐ | |
| G5 | Look for failed login attempts | Any failed logins show with a red marker and reason (wrong password / unknown user / etc.) | ☐ | |
| G6 | Open the login history CSV (top right) | Downloads with login attempts data | ☐ | |

**If G1 or G4 redirect you to /login or show 403:** that's because the page is restricted to founder/ops_director/finance_director roles. Your role is `ops_director` so you should get in. If you're blocked, message Bibi.

---

## Section H — Brand Owner Weekly Digest (Phase 17)

**What it is:** Sends a weekly email to brand owners (e.g. SAB) showing what we did with their stock that week. Goes out Monday morning, but you can preview/test-send now.

| # | Test | What should happen | ✅ | Notes |
|---|---|---|---|---|
| H1 | Open <https://bwprodsystem.co.za/admin/brand-digest> | Page lists subscriptions (which brand → which email address) | ☐ | |
| H2 | Click "Add subscription", enter your email + pick a brand (Castle Lite) | New subscription appears in the list with status "active" | ☐ | |
| H3 | Click "Preview" on your new subscription | A new tab opens showing exactly what the email will look like | ☐ | |
| H4 | Click "Send test now" | Email lands in your inbox within 1–2 minutes. Subject line includes "BW Productions — Castle Lite — Weekly Digest" | ☐ | |
| H5 | Confirm: nothing in the email shows R / pricing / margin / our internal costs | Same security rule as Section D | ☐ | |
| H6 | Click "Pause" on your test subscription | Status changes to "paused", future digests won't include this | ☐ | |
| H7 | Click "Delete" to clean up your test subscription | Removed from the list | ☐ | |

**KNOWN ISSUE:** The weekly cron that fires this automatically is **not yet scheduled** (waiting on a GitHub permission Bibi needs to grant). Manual "Send test now" works fine — that's what H4 tests.

---

## Section I — Delivery Note Edit-After-Sign (the new feature)

**What it is:** Until now, once a delivery note was signed by the recipient, it was locked. As of 29 May 2026, three named office users (Bibi, Bernie, Shane') can re-open and edit a signed note. Everyone else still sees it as read-only.

| # | Test | What should happen | ✅ | Notes |
|---|---|---|---|---|
| I1 | Open <https://bwprodsystem.co.za/field/success/123> (DN26-0135, Serengeti Golf, signed) | Success page loads showing the signed delivery note | ☐ | |
| I2 | You should see a red button labelled **"🔒 Edit Signed Delivery Note (Office Only)"** below the WhatsApp button | Visible because you're logged in as marketing@ which is allowlisted | ☐ | |
| I3 | Below the red button, you should see "Logged in as Shane · Changes are audit-logged" | Confirms the system knows it's you | ☐ | |
| I4 | Click the red button | Edit form opens with a red warning banner "⚠️ Editing a Signed Delivery Note — you are editing it as **Shane** — your changes will be logged in the audit trail" | ☐ | |
| I5 | The form should be **pre-filled** with everything that was on the signed note | All fields populated, line items present, signature preserved | ☐ | |
| I6 | Change ONE field — e.g. add " — corrected" to the venue notes — then click Submit | Page redirects to the success view with your change visible | ☐ | |
| I7 | Open <https://bwprodsystem.co.za/admin/audit?entity=field_submission> | Your edit appears in the audit log with `notes` field showing from→to values | ☐ | |
| I8 | **Negative test:** open <https://bwprodsystem.co.za/field/success/123> in a **private browsing window** (logged out) | Page loads BUT the red "Edit Signed Delivery Note" button is NOT visible | ☐ | |
| I9 | While logged out, manually go to <https://bwprodsystem.co.za/field/delivery/open/123> | You should be **redirected** to /field/success/123 (not allowed to edit) | ☐ | |

**Critical:** I8 and I9 are the security tests. If you can edit a signed note while logged out — **stop and tell Bibi immediately.**

---

## Section J — Existing Delivery Note Flow (regression check)

Just to make sure the new edit-after-sign feature didn't break anything for normal users.

| # | Test | What should happen | ✅ | Notes |
|---|---|---|---|---|
| J1 | Open <https://bwprodsystem.co.za/field> (no login needed) | Field app landing page loads with the form buttons | ☐ | |
| J2 | Click "Delivery Note" | Form opens, you can fill it out fresh | ☐ | |
| J3 | Open <https://bwprodsystem.co.za/field/delivery> | List of recent delivery notes loads | ☐ | |
| J4 | Open an existing **draft** (not signed) — click it from the list | Edit form opens with the purple "Pre-loaded by Office" banner (NOT the red post-sign one) | ☐ | |
| J5 | Make a small change, fill in remaining fields, sign, submit | Note becomes signed, you land on the success page | ☐ | |
| J6 | Open that newly signed note's success page in a private window | The "Edit Signed Delivery Note" button is **NOT** visible (because you're not logged in) | ☐ | |

---

## Wrap-up

When you're done:

1. **Count your ticks.** How many tests passed?
2. **List the failures.** For each failure, send Bibi the test number + screenshot + 1-line description.
3. **One green WhatsApp message** to confirm you've finished, so Bibi knows the run is complete.

---

## What's NOT being tested today (so don't worry if you can't find it)

These are either work-in-progress, future features, or blocked on external things:

- **Flight-case packaging logic** (waiting on Monday's stock count + your full inventory list)
- **Companion-item auto-suggest** (umbrella → base, heater → gas, dance floor → trolley) — building next week
- **R2 file attachments** to delivery notes/quotes — proposed, not built yet
- **Twilio WhatsApp delivery confirmations** — waiting on Twilio approval (now confirmed, building next week)
- **Vendor verification** (VAT / BEE / tax clearance / banking) — back-burner
- **Phase 18 role tightening** — next week, when there's no Friday deadline pressure
- **Two GitHub cron jobs** (brand digest + low-stock alerts) — Bibi authorising the GitHub `workflows` permission, then they go live in 30 seconds

---

**Test run completed by:** ________________  **Date:** ________________  **Total passing:** ___ / 49
