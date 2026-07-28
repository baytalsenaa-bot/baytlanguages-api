// routes/verify.js
const express = require("express");
const rateLimit = require("express-rate-limit");
const pool = require("../lib/db");
const { hashToken, splitVerificationCode } = require("../lib/ids");

const router = express.Router();

// Per spec section 16: rate-limit the verification endpoint against brute forcing.
const verifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests" },
});

router.get("/:code", verifyLimiter, async (req, res) => {
  try {
    const { reference, token } = splitVerificationCode(req.params.code);
    if (!reference || !token) {
      return res.status(400).json({ status: "not_found" });
    }

    const [rows] = await pool.query(
      `SELECT public_reference, verification_token_hash, status, source_language, target_language,
              service_type, document_type, page_count, issue_date, expiry_date,
              client_display_name, updated_at, superseded_by_id
       FROM documents WHERE public_reference = ? LIMIT 1`,
      [reference]
    );

    const doc = rows[0];
    if (!doc || doc.verification_token_hash !== hashToken(token)) {
      return res.status(404).json({ status: "not_found" });
    }

    // Never return internal file keys, hashes, or full client identity — public data only.
    const publicData = {
      status: doc.status, // valid | superseded | revoked | expired
      reference: doc.public_reference,
      source_language: doc.source_language,
      target_language: doc.target_language,
      service_type: doc.service_type,
      document_type: doc.document_type,
      page_count: doc.page_count,
      issue_date: doc.issue_date,
      expiry_date: doc.expiry_date,
      client_display_name: doc.client_display_name, // already stored masked, e.g. "M***** A*****"
      updated_at: doc.updated_at,
    };

    res.json(publicData);
  } catch (err) {
    console.error("verify error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

module.exports = router;
