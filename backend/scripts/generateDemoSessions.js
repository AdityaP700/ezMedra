require('dotenv').config();
const pool = require('../config/db');

async function generateDemoSessions() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Fetching class slots for IT1...');
    const slotsRes = await client.query(`
      SELECT cs.*
      FROM class_slots cs
      JOIN sections sec ON cs.section_id = sec.id
      WHERE sec.name = 'IT1'
    `);

    const slots = slotsRes.rows;
    if (slots.length === 0) {
      console.log('No slots found for IT1. Make sure seed.js has been run.');
      process.exit(1);
    }

    console.log(`Found ${slots.length} slots. Generating sessions for April/May 2026...`);

    // Generate sessions for April 2026 to Mid-May 2026
    const startDate = new Date('2026-04-01');
    const endDate = new Date('2026-05-15');

    let sessionsGenerated = 0;

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay(); // 0 (Sun) to 6 (Sat)

      // Find slots matching this day of the week
      const matchingSlots = slots.filter(s => s.day_of_week === dayOfWeek);

      for (const slot of matchingSlots) {
        const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD

        await client.query(`
          INSERT INTO class_sessions (
            class_slot_id, subject_id, faculty_id, section_id,
            date, status, type, weight
          ) VALUES ($1, $2, $3, $4, $5, 'CONDUCTED', 'REGULAR', 1)
          ON CONFLICT (class_slot_id, date, type)
          WHERE class_slot_id IS NOT NULL
          DO NOTHING
        `, [
          slot.id, slot.subject_id, slot.faculty_id, slot.section_id, dateStr
        ]);

        sessionsGenerated++;
      }
    }

    // Update the leave routing logic so all IT leaves go to Master Faculty
    // Since Master Faculty is seeded, we check if they exist
    const masterRes = await client.query(`SELECT id FROM users WHERE email = 'master.faculty@slms.com'`);
    if (masterRes.rows.length > 0) {
      const masterId = masterRes.rows[0].id;

      // Update all teaching roles for IT1 subjects to have Master Faculty as the PRIMARY approver
      // and others as ASSISTANT with approveLeave: false

      // Get all subjects for IT1
      await client.query(`
        UPDATE teaching_roles
        SET permissions = '{"markAttendance": true, "approveLeave": false}'::jsonb
        WHERE subject_id IN (SELECT subject_id FROM class_slots WHERE section_id = (SELECT id FROM sections WHERE name = 'IT1' LIMIT 1))
      `);

      await client.query(`
        UPDATE teaching_roles
        SET permissions = '{"markAttendance": true, "approveLeave": true}'::jsonb, role = 'PRIMARY'
        WHERE user_id = $1
      `, [masterId]);

      console.log('Set Master Faculty as the primary approver for all IT1 subjects.');
    }

    await client.query('COMMIT');
    console.log(`Successfully generated class sessions for April to Mid-May 2026.`);
    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err);
    process.exit(1);
  } finally {
    client.release();
  }
}

generateDemoSessions();