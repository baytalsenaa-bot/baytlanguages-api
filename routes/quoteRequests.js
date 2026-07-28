// routes/quoteRequests.js
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const pool = require("../lib/db");
const { makeRequestNumber, makeStoredFilename } = require("../lib/ids");
const { validateUpload } = require("../lib/fileValidation");

const router = express.Router();

const MAX_MB = Number(process.env.MAX_UPLOAD_MB || 20);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 10 },
});

const REQUIRED_FIELDS = [
  "customer_name", "email", "phone", "country",
  "source_language", "target_language", "service_type",
];

router.post("/", upload.array("files", 10), async (req, res) => {
  try {
    const body = req.body || {};
    const missing = REQUIRED_FIELDS.filter((f) => !body[f] || String(body[f]).trim() === "");
    if (missing.length) {
      return res.status(400).json({ error: "missing_fields", fields: missing });
    }

    // --- Validate every uploaded file by real content, not extension ---
    const files = req.files || [];
    for (const file of files) {
      const result = validateUpload(file.buffer, file.originalname);
      if (!result.ok) {
        return res.status(400).json({ error: "invalid_file", file: file.originalname, reason: result.reason });
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Sequence number: count existing rows + 1 (simple; swap for a dedicated counter table under high concurrency)
      const [[{ cnt }]] = await conn.query("SELECT COUNT(*) AS cnt FROM quote_requests");
      const requestNumber = makeRequestNumber(cnt + 1);

      const [result] = await conn.query(
        `INSERT INTO quote_requests
          (request_number, customer_name, company_name, email, phone, country,
           source_language, target_language, service_type, document_type, file_count,
           urgency, certification_required, notes, language)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          requestNumber,
          body.customer_name,
          body.company_name || null,
          body.email,
          body.phone,
          body.country,
          body.source_language,
          body.target_language,
          body.service_type,
          body.document_type || null,
          files.length,
          body.urgency || "normal",
          body.certification_required ? 1 : 0,
          body.notes || null,
          body.language || "ar",
        ]
      );
      const quoteRequestId = result.insertId;

      // --- Store files privately (outside public_html) with randomized names ---
      const uploadDir = path.join(process.env.PRIVATE_FILES_DIR || "./private_files", "quote-uploads", String(quoteRequestId));
      fs.mkdirSync(uploadDir, { recursive: true });

      for (const file of files) {
        const storedName = makeStoredFilename(file.originalname);
        fs.writeFileSync(path.join(uploadDir, storedName), file.buffer);
        await conn.query(
          `INSERT INTO quote_request_files (quote_request_id, original_name, stored_name, mime_type, size_bytes)
           VALUES (?,?,?,?,?)`,
          [quoteRequestId, file.originalname, storedName, file.mimetype, file.size]
        );
      }

      await conn.commit();
      res.status(201).json({ request_number: requestNumber });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error("quote-requests error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

module.exports = router;
