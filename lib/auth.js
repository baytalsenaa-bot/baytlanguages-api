// lib/auth.js — admin authentication helpers (JWT-based)
const jwt = require("jsonwebtoken");

const TOKEN_TTL = "12h";

function signToken(adminUser) {
  return jwt.sign(
    { sub: adminUser.id, email: adminUser.email, role: adminUser.role, name: adminUser.name },
    process.env.APP_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

function verifyToken(token) {
  return jwt.verify(token, process.env.APP_SECRET);
}

/** Express middleware: requires a valid Bearer token, attaches req.admin. */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "unauthorized" });
  try {
    req.admin = verifyToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ error: "invalid_token" });
  }
}

/** Express middleware factory: requires the admin's role to be in `roles`. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.admin || !roles.includes(req.admin.role)) {
      return res.status(403).json({ error: "forbidden" });
    }
    next();
  };
}

module.exports = { signToken, verifyToken, requireAuth, requireRole };
