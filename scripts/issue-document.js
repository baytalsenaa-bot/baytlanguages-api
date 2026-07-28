// lib/issueDocument.js — creates a new verifiable document record + its QR code.
// Used by the future admin panel (section 13) and, for now, by scripts/issue-document.js.
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const pool = require("./db");
const { makeDocumentReference, makeVerificationToken, hashToken } = require("./ids");

/**
 * @param {object} fields
 *   source_language, target_language, service_type, document_type,
 *   page_count, issue_date (YYYY-MM-DD), client_display_name (masked, e.g. "M***** A*****"),
 *   translator_name, reviewer_name, document_hash, quote_request_id (optional)
 * @returns {Promise<{reference: string, token: string, verifyUrl: string, qrFilePath: string}>}
 */
async function issueDocument(fields) {
  const conn = await pool.getConnection();
  try {
    const [[{ cnt }]] = await conn.query("SELECT COUNT(*) AS cnt FROM documents");
    const reference = makeDocumentReference(cnt + 1);
    const token = makeVerificationToken(10);
    const tokenHash = hashToken(token);

    const [insertResult] = await conn.query(
      `INSERT INTO documents
        (public_reference, verification_token_hash, status, source_language, target_language,
         service_type, document_type, page_count, issue_date, client_display_name,
         translator_name, reviewer_name, document_hash, quote_request_id)
       VALUES (?,?,'valid',?,?,?,?,?,?,?,?,?,?,?)`,
      [
        reference, tokenHash,
        fields.source_language, fields.target_language, fields.service_type,
        fields.document_type || null, fields.page_count || null, fields.issue_date,
        fields.client_display_name || null, fields.translator_name || null,
        fields.reviewer_name || null, fields.document_hash || null,
        fields.quote_request_id || null,
      ]
    );
    const documentId = insertResult.insertId;

    const verifyUrl = `${process.env.PUBLIC_SITE_URL || "https://baytlanguages.com"}/ar/verify.html?code=${reference}-${token}`;

    const qrDir = path.join(process.env.PRIVATE_FILES_DIR || "./private_files", "documents");
    fs.mkdirSync(qrDir, { recursive: true });
    const qrFilePath = path.join(qrDir, `${reference}.png`);
    await QRCode.toFile(qrFilePath, verifyUrl, { width: 480, margin: 2 });

    await conn.query("UPDATE documents SET qr_code_key = ? WHERE public_reference = ?", [
      `documents/${reference}.png`,
      reference,
    ]);

    return { id: documentId, reference, token, verifyUrl, qrFilePath };
  } finally {
    conn.release();
  }
}

module.exports = { issueDocument };
