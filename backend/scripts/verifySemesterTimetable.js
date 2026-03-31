const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

async function verify() {
  try {
    const perFaculty = await pool.query(
      `SELECT cl.faculty_id, COUNT(cs.id)::int AS sessions
       FROM class_slots cl
       JOIN class_sessions cs ON cs.class_slot_id = cl.id
       WHERE cl.section_id = 1
         AND cs.type = 'REGULAR'
         AND cs.status = 'CONDUCTED'
       GROUP BY cl.faculty_id
       ORDER BY cl.faculty_id`
    );

    const sectionCollisions = await pool.query(
      `SELECT COUNT(*)::int AS c
       FROM (
         SELECT cs.date, cs.start_time, cs.end_time, cl.section_id
         FROM class_sessions cs
         JOIN class_slots cl ON cl.id = cs.class_slot_id
         WHERE cl.section_id = 1
           AND cs.type = 'REGULAR'
         GROUP BY cs.date, cs.start_time, cs.end_time, cl.section_id
         HAVING COUNT(*) > 1
       ) t`
    );

    const facultyCollisions = await pool.query(
      `SELECT COUNT(*)::int AS c
       FROM (
         SELECT cs.date, cs.start_time, cs.end_time, cl.faculty_id
         FROM class_sessions cs
         JOIN class_slots cl ON cl.id = cs.class_slot_id
         WHERE cs.type = 'REGULAR'
         GROUP BY cs.date, cs.start_time, cs.end_time, cl.faculty_id
         HAVING COUNT(*) > 1
       ) t`
    );

    const result = {
      perFaculty: perFaculty.rows,
      sectionCollisions: Number(sectionCollisions.rows[0]?.c || 0),
      facultyCollisions: Number(facultyCollisions.rows[0]?.c || 0),
    };

    const outPath = path.join(__dirname, 'timetable_check.json');
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
    console.log(`Wrote ${outPath}`);
  } catch (error) {
    const outPath = path.join(__dirname, 'timetable_check.json');
    fs.writeFileSync(outPath, JSON.stringify({ error: String(error) }, null, 2));
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

verify();
