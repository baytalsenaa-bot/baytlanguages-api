// lib/audit.js — writes an entry to audit_logs for admin actions.
async function logAction(pool, { userId, action, entityType, entityId, oldData, newData, ip }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_data, new_data, ip_address)
       VALUES (?,?,?,?,?,?,?)`,
      [
        userId || null,
        action,
        entityType,
        entityId || null,
        oldData ? JSON.stringify(oldData) : null,
        newData ? JSON.stringify(newData) : null,
        ip || null,
      ]
    );
  } catch (err) {
    // Never let audit logging break the main request.
    console.error("audit log failed:", err.message);
  }
}

module.exports = { logAction };
