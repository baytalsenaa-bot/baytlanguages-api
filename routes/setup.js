// routes/setup.js — TEMPORARY one-time endpoint to create the first admin account,
// used because Render's free tier has no Shell access. Protected by APP_SECRET so
// only someone with the .env value can use it. Remove this file (and its mount in
// server.js) once you've created your admin account.
const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../lib/db");

const router = express.Router();

router.post("/create-admin", async (req, res) => {
  try {
    const providedSecret = req.headers["x-setup-secret"];
    if (!providedSecret || providedSecret !== process.env.APP_SECRET) {
      return res.status(403).json({ error: "forbidden" });
    }

    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: "missing_fields" });
    }

    const hash = await bcrypt.hash(password, 10);
    const [existing] = await pool.query("SELECT id FROM admin_users WHERE email = ?", [email]);

    if (existing.length) {
      await pool.query(
        "UPDATE admin_users SET name = ?, password_hash = ?, role = ?, status = 'active' WHERE email = ?",
        [name, hash, role || "admin", email]
      );
      return res.json({ ok: true, message: "updated existing admin" });
    }

    await pool.query(
      "INSERT INTO admin_users (name, email, password_hash, role, status) VALUES (?,?,?,?,'active')",
      [name, email, hash, role || "admin"]
    );
    res.json({ ok: true, message: "created new admin" });
  } catch (err) {
    console.error("setup error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

module.exports = router;
