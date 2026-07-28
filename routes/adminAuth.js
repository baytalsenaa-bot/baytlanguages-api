// routes/adminAuth.js — POST /api/admin/login
const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const pool = require("../lib/db");
const { signToken } = require("../lib/auth");
const { logAction } = require("../lib/audit");

const router = express.Router();

// Slow down brute-force login attempts.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_attempts" },
});

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "missing_credentials" });
    }

    const [rows] = await pool.query(
      "SELECT id, name, email, password_hash, role, status FROM admin_users WHERE email = ? LIMIT 1",
      [email]
    );
    const user = rows[0];
    if (!user || user.status !== "active") {
      return res.status(401).json({ error: "invalid_credentials" });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "invalid_credentials" });
    }

    await pool.query("UPDATE admin_users SET last_login = NOW() WHERE id = ?", [user.id]);
    await logAction(pool, {
      userId: user.id,
      action: "admin.login",
      entityType: "admin_user",
      entityId: user.id,
      ip: req.ip,
    });

    const token = signToken(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

module.exports = router;
