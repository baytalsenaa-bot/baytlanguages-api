// routes/admin.js — protected admin API (dashboard, quote requests, documents, audit log).
// Every route here requires a valid admin session (see server.js mounting with requireAuth).
const express = require("express");
const fs = require("fs");
const path = require("path");
const pool = require("../lib/db");
const { logAction } = require("../lib/audit");
const { issueDocument } = require("../lib/issueDocument");

const router = express.Router();

// ---------------------------------------------------------------- dashboard
router.get("/dashboard", async (req, res) => {
  try {
    const [[quoteCounts]] = await pool.query(`
      SELECT
        COUNT(*) AS total,
        SUM(status = 'new') AS new_count,
        SUM(status = 'in_review') AS in_review_count,
        SUM(status = 'quoted') AS quoted_count,
        SUM(status = 'in_progress') AS in_progress_count,
        SUM(status = 'completed') AS completed_count
      FROM quote_requests
    `);
    const [[docCounts]] = await pool.query(`
      SELECT
        COUNT(*) AS total,
        SUM(status = 'valid') AS valid_count,
        SUM(status = 'revoked') AS revoked_count,
        SUM(status = 'superseded') AS superseded_count
      FROM documents
    `);
    res.json({ quoteRequests: quoteCounts, documents: docCounts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server_error" });
  }
});

// ---------------------------------------------------------------- quote requests
router.get("/quote-requests", async (req, res) => {
  try {
    const status = req.query.status;
    const params = [];
    let where = "";
    if (status) {
      where = "WHERE status = ?";
      params.push(status);
    }
    const [rows] = await pool.query(
      `SELECT id, request_number, customer_name, company_name, email, phone, country,
              source_language, target_language, service_type, urgency, status,
              quoted_price, currency, language, created_at
       FROM quote_requests ${where}
       ORDER BY created_at DESC LIMIT 200`,
      params
    );
    res.json({ items: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server_error" });
  }
});

router.get("/quote-requests/:id", async (req, res) => {
  try {
    const [[qr]] = await pool.query("SELECT * FROM quote_requests WHERE id = ?", [req.params.id]);
    if (!qr) return res.status(404).json({ error: "not_found" });
    const [files] = await pool.query(
      "SELECT id, original_name, mime_type, size_bytes, created_at FROM quote_request_files WHERE quote_request_id = ?",
      [req.params.id]
    );
    res.json({ ...qr, files });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server_error" });
  }
});

const EDITABLE_QR_FIELDS = ["status", "quoted_price", "currency", "internal_notes"];

router.patch("/quote-requests/:id", async (req, res) => {
  try {
    const [[before]] = await pool.query("SELECT * FROM quote_requests WHERE id = ?", [req.params.id]);
    if (!before) return res.status(404).json({ error: "not_found" });

    const updates = [];
    const values = [];
    for (const field of EDITABLE_QR_FIELDS) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }
    if (!updates.length) return res.status(400).json({ error: "no_fields" });

    values.push(req.params.id);
    await pool.query(`UPDATE quote_requests SET ${updates.join(", ")} WHERE id = ?`, values);

    await logAction(pool, {
      userId: req.admin.sub,
      action: "quote_request.update",
      entityType: "quote_request",
      entityId: req.params.id,
      oldData: before,
      newData: req.body,
      ip: req.ip,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server_error" });
  }
});

// Download a file attached to a quote request (private, auth-protected — never publicly linked).
router.get("/quote-requests/:id/files/:fileId", async (req, res) => {
  try {
    const [[file]] = await pool.query(
      "SELECT * FROM quote_request_files WHERE id = ? AND quote_request_id = ?",
      [req.params.fileId, req.params.id]
    );
    if (!file) return res.status(404).json({ error: "not_found" });

    const filePath = path.join(
      process.env.PRIVATE_FILES_DIR || "./private_files",
      "quote-uploads",
      String(req.params.id),
      file.stored_name
    );
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "file_missing" });

    res.setHeader("Content-Type", file.mime_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.original_name)}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server_error" });
  }
});

// ---------------------------------------------------------------- documents
router.get("/documents", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, public_reference, status, source_language, target_language, service_type,
              document_type, page_count, issue_date, expiry_date, client_display_name,
              translator_name, created_at, updated_at
       FROM documents ORDER BY created_at DESC LIMIT 200`
    );
    res.json({ items: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server_error" });
  }
});

router.post("/documents", async (req, res) => {
  try {
    const b = req.body || {};
    const required = ["source_language", "target_language", "service_type", "issue_date"];
    const missing = required.filter((f) => !b[f]);
    if (missing.length) return res.status(400).json({ error: "missing_fields", fields: missing });

    const result = await issueDocument({
      source_language: b.source_language,
      target_language: b.target_language,
      service_type: b.service_type,
      document_type: b.document_type,
      page_count: b.page_count,
      issue_date: b.issue_date,
      client_display_name: b.client_display_name,
      translator_name: b.translator_name,
      reviewer_name: b.reviewer_name,
      quote_request_id: b.quote_request_id,
    });

    await logAction(pool, {
      userId: req.admin.sub,
      action: "document.issue",
      entityType: "document",
      entityId: null,
      newData: { reference: result.reference, ...b },
      ip: req.ip,
    });

    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server_error" });
  }
});

const EDITABLE_DOC_FIELDS = ["status", "page_count", "expiry_date", "client_display_name", "translator_name", "reviewer_name"];

router.patch("/documents/:id", async (req, res) => {
  try {
    const [[before]] = await pool.query("SELECT * FROM documents WHERE id = ?", [req.params.id]);
    if (!before) return res.status(404).json({ error: "not_found" });

    const updates = [];
    const values = [];
    for (const field of EDITABLE_DOC_FIELDS) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }
    if (!updates.length) return res.status(400).json({ error: "no_fields" });

    values.push(req.params.id);
    await pool.query(`UPDATE documents SET ${updates.join(", ")} WHERE id = ?`, values);

    await logAction(pool, {
      userId: req.admin.sub,
      action: "document.update",
      entityType: "document",
      entityId: req.params.id,
      oldData: before,
      newData: req.body,
      ip: req.ip,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server_error" });
  }
});

// Serve the generated QR code image for a document.
router.get("/documents/:id/qr", async (req, res) => {
  try {
    const [[doc]] = await pool.query("SELECT qr_code_key FROM documents WHERE id = ?", [req.params.id]);
    if (!doc || !doc.qr_code_key) return res.status(404).json({ error: "not_found" });
    const filePath = path.join(process.env.PRIVATE_FILES_DIR || "./private_files", doc.qr_code_key);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "file_missing" });
    res.setHeader("Content-Type", "image/png");
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server_error" });
  }
});

// ---------------------------------------------------------------- audit log
router.get("/audit-logs", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT al.id, al.action, al.entity_type, al.entity_id, al.old_data, al.new_data,
             al.ip_address, al.created_at, au.name AS user_name, au.email AS user_email
      FROM audit_logs al
      LEFT JOIN admin_users au ON au.id = al.user_id
      ORDER BY al.created_at DESC LIMIT 200
    `);
    res.json({ items: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server_error" });
  }
});

// ---------------------------------------------------------------- who am I
router.get("/me", (req, res) => {
  res.json({ name: req.admin.name, email: req.admin.email, role: req.admin.role });
});

module.exports = router;
