// lib/fileValidation.js — verify the REAL file type via magic bytes,
// not just the extension (per spec section 11: "فحص نوع الملف الحقيقي وليس الامتداد فقط").

const ALLOWED_SIGNATURES = [
  { name: "pdf", mime: "application/pdf", check: (buf) => buf.slice(0, 4).toString("hex") === "25504446" },
  // DOCX / XLSX / PPTX are all ZIP containers -> start with "PK\x03\x04"
  { name: "office-zip", mime: "application/zip-based-office", check: (buf) => buf.slice(0, 4).toString("hex") === "504b0304" },
  // Legacy .doc/.xls/.ppt (OLE compound format)
  { name: "office-ole", mime: "application/x-ole-storage", check: (buf) => buf.slice(0, 8).toString("hex") === "d0cf11e0a1b11ae1" },
  { name: "jpg", mime: "image/jpeg", check: (buf) => buf.slice(0, 3).toString("hex") === "ffd8ff" },
  { name: "png", mime: "image/png", check: (buf) => buf.slice(0, 8).toString("hex") === "89504e470d0a1a0a" },
];

// Explicitly reject known executable / script signatures even if the extension looks safe.
const BLOCKED_SIGNATURES = [
  { name: "exe/dll", check: (buf) => buf.slice(0, 2).toString("hex") === "4d5a" },       // MZ header
  { name: "elf", check: (buf) => buf.slice(0, 4).toString("hex") === "7f454c46" },        // Linux ELF
  { name: "shell-script", check: (buf) => buf.slice(0, 2).toString() === "#!" },
];

const BLOCKED_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "sh", "msi", "com", "scr", "js", "vbs", "ps1", "jar", "app", "apk", "php", "asp", "aspx", "jsp", "dll",
]);

function validateUpload(buffer, originalName) {
  const ext = (originalName.split(".").pop() || "").toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { ok: false, reason: `File extension .${ext} is not allowed.` };
  }
  for (const sig of BLOCKED_SIGNATURES) {
    if (sig.check(buffer)) {
      return { ok: false, reason: "File content looks like an executable and was rejected." };
    }
  }
  const match = ALLOWED_SIGNATURES.find((sig) => sig.check(buffer));
  if (!match) {
    return { ok: false, reason: "Unrecognized or unsupported file type." };
  }
  return { ok: true, detected: match.name };
}

module.exports = { validateUpload };
