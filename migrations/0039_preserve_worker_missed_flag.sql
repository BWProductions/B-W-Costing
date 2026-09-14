-- Preserve the worker/app-supplied missed_previous_week=1 flag.
-- The 0037/0038 triggers recomputed it purely from payroll_week_start, which the
-- upstream wages app never sets, so every missed shift was reset to 0.

DROP TRIGGER IF EXISTS wage_shift_drafts_after_insert_system_review;
CREATE TRIGGER wage_shift_drafts_after_insert_system_review
AFTER INSERT ON wage_shift_drafts
FOR EACH ROW
BEGIN
  UPDATE wage_shift_drafts
     SET missed_previous_week = CASE
           WHEN NEW.missed_previous_week = 1 THEN 1
           WHEN NEW.payroll_week_start IS NOT NULL
            AND NEW.work_date IS NOT NULL
            AND NEW.work_date < NEW.payroll_week_start THEN 1
           ELSE 0
         END,
         payroll_note = NULLIF(
           TRIM(
             CASE
               WHEN NEW.payroll_note IS NOT NULL
                AND TRIM(NEW.payroll_note) <> ''
                AND INSTR(NEW.payroll_note, 'System review:') = 0
               THEN TRIM(NEW.payroll_note) || CHAR(10) || CHAR(10)
               ELSE ''
             END ||
             'System review: claimed against payroll week ' || COALESCE(NULLIF(TRIM(NEW.payroll_week_start), ''), 'not supplied') ||
             '; exact work date ' || COALESCE(NULLIF(TRIM(NEW.work_date), ''), 'not supplied') ||
             '; venue ' || COALESCE(NULLIF(TRIM(NEW.outlet_venue), ''), 'not supplied') ||
             '; work type / role ' || COALESCE(NULLIF(TRIM(NEW.work_type), ''), 'not supplied') ||
             '; description ' || COALESCE(NULLIF(TRIM(NEW.work_description), ''), 'not supplied') ||
             '; captured time ' || COALESCE(NULLIF(TRIM(NEW.start_time), ''), '??') || '-' || COALESCE(NULLIF(TRIM(NEW.end_time), ''), '??') ||
             '; belongs to previous payroll ' || CASE
               WHEN NEW.payroll_week_start IS NOT NULL
                AND NEW.work_date IS NOT NULL
                AND NEW.work_date < NEW.payroll_week_start THEN 'yes'
               ELSE 'no'
             END || '.' ||
             CASE
               WHEN EXISTS (
                 SELECT 1
                   FROM wage_shift_drafts d
                  WHERE d.staff_id = NEW.staff_id
                    AND d.id <> NEW.id
                    AND d.work_date = NEW.work_date
                    AND COALESCE(d.status, 'draft') IN ('draft', 'submitted')
                    AND COALESCE(d.start_time, '') < COALESCE(NEW.end_time, '99:99')
                    AND COALESCE(d.end_time, '99:99') > COALESCE(NEW.start_time, '')
               )
                OR EXISTS (
                 SELECT 1
                   FROM wage_shifts s
                  WHERE s.staff_id = NEW.staff_id
                    AND s.work_date = NEW.work_date
                    AND COALESCE(s.start_time, '') < COALESCE(NEW.end_time, '99:99')
                    AND COALESCE(s.end_time, '99:99') > COALESCE(NEW.start_time, '')
               )
               THEN CHAR(10) || 'Conflict review: possible already-claimed or overlapping shift detected for backend review only. Do not block staff entry. Do not auto-call it duplicate. Existing entries on this date overlap the captured time ' || COALESCE(NULLIF(TRIM(NEW.start_time), ''), '??') || '-' || COALESCE(NULLIF(TRIM(NEW.end_time), ''), '??') || '. Office must review manually and correct payable hours if needed.'
               ELSE ''
             END
           ),
           ''
         )
   WHERE id = NEW.id;

  DELETE FROM wage_payroll_reviews
   WHERE issue_key = 'manual_overlap_review|draft:' || NEW.id;

  INSERT INTO wage_payroll_reviews (
    issue_key,
    status,
    warning_kind,
    severity,
    staff_id,
    staff_name,
    work_date,
    payroll_week_start,
    subject_source,
    subject_shift_id,
    compared_source,
    compared_shift_id,
    compared_payroll_week_start,
    warning_reason,
    issue_summary,
    original_hours,
    compared_hours,
    previously_paid_hours,
    system_proposed_payable_hours,
    facts_hash,
    subject_snapshot_json,
    compared_snapshot_json,
    system_snapshot_json
  )
  SELECT
    'manual_overlap_review|draft:' || NEW.id,
    'OPEN',
    'possible_duplicate_manual_check',
    'orange',
    NEW.staff_id,
    COALESCE((SELECT display_name FROM wage_staff WHERE id = NEW.staff_id), 'Unknown staff'),
    NEW.work_date,
    NEW.payroll_week_start,
    'draft',
    NEW.id,
    COALESCE(
      (SELECT 'draft'
         FROM wage_shift_drafts d
        WHERE d.staff_id = NEW.staff_id
          AND d.id <> NEW.id
          AND d.work_date = NEW.work_date
          AND COALESCE(d.status, 'draft') IN ('draft', 'submitted')
          AND COALESCE(d.start_time, '') < COALESCE(NEW.end_time, '99:99')
          AND COALESCE(d.end_time, '99:99') > COALESCE(NEW.start_time, '')
        ORDER BY d.id
        LIMIT 1),
      (SELECT 'shift'
         FROM wage_shifts s
        WHERE s.staff_id = NEW.staff_id
          AND s.work_date = NEW.work_date
          AND COALESCE(s.start_time, '') < COALESCE(NEW.end_time, '99:99')
          AND COALESCE(s.end_time, '99:99') > COALESCE(NEW.start_time, '')
        ORDER BY s.id
        LIMIT 1),
      'shift'
    ),
    COALESCE(
      (SELECT d.id
         FROM wage_shift_drafts d
        WHERE d.staff_id = NEW.staff_id
          AND d.id <> NEW.id
          AND d.work_date = NEW.work_date
          AND COALESCE(d.status, 'draft') IN ('draft', 'submitted')
          AND COALESCE(d.start_time, '') < COALESCE(NEW.end_time, '99:99')
          AND COALESCE(d.end_time, '99:99') > COALESCE(NEW.start_time, '')
        ORDER BY d.id
        LIMIT 1),
      (SELECT s.id
         FROM wage_shifts s
        WHERE s.staff_id = NEW.staff_id
          AND s.work_date = NEW.work_date
          AND COALESCE(s.start_time, '') < COALESCE(NEW.end_time, '99:99')
          AND COALESCE(s.end_time, '99:99') > COALESCE(NEW.start_time, '')
        ORDER BY s.id
        LIMIT 1)
    ),
    COALESCE(
      (SELECT d.payroll_week_start
         FROM wage_shift_drafts d
        WHERE d.staff_id = NEW.staff_id
          AND d.id <> NEW.id
          AND d.work_date = NEW.work_date
          AND COALESCE(d.status, 'draft') IN ('draft', 'submitted')
          AND COALESCE(d.start_time, '') < COALESCE(NEW.end_time, '99:99')
          AND COALESCE(d.end_time, '99:99') > COALESCE(NEW.start_time, '')
        ORDER BY d.id
        LIMIT 1),
      (SELECT s.payroll_week_start
         FROM wage_shifts s
        WHERE s.staff_id = NEW.staff_id
          AND s.work_date = NEW.work_date
          AND COALESCE(s.start_time, '') < COALESCE(NEW.end_time, '99:99')
          AND COALESCE(s.end_time, '99:99') > COALESCE(NEW.start_time, '')
        ORDER BY s.id
        LIMIT 1)
    ),
    'Manual overlap / possible already-claimed review: the same employee has another overlapping entry on ' || COALESCE(NEW.work_date, 'unknown date') || ' for ' || COALESCE(NEW.start_time, '??') || '-' || COALESCE(NEW.end_time, '??') || '. Do not block staff entry. Do not auto-call it duplicate. Office must review payable hours manually.',
    'Manual overlap review — ' || COALESCE((SELECT display_name FROM wage_staff WHERE id = NEW.staff_id), 'Unknown staff') || ' — ' || COALESCE(NEW.work_date, 'unknown date'),
    NULL,
    COALESCE(
      (SELECT NULL
         FROM wage_shift_drafts d
        WHERE d.staff_id = NEW.staff_id
          AND d.id <> NEW.id
          AND d.work_date = NEW.work_date
          AND COALESCE(d.status, 'draft') IN ('draft', 'submitted')
          AND COALESCE(d.start_time, '') < COALESCE(NEW.end_time, '99:99')
          AND COALESCE(d.end_time, '99:99') > COALESCE(NEW.start_time, '')
        LIMIT 1),
      (SELECT s.hours_worked
         FROM wage_shifts s
        WHERE s.staff_id = NEW.staff_id
          AND s.work_date = NEW.work_date
          AND COALESCE(s.start_time, '') < COALESCE(NEW.end_time, '99:99')
          AND COALESCE(s.end_time, '99:99') > COALESCE(NEW.start_time, '')
        ORDER BY s.id
        LIMIT 1)
    ),
    NULL,
    NULL,
    json_object(
      'kind', 'possible_duplicate_manual_check',
      'draftId', NEW.id,
      'staffId', NEW.staff_id,
      'workDate', NEW.work_date,
      'startTime', NEW.start_time,
      'endTime', NEW.end_time,
      'payrollWeekStart', NEW.payroll_week_start
    ),
    json_object(
      'shiftId', NEW.id,
      'source', 'draft',
      'staffId', NEW.staff_id,
      'employee', COALESCE((SELECT display_name FROM wage_staff WHERE id = NEW.staff_id), 'Unknown staff'),
      'workDate', NEW.work_date,
      'venue', NEW.outlet_venue,
      'area', NEW.area,
      'workType', NEW.work_type,
      'workDescription', NEW.work_description,
      'startTime', NEW.start_time,
      'endTime', NEW.end_time,
      'payrollWeekStart', NEW.payroll_week_start,
      'enteredByType', 'worker',
      'previouslyPaid', CASE WHEN NEW.payroll_week_start IS NOT NULL AND NEW.work_date IS NOT NULL AND NEW.work_date < NEW.payroll_week_start THEN 1 ELSE 0 END
    ),
    COALESCE(
      (SELECT json_object(
          'shiftId', d.id,
          'source', 'draft',
          'staffId', d.staff_id,
          'employee', COALESCE((SELECT ws.display_name FROM wage_staff ws WHERE ws.id = d.staff_id), 'Unknown staff'),
          'workDate', d.work_date,
          'venue', d.outlet_venue,
          'area', d.area,
          'workType', d.work_type,
          'workDescription', d.work_description,
          'startTime', d.start_time,
          'endTime', d.end_time,
          'payrollWeekStart', d.payroll_week_start
        )
         FROM wage_shift_drafts d
        WHERE d.staff_id = NEW.staff_id
          AND d.id <> NEW.id
          AND d.work_date = NEW.work_date
          AND COALESCE(d.status, 'draft') IN ('draft', 'submitted')
          AND COALESCE(d.start_time, '') < COALESCE(NEW.end_time, '99:99')
          AND COALESCE(d.end_time, '99:99') > COALESCE(NEW.start_time, '')
        ORDER BY d.id
        LIMIT 1),
      (SELECT json_object(
          'shiftId', s.id,
          'source', 'shift',
          'staffId', s.staff_id,
          'employee', COALESCE((SELECT ws.display_name FROM wage_staff ws WHERE ws.id = s.staff_id), 'Unknown staff'),
          'workDate', s.work_date,
          'venue', s.outlet_venue,
          'area', s.area,
          'eventName', s.event_name,
          'workType', s.work_type,
          'workDescription', s.work_description,
          'startTime', s.start_time,
          'endTime', s.end_time,
          'hours', s.hours_worked,
          'payrollWeekStart', s.payroll_week_start,
          'previouslyPaid', s.missed_previous_week
        )
         FROM wage_shifts s
        WHERE s.staff_id = NEW.staff_id
          AND s.work_date = NEW.work_date
          AND COALESCE(s.start_time, '') < COALESCE(NEW.end_time, '99:99')
          AND COALESCE(s.end_time, '99:99') > COALESCE(NEW.start_time, '')
        ORDER BY s.id
        LIMIT 1)
    ),
    json_object(
      'comparisonLabel', 'manual overlap review only',
      'warningTitle', 'Manual overlap review',
      'humanReason', 'Do not block staff entry. Do not auto-call it duplicate. Office must review overlapping times manually and correct payable hours only where needed.',
      'staffBlocking', 0,
      'autoDuplicate', 0,
      'conflictDetected', 1
    )
  WHERE EXISTS (
    SELECT 1
      FROM wage_shift_drafts d
     WHERE d.staff_id = NEW.staff_id
       AND d.id <> NEW.id
       AND d.work_date = NEW.work_date
       AND COALESCE(d.status, 'draft') IN ('draft', 'submitted')
       AND COALESCE(d.start_time, '') < COALESCE(NEW.end_time, '99:99')
       AND COALESCE(d.end_time, '99:99') > COALESCE(NEW.start_time, '')
    UNION ALL
    SELECT 1
      FROM wage_shifts s
     WHERE s.staff_id = NEW.staff_id
       AND s.work_date = NEW.work_date
       AND COALESCE(s.start_time, '') < COALESCE(NEW.end_time, '99:99')
       AND COALESCE(s.end_time, '99:99') > COALESCE(NEW.start_time, '')
  );
END;

DROP TRIGGER IF EXISTS wage_shift_drafts_after_update_system_review;
CREATE TRIGGER wage_shift_drafts_after_update_system_review
AFTER UPDATE OF work_date, outlet_venue, area, work_type, work_description, start_time, end_time, payroll_week_start, status ON wage_shift_drafts
FOR EACH ROW
BEGIN
  UPDATE wage_shift_drafts
     SET missed_previous_week = CASE
           WHEN NEW.missed_previous_week = 1 THEN 1
           WHEN NEW.payroll_week_start IS NOT NULL
            AND NEW.work_date IS NOT NULL
            AND NEW.work_date < NEW.payroll_week_start THEN 1
           ELSE 0
         END,
         payroll_note = NULLIF(
           TRIM(
             CASE
               WHEN NEW.payroll_note IS NOT NULL
                AND TRIM(NEW.payroll_note) <> ''
                AND INSTR(NEW.payroll_note, 'System review:') = 0
               THEN TRIM(NEW.payroll_note) || CHAR(10) || CHAR(10)
               ELSE ''
             END ||
             'System review: claimed against payroll week ' || COALESCE(NULLIF(TRIM(NEW.payroll_week_start), ''), 'not supplied') ||
             '; exact work date ' || COALESCE(NULLIF(TRIM(NEW.work_date), ''), 'not supplied') ||
             '; venue ' || COALESCE(NULLIF(TRIM(NEW.outlet_venue), ''), 'not supplied') ||
             '; work type / role ' || COALESCE(NULLIF(TRIM(NEW.work_type), ''), 'not supplied') ||
             '; description ' || COALESCE(NULLIF(TRIM(NEW.work_description), ''), 'not supplied') ||
             '; captured time ' || COALESCE(NULLIF(TRIM(NEW.start_time), ''), '??') || '-' || COALESCE(NULLIF(TRIM(NEW.end_time), ''), '??') ||
             '; belongs to previous payroll ' || CASE
               WHEN NEW.payroll_week_start IS NOT NULL
                AND NEW.work_date IS NOT NULL
                AND NEW.work_date < NEW.payroll_week_start THEN 'yes'
               ELSE 'no'
             END || '.' ||
             CASE
               WHEN EXISTS (
                 SELECT 1
                   FROM wage_shift_drafts d
                  WHERE d.staff_id = NEW.staff_id
                    AND d.id <> NEW.id
                    AND d.work_date = NEW.work_date
                    AND COALESCE(d.status, 'draft') IN ('draft', 'submitted')
                    AND COALESCE(d.start_time, '') < COALESCE(NEW.end_time, '99:99')
                    AND COALESCE(d.end_time, '99:99') > COALESCE(NEW.start_time, '')
               )
                OR EXISTS (
                 SELECT 1
                   FROM wage_shifts s
                  WHERE s.staff_id = NEW.staff_id
                    AND s.work_date = NEW.work_date
                    AND COALESCE(s.start_time, '') < COALESCE(NEW.end_time, '99:99')
                    AND COALESCE(s.end_time, '99:99') > COALESCE(NEW.start_time, '')
               )
               THEN CHAR(10) || 'Conflict review: possible already-claimed or overlapping shift detected for backend review only. Do not block staff entry. Do not auto-call it duplicate. Existing entries on this date overlap the captured time ' || COALESCE(NULLIF(TRIM(NEW.start_time), ''), '??') || '-' || COALESCE(NULLIF(TRIM(NEW.end_time), ''), '??') || '. Office must review manually and correct payable hours if needed.'
               ELSE ''
             END
           ),
           ''
         )
   WHERE id = NEW.id;

  DELETE FROM wage_payroll_reviews
   WHERE issue_key = 'manual_overlap_review|draft:' || NEW.id;

  INSERT INTO wage_payroll_reviews (
    issue_key,
    status,
    warning_kind,
    severity,
    staff_id,
    staff_name,
    work_date,
    payroll_week_start,
    subject_source,
    subject_shift_id,
    compared_source,
    compared_shift_id,
    compared_payroll_week_start,
    warning_reason,
    issue_summary,
    original_hours,
    compared_hours,
    previously_paid_hours,
    system_proposed_payable_hours,
    facts_hash,
    subject_snapshot_json,
    compared_snapshot_json,
    system_snapshot_json
  )
  SELECT
    'manual_overlap_review|draft:' || NEW.id,
    'OPEN',
    'possible_duplicate_manual_check',
    'orange',
    NEW.staff_id,
    COALESCE((SELECT display_name FROM wage_staff WHERE id = NEW.staff_id), 'Unknown staff'),
    NEW.work_date,
    NEW.payroll_week_start,
    'draft',
    NEW.id,
    COALESCE(
      (SELECT 'draft'
         FROM wage_shift_drafts d
        WHERE d.staff_id = NEW.staff_id
          AND d.id <> NEW.id
          AND d.work_date = NEW.work_date
          AND COALESCE(d.status, 'draft') IN ('draft', 'submitted')
          AND COALESCE(d.start_time, '') < COALESCE(NEW.end_time, '99:99')
          AND COALESCE(d.end_time, '99:99') > COALESCE(NEW.start_time, '')
        ORDER BY d.id
        LIMIT 1),
      (SELECT 'shift'
         FROM wage_shifts s
        WHERE s.staff_id = NEW.staff_id
          AND s.work_date = NEW.work_date
          AND COALESCE(s.start_time, '') < COALESCE(NEW.end_time, '99:99')
          AND COALESCE(s.end_time, '99:99') > COALESCE(NEW.start_time, '')
        ORDER BY s.id
        LIMIT 1),
      'shift'
    ),
    COALESCE(
      (SELECT d.id
         FROM wage_shift_drafts d
        WHERE d.staff_id = NEW.staff_id
          AND d.id <> NEW.id
          AND d.work_date = NEW.work_date
          AND COALESCE(d.status, 'draft') IN ('draft', 'submitted')
          AND COALESCE(d.start_time, '') < COALESCE(NEW.end_time, '99:99')
          AND COALESCE(d.end_time, '99:99') > COALESCE(NEW.start_time, '')
        ORDER BY d.id
        LIMIT 1),
      (SELECT s.id
         FROM wage_shifts s
        WHERE s.staff_id = NEW.staff_id
          AND s.work_date = NEW.work_date
          AND COALESCE(s.start_time, '') < COALESCE(NEW.end_time, '99:99')
          AND COALESCE(s.end_time, '99:99') > COALESCE(NEW.start_time, '')
        ORDER BY s.id
        LIMIT 1)
    ),
    COALESCE(
      (SELECT d.payroll_week_start
         FROM wage_shift_drafts d
        WHERE d.staff_id = NEW.staff_id
          AND d.id <> NEW.id
          AND d.work_date = NEW.work_date
          AND COALESCE(d.status, 'draft') IN ('draft', 'submitted')
          AND COALESCE(d.start_time, '') < COALESCE(NEW.end_time, '99:99')
          AND COALESCE(d.end_time, '99:99') > COALESCE(NEW.start_time, '')
        ORDER BY d.id
        LIMIT 1),
      (SELECT s.payroll_week_start
         FROM wage_shifts s
        WHERE s.staff_id = NEW.staff_id
          AND s.work_date = NEW.work_date
          AND COALESCE(s.start_time, '') < COALESCE(NEW.end_time, '99:99')
          AND COALESCE(s.end_time, '99:99') > COALESCE(NEW.start_time, '')
        ORDER BY s.id
        LIMIT 1)
    ),
    'Manual overlap / possible already-claimed review: the same employee has another overlapping entry on ' || COALESCE(NEW.work_date, 'unknown date') || ' for ' || COALESCE(NEW.start_time, '??') || '-' || COALESCE(NEW.end_time, '??') || '. Do not block staff entry. Do not auto-call it duplicate. Office must review payable hours manually.',
    'Manual overlap review — ' || COALESCE((SELECT display_name FROM wage_staff WHERE id = NEW.staff_id), 'Unknown staff') || ' — ' || COALESCE(NEW.work_date, 'unknown date'),
    NULL,
    COALESCE(
      (SELECT NULL
         FROM wage_shift_drafts d
        WHERE d.staff_id = NEW.staff_id
          AND d.id <> NEW.id
          AND d.work_date = NEW.work_date
          AND COALESCE(d.status, 'draft') IN ('draft', 'submitted')
          AND COALESCE(d.start_time, '') < COALESCE(NEW.end_time, '99:99')
          AND COALESCE(d.end_time, '99:99') > COALESCE(NEW.start_time, '')
        LIMIT 1),
      (SELECT s.hours_worked
         FROM wage_shifts s
        WHERE s.staff_id = NEW.staff_id
          AND s.work_date = NEW.work_date
          AND COALESCE(s.start_time, '') < COALESCE(NEW.end_time, '99:99')
          AND COALESCE(s.end_time, '99:99') > COALESCE(NEW.start_time, '')
        ORDER BY s.id
        LIMIT 1)
    ),
    NULL,
    NULL,
    json_object(
      'kind', 'possible_duplicate_manual_check',
      'draftId', NEW.id,
      'staffId', NEW.staff_id,
      'workDate', NEW.work_date,
      'startTime', NEW.start_time,
      'endTime', NEW.end_time,
      'payrollWeekStart', NEW.payroll_week_start
    ),
    json_object(
      'shiftId', NEW.id,
      'source', 'draft',
      'staffId', NEW.staff_id,
      'employee', COALESCE((SELECT display_name FROM wage_staff WHERE id = NEW.staff_id), 'Unknown staff'),
      'workDate', NEW.work_date,
      'venue', NEW.outlet_venue,
      'area', NEW.area,
      'workType', NEW.work_type,
      'workDescription', NEW.work_description,
      'startTime', NEW.start_time,
      'endTime', NEW.end_time,
      'payrollWeekStart', NEW.payroll_week_start,
      'enteredByType', 'worker',
      'previouslyPaid', CASE WHEN NEW.payroll_week_start IS NOT NULL AND NEW.work_date IS NOT NULL AND NEW.work_date < NEW.payroll_week_start THEN 1 ELSE 0 END
    ),
    COALESCE(
      (SELECT json_object(
          'shiftId', d.id,
          'source', 'draft',
          'staffId', d.staff_id,
          'employee', COALESCE((SELECT ws.display_name FROM wage_staff ws WHERE ws.id = d.staff_id), 'Unknown staff'),
          'workDate', d.work_date,
          'venue', d.outlet_venue,
          'area', d.area,
          'workType', d.work_type,
          'workDescription', d.work_description,
          'startTime', d.start_time,
          'endTime', d.end_time,
          'payrollWeekStart', d.payroll_week_start
        )
         FROM wage_shift_drafts d
        WHERE d.staff_id = NEW.staff_id
          AND d.id <> NEW.id
          AND d.work_date = NEW.work_date
          AND COALESCE(d.status, 'draft') IN ('draft', 'submitted')
          AND COALESCE(d.start_time, '') < COALESCE(NEW.end_time, '99:99')
          AND COALESCE(d.end_time, '99:99') > COALESCE(NEW.start_time, '')
        ORDER BY d.id
        LIMIT 1),
      (SELECT json_object(
          'shiftId', s.id,
          'source', 'shift',
          'staffId', s.staff_id,
          'employee', COALESCE((SELECT ws.display_name FROM wage_staff ws WHERE ws.id = s.staff_id), 'Unknown staff'),
          'workDate', s.work_date,
          'venue', s.outlet_venue,
          'area', s.area,
          'eventName', s.event_name,
          'workType', s.work_type,
          'workDescription', s.work_description,
          'startTime', s.start_time,
          'endTime', s.end_time,
          'hours', s.hours_worked,
          'payrollWeekStart', s.payroll_week_start,
          'previouslyPaid', s.missed_previous_week
        )
         FROM wage_shifts s
        WHERE s.staff_id = NEW.staff_id
          AND s.work_date = NEW.work_date
          AND COALESCE(s.start_time, '') < COALESCE(NEW.end_time, '99:99')
          AND COALESCE(s.end_time, '99:99') > COALESCE(NEW.start_time, '')
        ORDER BY s.id
        LIMIT 1)
    ),
    json_object(
      'comparisonLabel', 'manual overlap review only',
      'warningTitle', 'Manual overlap review',
      'humanReason', 'Do not block staff entry. Do not auto-call it duplicate. Office must review overlapping times manually and correct payable hours only where needed.',
      'staffBlocking', 0,
      'autoDuplicate', 0,
      'conflictDetected', 1
    )
  WHERE EXISTS (
    SELECT 1
      FROM wage_shift_drafts d
     WHERE d.staff_id = NEW.staff_id
       AND d.id <> NEW.id
       AND d.work_date = NEW.work_date
       AND COALESCE(d.status, 'draft') IN ('draft', 'submitted')
       AND COALESCE(d.start_time, '') < COALESCE(NEW.end_time, '99:99')
       AND COALESCE(d.end_time, '99:99') > COALESCE(NEW.start_time, '')
    UNION ALL
    SELECT 1
      FROM wage_shifts s
     WHERE s.staff_id = NEW.staff_id
       AND s.work_date = NEW.work_date
       AND COALESCE(s.start_time, '') < COALESCE(NEW.end_time, '99:99')
       AND COALESCE(s.end_time, '99:99') > COALESCE(NEW.start_time, '')
  );
END;
