// server.js — Bayt Languages backend entry point
require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const quoteRequestsRouter = require("./routes/quoteRequests");
const verifyRouter = require("./routes/verify");

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.PUBLIC_SITE_URL || true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// General API rate limit (per spec section 16: "إضافة Rate Limiting إلى صفحة التحقق"
// — applied broadly here as good practice, with a stricter limiter on /api/verify itself).
app.use(
  "/api",
  rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false })
);

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/quote-requests", quoteRequestsRouter);
app.use("/api/verify", verifyRouter);

// 404 for unmatched API routes
app.use("/api", (req, res) => res.status(404).json({ error: "not_found" }));

// Central error handler
app.use((err, req, res, next) => {
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({ error: "payload_too_large" });
  }
  console.error(err);
  res.status(500).json({ error: "server_error" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bayt Languages API listening on port ${PORT}`);
});
