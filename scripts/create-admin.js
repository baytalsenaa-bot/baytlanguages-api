// scripts/create-admin.js — creates (or updates) an admin_users account.
//
// Usage:
//   node scripts/create-admin.js --name "محمد" --email admin@baytlanguages.com --password "ChangeMe123!" --role admin
//
require("dotenv").config();
const bcrypt = require("bcryptjs");
const pool = require("../lib/db");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    out[argv[i].replace(/^--/, "")] = argv[i + 1];
  }
  return out;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.name || !args.email || !args.password) {
    console.error("Usage: node scripts/create-admin.js --name NAME --email EMAIL --password PASSWORD [--role admin|editor|viewer]");
    process.exit(1);
  }

  try {
    const hash = await bcrypt.hash(args.password, 10);
    const role = args.role || "admin";

    const [existing] = await pool.query("SELECT id FROM admin_users WHERE email = ?", [args.email]);
    if (existing.length) {
      await pool.query(
        "UPDATE admin_users SET name = ?, password_hash = ?, role = ?, status = 'active' WHERE email = ?",
        [args.name, hash, role, args.email]
      );
      console.log(`Updated existing admin: ${args.email}`);
    } else {
      await pool.query(
        "INSERT INTO admin_users (name, email, password_hash, role, status) VALUES (?,?,?,?,'active')",
        [args.name, args.email, hash, role]
      );
      console.log(`Created new admin: ${args.email}`);
    }
    process.exit(0);
  } catch (err) {
    console.error("Failed to create admin:", err.message);
    process.exit(1);
  }
})();
