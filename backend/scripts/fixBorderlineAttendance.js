require('dotenv').config();
const pool = require('../config/db');

async function fixBorderline() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Fixing Borderline Students to exactly 86% attendance...');

    // Find all borderline users
    const userRes = await client.query("SELECT id, email FROM users WHERE email ILIKE '%borderline%'");
    if (userRes.rows.length === 0) {
      console.log('No borderline students found.');
      process.exit(0);
    }

    for (const student of userRes.rows) {
      console.log(`\nProcessing ${student.email} (ID: ${student.id})...`);

      // Update baseline and balance
      await client.query("UPDATE users SET attendance_percentage = 86, leave_balance = 8 WHERE id = $1", [student.id]);
      const { rows } = await client.query(`
         SELECT a.id, a.status
         FROM attendance a
         WHERE a.student_id = $1
         ORDER BY a.id ASC
      `, [student.id]);

      if (rows.length === 0) {
          console.log(` > No actual attendance records found for ${student.email}. Baseline is now 86%.`);
      } else {
          const total = rows.length;
          const targetPresent = Math.round(total * 0.86);
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
    console.log('\n✅ All borderline students have been successfully adjusted to 86%!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
  } finally {
    client.release();
    process.exit(0);
  }
}
fixBorderline();