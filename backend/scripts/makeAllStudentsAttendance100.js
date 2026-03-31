const pool = require('../config/db');

async function makeAllStudentsAttendance100() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const upsertResult = await client.query(
      `WITH student_ctx AS (
         SELECT id, department_id, semester, section_id
         FROM users
         WHERE role = 'student' AND is_active = true
       ), sessions AS (
         SELECT cs.id AS class_session_id,
                cl.section_id,
                s.department_id,
                s.semester
         FROM class_sessions cs
         JOIN class_slots cl ON cl.id = cs.class_slot_id
         JOIN subjects s ON s.id = cl.subject_id
         LEFT JOIN holidays h ON h.date = cs.date
         WHERE cs.status = 'CONDUCTED'
           AND h.id IS NULL
       )
       INSERT INTO attendance (student_id, class_session_id, status)
       SELECT st.id, sess.class_session_id, 'PRESENT'
       FROM student_ctx st
       JOIN sessions sess
         ON (sess.section_id IS NOT NULL AND sess.section_id = st.section_id)
         OR (sess.section_id IS NULL AND sess.department_id = st.department_id AND sess.semester = st.semester)
       ON CONFLICT (student_id, class_session_id)
       DO UPDATE SET
         status = 'PRESENT',
         marked_at = CURRENT_TIMESTAMP
       RETURNING 1`
    );

    const forcePresentResult = await client.query(
      `UPDATE attendance
       SET status = 'PRESENT',
           marked_at = CURRENT_TIMESTAMP
       WHERE status <> 'PRESENT'
       RETURNING 1`
    );

    const usersResult = await client.query(
      `UPDATE users
       SET attendance_percentage = 100,
           updated_at = CURRENT_TIMESTAMP
       WHERE role = 'student'
       RETURNING id`
    );

    await client.query('COMMIT');

    console.log('Attendance reset completed.');
    console.log(`Attendance rows upserted: ${upsertResult.rowCount}`);
    console.log(`Attendance rows changed to PRESENT: ${forcePresentResult.rowCount}`);
    console.log(`Students set to 100%: ${usersResult.rowCount}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to reset attendance:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

makeAllStudentsAttendance100();
