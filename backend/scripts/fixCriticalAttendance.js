require('dotenv').config();
const pool = require('../config/db');

async function fixCritical() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Fixing Critical Students to exactly 65% attendance...');

    // Find all critical users
    const userRes = await client.query("SELECT id, email FROM users WHERE email ILIKE '%critical%'");
    if (userRes.rows.length === 0) {
      console.log('No critical students found.');
      process.exit(0);
    }

    for (const student of userRes.rows) {
      console.log(`\nProcessing ${student.email} (ID: ${student.id})...`);

      // Update baseline to 65% and fix leave balance to 1 day
      await client.query("UPDATE users SET attendance_percentage = 65, leave_balance = 1 WHERE id = $1", [student.id]);
      const { rows } = await client.query(`
         SELECT a.id, a.status
         FROM attendance a
         WHERE a.student_id = $1
         ORDER BY a.id ASC
      `, [student.id]);

      if (rows.length === 0) {
          console.log(` > No actual attendance records found for ${student.email}. Baseline is now 65%.`);
      } else {
          const total = rows.length;
          const targetPresent = Math.round(total * 0.65);
          const toAbsentCount = total - targetPresent;

          console.log(` > Total recorded sessions: ${total}. Need to set ${toAbsentCount} to ABSENT.`);

          // First mark all present
          await client.query(`UPDATE attendance SET status = 'PRESENT' WHERE student_id = $1`, [student.id]);

          // Then mark a subset absent
          if (toAbsentCount > 0) {
               const idsToAbsent = rows.slice(0, toAbsentCount).map(r => r.id);
               await client.query(`UPDATE attendance SET status = 'ABSENT' WHERE id = ANY($1::int[])`, [idsToAbsent]);
               console.log(` > Successfully changed ${idsToAbsent.length} classes to ABSENT for ${student.email}.`);
          }
      }
    }

    await client.query('COMMIT');
    console.log('\n✅ All critical students have been successfully adjusted to 65%!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
  } finally {
    client.release();
    process.exit(0);
  }
}
fixCritical();