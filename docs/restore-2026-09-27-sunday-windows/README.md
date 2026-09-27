# Restore pack — Sun 27 Sep 2026 owner rules (v2026-09-27-7)

Owner instructions (27 Sep 2026):
- Everyone at the warehouse LEFT AT 11:30 on Sunday 27 Sep (some are trying to claim 12:00). `wage_planned_hours` 2026-09-27 planned_end = 11:30.
- Warehouse ticks that day pay the VENUE rate (Sunday R114/h). `wage_owner_day_rules` force_kind = event.
- Daniel (10), Thina (3), Patrick (13) OFF.
- Takavaudza (staff 2): TWO windows — Warehouse 07:00–11:30, then House/Garden 12:30–14:14 (Life360: arrived 12:30, left 14:14).
  `staff_windows_json = {"2":[{"start":"07:00","end":"11:30","place":"Warehouse"},{"start":"12:30","end":"14:14","place":"House/Garden"}]}`
- Lebo (16) Heritage Day #9861 = 07:00–15:00, 8 h × R100 = R800 (not yet paid; due Tue 6 Oct 2026). Earlier 13:25 withdrawn.
- Lebo ledger: tick-box per line + one "Mark the TICKED shifts as PAID" button; every line shows NOT PAID until ticked.

Code: `ownerWindowsFor`, `parseOwnerWindows`, `ownerWindowOverlap` in src/index.tsx. Final submission pays only the overlapping piece
of a window; an entry entirely outside all windows is held at R0 with a red review.
