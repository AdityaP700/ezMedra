const pool = require('../../config/db');

class CommonRepository {
  async logAudit({ actorId, action, entityType, entityId, metadata }, client = null) {
    const executor = client || pool;
    await executor.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [actorId || null, action, entityType, entityId || null, metadata || null]
    );
  }

  async getIdempotency(actorId, key, action) {
    const result = await pool.query(
      `SELECT response_payload
       FROM idempotency_keys
       WHERE actor_id = $1 AND key = $2 AND action = $3`,
      [actorId, key, action]
    );
    return result.rows[0]?.response_payload || null;
  }

  async saveIdempotency(actorId, key, action, responsePayload) {
    await pool.query(
      `INSERT INTO idempotency_keys (actor_id, key, action, response_payload)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO UPDATE
       SET response_payload = EXCLUDED.response_payload`,
      [actorId, key, action, responsePayload]
    );
  }

  async createNotifications(notifications, client = null) {
    if (!notifications || notifications.length === 0) {
      return;
    }

    const executor = client || pool;
    const values = [];
    const placeholders = notifications.map((n, idx) => {
      const base = idx * 3;
      values.push(n.toUserId, n.title, n.message);
      return `($${base + 1}, $${base + 2}, $${base + 3})`;
    }).join(', ');

    await executor.query(
      `INSERT INTO notifications (to_user_id, title, message)
       VALUES ${placeholders}`,
      values
    );
  }

  async enqueueNotificationEvent(eventType, payload, client = null) {
    const executor = client || pool;
    const result = await executor.query(
      `INSERT INTO notification_queue (event_type, payload)
       VALUES ($1, $2)
       RETURNING *`,
      [eventType, payload]
    );
    return result.rows[0];
  }

  async processNotificationQueue(limit = 50) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `SELECT id, event_type, payload, retry_count
         FROM notification_queue
         WHERE status = 'PENDING'
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [limit]
      );

      let processed = 0;
      for (const event of result.rows) {
        try {
          const toUserId = event.payload?.toUserId;
          const title = event.payload?.title;
          const message = event.payload?.message;

          if (!toUserId || !title || !message) {
            throw new Error('Invalid notification payload.');
          }

          await client.query(
            `INSERT INTO notifications (to_user_id, title, message)
             VALUES ($1, $2, $3)`,
            [toUserId, title, message]
          );

          await client.query(
            `UPDATE notification_queue
             SET status = 'SENT', processed_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [event.id]
          );
          processed += 1;
        } catch (_error) {
          const nextRetry = Number(event.retry_count || 0) + 1;
          const nextStatus = nextRetry >= 3 ? 'FAILED' : 'PENDING';
          await client.query(
            `UPDATE notification_queue
             SET status = $2,
                 retry_count = $3,
                 processed_at = CASE WHEN $2 = 'FAILED' THEN CURRENT_TIMESTAMP ELSE processed_at END
             WHERE id = $1`,
            [event.id, nextStatus, nextRetry]
          );
        }
      }

      await client.query('COMMIT');
      return { picked: result.rows.length, processed };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getUserNotifications(userId, limit = 20) {
    const [itemsResult, unreadResult] = await Promise.all([
      pool.query(
        `SELECT id, title, message, created_at, read_at
         FROM notifications
         WHERE to_user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, limit]
      ),
      pool.query(
        `SELECT COUNT(*)::int as unread_count
         FROM notifications
         WHERE to_user_id = $1 AND read_at IS NULL`,
        [userId]
      ),
    ]);

    return {
      items: itemsResult.rows,
      unreadCount: Number(unreadResult.rows[0]?.unread_count || 0),
    };
  }

  async markNotificationRead(id, userId) {
    const result = await pool.query(
      `UPDATE notifications
       SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
       WHERE id = $1 AND to_user_id = $2
       RETURNING id, read_at`,
      [id, userId]
    );
    return result.rows[0] || null;
  }

  async getAuditLogs({ limit = 100 } = {}) {
    const result = await pool.query(
      `SELECT al.*, u.first_name || ' ' || u.last_name as actor_name
       FROM audit_logs al
       LEFT JOIN users u ON al.actor_id = u.id
       ORDER BY al.created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }
}

module.exports = new CommonRepository();
