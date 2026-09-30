# 29 Sep 2026 — Sonop team 14:00 + Lebo venue rate R75 (v2026-09-29-3)

## Sat 26 Sep — Sonop (76 Murray St, Brooklyn) set-up team worked to 14:00 (owner)
| Row | Person | Now | Amount |
|---|---|---|---|
| 9922 | Solomon | 06:00–14:00 | 8 h × R95 = R760 (was R665) |
| 9899 | Bhekizitha | 06:00–14:00 | R760 (was R665) |
| 9897 | Daniel | 07:00–14:00 | 7 h × R95 = R665 (was R570) |
| 9863 | Lebo | 06:00–14:00 | 8 h × R75 = R600 (was R350) |
| 9886+9887 | Erence | 06:00–14:00 | R760 (accepted, option B) |
| draft 935 | Thandanani | 06:00–14:00 | R760 when final-submitted |
NOT at Sonop, stay 13:00: Patrick 9869 (Brooklyn CDMA, R665), Joshua draft 921, Taka draft 930 (warehouse), Petrus 9909 (R640 fixed). John Music Bus own times.
Nobody had a Saturday Botanical Gardens entry (Botanical was Fri 25: Joshua, Erick).
Day rule 2026-09-26 staff_windows_json holds these windows; a per-person window now overrides the general 13:00 "CLAIMED PAST" pill.

## Lebo rate rule (owner 29 Sep)
Warehouse (loading etc.) R50/h · venue / collection / setup / event R75/h (`STUDENT_EVENT_HOURLY`) · Sunday R75/h anywhere · public holiday R100/h · no meeting deduction.
`ownerPayKind` → 'student_warehouse' when work type or wording says warehouse, else 'student' (R75).
Re-priced: 9862 Fri 25 collection 9 h × R75 = R675 (was R450); 9863 Sat as above; 9877 Mon 28 collection R675 (was R450). 9861 Thu R800, 9867 Sun R337,50, 9879 Tue warehouse R450 unchanged.
Ledger due Tue 6 Oct: R800 + R675 + R600 + R337,50 + R675 + R450 = R3 537,50 (through Tue 29 Sep). Wed–Fri this week are event days → R75.

### Update 29 Sep (v2026-09-29-4)
- Daniel #9897 Sat 26: NOT on the Sonop team (only 07:00 starter; enters 07:00 on every shift) — reverted to 07:00–13:00 = R570 (owner option B).
  Sonop 14:00 team is: Solomon, Bhekizitha, Lebo, Thandanani, Erence.
- Lebo rate is read from WHAT HE WRITES (owner: "just read what he writes"): `studentKindFromWording()` —
  event words (collect / setup / deliver / drop-off / breakdown / strike / standby / activation / event / venue / golf / stadium / hotel /
  arena / festival / wedding / function / install / rig) → R75, and they WIN over the word "warehouse";
  otherwise warehouse words (load / offload / prepar / pack / clean / wash / sort / stock / receiv / warehouse) or Warehouse work type → R50;
  anything else → R75. No owner question needed.
