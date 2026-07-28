// scripts/issue-document.js
// Temporary CLI to issue a verifiable document until the /admin panel (Phase 4) is built.
//
// Usage:
//   node scripts/issue-document.js \
//     --source "العربية" --target "الإنجليزية" --service "ترجمة معتمدة" \
//     --pages 3 --issued 2026-07-15 --client "M***** A*****" --translator "فريق بيت اللغات"
//
require("dotenv").config();
const { issueDocument } = require("../lib/issueDocument");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    out[key] = argv[i + 1];
  }
  return out;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  try {
    const result = await issueDocument({
      source_language: args.source,
      target_language: args.target,
      service_type: args.service,
      document_type: args.type,
      page_count: args.pages ? Number(args.pages) : null,
      issue_date: args.issued || new Date().toISOString().slice(0, 10),
      client_display_name: args.client,
      translator_name: args.translator,
      reviewer_name: args.reviewer,
    });
    console.log("Document issued:");
    console.log("  Reference:", result.reference);
    console.log("  Token:", result.token);
    console.log("  Full verification code:", `${result.reference}-${result.token}`);
    console.log("  Verify URL:", result.verifyUrl);
    console.log("  QR saved to:", result.qrFilePath);
    process.exit(0);
  } catch (err) {
    console.error("Failed to issue document:", err.message);
    process.exit(1);
  }
})();
