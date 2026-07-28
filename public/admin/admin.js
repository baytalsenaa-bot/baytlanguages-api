// admin.js — Bayt Languages admin panel (vanilla JS single-page app)
(function () {
  "use strict";

  const API_BASE = "/api/admin";
  const TOKEN_KEY = "bl_admin_token";
  const USER_KEY = "bl_admin_user";

  const loginScreen = document.getElementById("login-screen");
  const appShell = document.getElementById("app-shell");
  const mainContent = document.getElementById("main-content");
  const userNameEl = document.getElementById("user-name");
  const toastEl = document.getElementById("toast");

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; }
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  async function api(path, options = {}) {
    const res = await fetch(API_BASE + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + getToken(),
        ...(options.headers || {}),
      },
    });
    if (res.status === 401) {
      clearSession();
      renderLogin();
      throw new Error("unauthorized");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "request_failed");
    return data;
  }

  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function fmtDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
  }
  function fmtDateOnly(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("ar-EG", { dateStyle: "medium" });
  }

  const STATUS_LABELS_QR = {
    new: "جديد", in_review: "قيد المراجعة", quoted: "تم التسعير",
    in_progress: "قيد التنفيذ", completed: "مكتمل", cancelled: "ملغى",
  };
  const STATUS_LABELS_DOC = {
    valid: "ساري", superseded: "مستبدل", revoked: "ملغى", expired: "منتهي",
  };

  // ================================================================ LOGIN
  function renderLogin() {
    loginScreen.style.display = "flex";
    appShell.style.display = "none";
  }

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const errorEl = document.getElementById("login-error");
    errorEl.style.display = "none";
    try {
      const res = await fetch(API_BASE + "/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "login_failed");
      setSession(data.token, data.user);
      renderApp();
    } catch (err) {
      errorEl.textContent = "بيانات الدخول غير صحيحة";
      errorEl.style.display = "block";
    }
  });

  document.getElementById("logout-btn").addEventListener("click", () => {
    clearSession();
    renderLogin();
  });

  // ================================================================ APP SHELL
  function renderApp() {
    const user = getUser();
    loginScreen.style.display = "none";
    appShell.style.display = "flex";
    userNameEl.textContent = user ? `${user.name} (${user.role})` : "";
    router();
  }

  function setActiveNav(route) {
    document.querySelectorAll(".sidebar nav a").forEach((a) => {
      a.classList.toggle("active", a.dataset.route === route);
    });
  }

  // ================================================================ ROUTER
  window.addEventListener("hashchange", router);

  function router() {
    const hash = window.location.hash.replace(/^#\/?/, "") || "dashboard";
    const [route, param] = hash.split("/");
    setActiveNav(route);
    if (route === "dashboard") renderDashboard();
    else if (route === "quote-requests" && param) renderQuoteDetail(param);
    else if (route === "quote-requests") renderQuoteList();
    else if (route === "documents" && param === "new") renderDocumentNew();
    else if (route === "documents") renderDocumentList();
    else if (route === "audit-log") renderAuditLog();
    else renderDashboard();
  }

  // ================================================================ DASHBOARD
  async function renderDashboard() {
    mainContent.innerHTML = `<h1>نظرة عامة</h1><div class="loading">جارٍ التحميل...</div>`;
    try {
      const data = await api("/dashboard");
      const q = data.quoteRequests, d = data.documents;
      mainContent.innerHTML = `
        <h1>نظرة عامة</h1>
        <div class="stat-grid">
          <div class="stat-card"><div class="num">${q.total || 0}</div><div class="label">إجمالي طلبات الترجمة</div></div>
          <div class="stat-card"><div class="num">${q.new_count || 0}</div><div class="label">طلبات جديدة</div></div>
          <div class="stat-card"><div class="num">${q.in_progress_count || 0}</div><div class="label">قيد التنفيذ</div></div>
          <div class="stat-card"><div class="num">${q.completed_count || 0}</div><div class="label">مكتملة</div></div>
          <div class="stat-card"><div class="num">${d.total || 0}</div><div class="label">إجمالي المستندات الصادرة</div></div>
          <div class="stat-card"><div class="num">${d.valid_count || 0}</div><div class="label">مستندات سارية</div></div>
          <div class="stat-card"><div class="num">${d.revoked_count || 0}</div><div class="label">مستندات ملغاة</div></div>
        </div>
        <p style="color:var(--text-secondary);font-size:14px">
          استخدم القائمة الجانبية لإدارة طلبات الترجمة وإصدار المستندات ومتابعة سجل العمليات.
        </p>
      `;
    } catch (err) {
      mainContent.innerHTML = `<h1>نظرة عامة</h1><div class="empty">تعذّر تحميل البيانات.</div>`;
    }
  }

  // ================================================================ QUOTE REQUESTS — LIST
  async function renderQuoteList() {
    mainContent.innerHTML = `
      <h1>طلبات الترجمة</h1>
      <div class="toolbar">
        <select id="qr-filter">
          <option value="">كل الحالات</option>
          ${Object.entries(STATUS_LABELS_QR).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
        </select>
      </div>
      <div class="table-wrap"><div class="loading">جارٍ التحميل...</div></div>
    `;
    document.getElementById("qr-filter").addEventListener("change", (e) => loadQuoteList(e.target.value));
    loadQuoteList("");
  }

  async function loadQuoteList(status) {
    const wrap = mainContent.querySelector(".table-wrap");
    try {
      const data = await api("/quote-requests" + (status ? `?status=${status}` : ""));
      if (!data.items.length) {
        wrap.innerHTML = `<div class="empty">لا توجد طلبات حاليًا.</div>`;
        return;
      }
      wrap.innerHTML = `
        <table>
          <thead><tr>
            <th>الرقم المرجعي</th><th>العميل</th><th>الخدمة</th><th>اللغات</th><th>الحالة</th><th>التاريخ</th>
          </tr></thead>
          <tbody>
            ${data.items.map((r) => `
              <tr class="clickable" onclick="location.hash='#/quote-requests/${r.id}'">
                <td>${esc(r.request_number)}</td>
                <td>${esc(r.customer_name)}</td>
                <td>${esc(r.service_type)}</td>
                <td>${esc(r.source_language)} → ${esc(r.target_language)}</td>
                <td><span class="badge badge-${r.status}">${STATUS_LABELS_QR[r.status] || r.status}</span></td>
                <td>${fmtDate(r.created_at)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    } catch {
      wrap.innerHTML = `<div class="empty">تعذّر تحميل الطلبات.</div>`;
    }
  }

  // ================================================================ QUOTE REQUEST — DETAIL
  async function renderQuoteDetail(id) {
    mainContent.innerHTML = `<div class="loading">جارٍ التحميل...</div>`;
    try {
      const r = await api(`/quote-requests/${id}`);
      mainContent.innerHTML = `
        <a class="back-link" href="#/quote-requests">→ رجوع لكل الطلبات</a>
        <h1>${esc(r.request_number)}</h1>
        <div class="detail-grid">
          <div>
            <div class="panel">
              <h3>بيانات العميل</h3>
              <div class="kv"><div class="k">الاسم</div><div>${esc(r.customer_name)}</div></div>
              <div class="kv"><div class="k">الشركة</div><div>${esc(r.company_name) || "—"}</div></div>
              <div class="kv"><div class="k">البريد الإلكتروني</div><div>${esc(r.email)}</div></div>
              <div class="kv"><div class="k">الهاتف</div><div>${esc(r.phone)}</div></div>
              <div class="kv"><div class="k">الدولة</div><div>${esc(r.country)}</div></div>
            </div>
            <div class="panel">
              <h3>تفاصيل الطلب</h3>
              <div class="kv"><div class="k">نوع الخدمة</div><div>${esc(r.service_type)}</div></div>
              <div class="kv"><div class="k">نوع المستند</div><div>${esc(r.document_type) || "—"}</div></div>
              <div class="kv"><div class="k">اللغات</div><div>${esc(r.source_language)} → ${esc(r.target_language)}</div></div>
              <div class="kv"><div class="k">السرعة</div><div>${esc(r.urgency)}</div></div>
              <div class="kv"><div class="k">ترجمة معتمدة</div><div>${r.certification_required ? "نعم" : "لا"}</div></div>
              <div class="kv"><div class="k">ملاحظات العميل</div><div>${esc(r.notes) || "—"}</div></div>
              <div class="kv"><div class="k">تاريخ الطلب</div><div>${fmtDate(r.created_at)}</div></div>
            </div>
            <div class="panel">
              <h3>الملفات المرفقة</h3>
              ${r.files.length ? r.files.map((f) => `
                <div class="file-row">
                  <span>${esc(f.original_name)} <span style="color:var(--text-secondary)">(${(f.size_bytes/1024).toFixed(1)} KB)</span></span>
                  <a class="btn btn-outline" style="height:34px;padding:0 12px;font-size:13px" href="${API_BASE}/quote-requests/${id}/files/${f.id}" data-download="1">تنزيل</a>
                </div>
              `).join("") : `<p style="color:var(--text-secondary);font-size:14px">لا توجد ملفات مرفقة.</p>`}
            </div>
          </div>
          <div>
            <div class="panel">
              <h3>الحالة والتسعير</h3>
              <div class="form-row">
                <label>الحالة</label>
                <select class="form-input" id="qr-status">
                  ${Object.entries(STATUS_LABELS_QR).map(([k, v]) => `<option value="${k}" ${k === r.status ? "selected" : ""}>${v}</option>`).join("")}
                </select>
              </div>
              <div class="form-grid-2">
                <div class="form-row">
                  <label>السعر</label>
                  <input class="form-input" id="qr-price" type="number" step="0.01" value="${r.quoted_price ?? ""}" />
                </div>
                <div class="form-row">
                  <label>العملة</label>
                  <input class="form-input" id="qr-currency" value="${esc(r.currency || "SAR")}" />
                </div>
              </div>
              <div class="form-row">
                <label>ملاحظات داخلية</label>
                <textarea class="form-input" id="qr-internal-notes">${esc(r.internal_notes || "")}</textarea>
              </div>
              <button class="btn btn-primary" id="qr-save-btn">حفظ التغييرات</button>
            </div>
            <div class="panel">
              <h3>إصدار مستند لهذا الطلب</h3>
              <p style="color:var(--text-secondary);font-size:13.5px;margin:0 0 14px">
                بعد إتمام الترجمة، أصدر مستندًا موثّقًا مرتبطًا بهذا الطلب.
              </p>
              <a class="btn btn-secondary btn-outline" style="display:block;text-align:center" href="#/documents/new?quote=${id}">إصدار مستند</a>
            </div>
          </div>
        </div>
      `;

      // Downloads need the auth header, so intercept the click and fetch as a blob.
      mainContent.querySelectorAll("[data-download]").forEach((a) => {
        a.addEventListener("click", async (e) => {
          e.preventDefault();
          const res = await fetch(a.href, { headers: { Authorization: "Bearer " + getToken() } });
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = "";
          link.click();
          URL.revokeObjectURL(url);
        });
      });

      document.getElementById("qr-save-btn").addEventListener("click", async () => {
        try {
          await api(`/quote-requests/${id}`, {
            method: "PATCH",
            body: JSON.stringify({
              status: document.getElementById("qr-status").value,
              quoted_price: document.getElementById("qr-price").value || null,
              currency: document.getElementById("qr-currency").value,
              internal_notes: document.getElementById("qr-internal-notes").value,
            }),
          });
          showToast("تم حفظ التغييرات");
          renderQuoteDetail(id);
        } catch {
          showToast("تعذّر الحفظ");
        }
      });
    } catch {
      mainContent.innerHTML = `<div class="empty">تعذّر تحميل الطلب.</div>`;
    }
  }

  // ================================================================ DOCUMENTS — LIST
  async function renderDocumentList() {
    mainContent.innerHTML = `
      <h1>المستندات الصادرة</h1>
      <div class="toolbar">
        <a class="btn btn-primary" href="#/documents/new">+ إصدار مستند جديد</a>
      </div>
      <div class="table-wrap"><div class="loading">جارٍ التحميل...</div></div>
    `;
    const wrap = mainContent.querySelector(".table-wrap");
    try {
      const data = await api("/documents");
      if (!data.items.length) {
        wrap.innerHTML = `<div class="empty">لا توجد مستندات صادرة بعد.</div>`;
        return;
      }
      wrap.innerHTML = `
        <table>
          <thead><tr>
            <th>الرقم المرجعي</th><th>الخدمة</th><th>اللغات</th><th>العميل</th><th>الحالة</th><th>تاريخ الإصدار</th>
          </tr></thead>
          <tbody>
            ${data.items.map((d) => `
              <tr class="clickable" onclick="editDocumentStatus(${d.id}, '${d.status}')">
                <td>${esc(d.public_reference)}</td>
                <td>${esc(d.service_type)}</td>
                <td>${esc(d.source_language)} → ${esc(d.target_language)}</td>
                <td>${esc(d.client_display_name) || "—"}</td>
                <td><span class="badge badge-${d.status}">${STATUS_LABELS_DOC[d.status] || d.status}</span></td>
                <td>${fmtDateOnly(d.issue_date)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    } catch {
      wrap.innerHTML = `<div class="empty">تعذّر تحميل المستندات.</div>`;
    }
  }

  window.editDocumentStatus = async function (id, currentStatus) {
    const options = Object.entries(STATUS_LABELS_DOC).map(([k, v]) => `${k} = ${v}`).join(" / ");
    const next = prompt(`أدخل الحالة الجديدة (${options}):`, currentStatus);
    if (!next || !STATUS_LABELS_DOC[next]) return;
    try {
      await api(`/documents/${id}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      showToast("تم تحديث حالة المستند");
      renderDocumentList();
    } catch {
      showToast("تعذّر التحديث");
    }
  };

  // ================================================================ DOCUMENTS — NEW
  function renderDocumentNew() {
    const hashQuery = (window.location.hash.split("?")[1] || "");
    const params = new URLSearchParams(hashQuery);
    const quoteRequestId = params.get("quote") || "";

    mainContent.innerHTML = `
      <a class="back-link" href="#/documents">→ رجوع للمستندات</a>
      <h1>إصدار مستند جديد</h1>
      <div class="panel" style="max-width:640px">
        <div class="form-grid-2">
          <div class="form-row"><label>اللغة الأصلية *</label><input class="form-input" id="doc-source" required /></div>
          <div class="form-row"><label>لغة الترجمة *</label><input class="form-input" id="doc-target" required /></div>
        </div>
        <div class="form-grid-2">
          <div class="form-row"><label>نوع الخدمة *</label><input class="form-input" id="doc-service" placeholder="ترجمة معتمدة" required /></div>
          <div class="form-row"><label>نوع المستند</label><input class="form-input" id="doc-type" /></div>
        </div>
        <div class="form-grid-2">
          <div class="form-row"><label>عدد الصفحات</label><input class="form-input" id="doc-pages" type="number" /></div>
          <div class="form-row"><label>تاريخ الإصدار *</label><input class="form-input" id="doc-issued" type="date" required value="${new Date().toISOString().slice(0,10)}" /></div>
        </div>
        <div class="form-row"><label>اسم العميل (مقنّع، مثال: M***** A*****)</label><input class="form-input" id="doc-client" /></div>
        <div class="form-row"><label>اسم المترجم</label><input class="form-input" id="doc-translator" /></div>
        <input type="hidden" id="doc-quote-id" value="${esc(quoteRequestId)}" />
        <button class="btn btn-primary" id="doc-issue-btn">إصدار المستند</button>
      </div>
      <div class="panel" id="doc-result" style="display:none;max-width:640px"></div>
    `;

    document.getElementById("doc-issue-btn").addEventListener("click", async () => {
      const body = {
        source_language: document.getElementById("doc-source").value,
        target_language: document.getElementById("doc-target").value,
        service_type: document.getElementById("doc-service").value,
        document_type: document.getElementById("doc-type").value,
        page_count: document.getElementById("doc-pages").value || null,
        issue_date: document.getElementById("doc-issued").value,
        client_display_name: document.getElementById("doc-client").value,
        translator_name: document.getElementById("doc-translator").value,
        quote_request_id: document.getElementById("doc-quote-id").value || null,
      };
      if (!body.source_language || !body.target_language || !body.service_type || !body.issue_date) {
        showToast("املأ كل الحقول المطلوبة (*)");
        return;
      }
      try {
        const result = await api("/documents", { method: "POST", body: JSON.stringify(body) });
        const fullCode = `${result.reference}-${result.token}`;
        const resultBox = document.getElementById("doc-result");
        resultBox.style.display = "block";
        resultBox.innerHTML = `
          <h3>تم إصدار المستند بنجاح ✅</h3>
          <div class="qr-box" style="margin-bottom:18px">
            <img id="doc-qr-img" alt="QR Code" src="" />
            <div><a id="doc-qr-download" class="btn btn-outline" style="height:36px;padding:0 14px;font-size:13px;margin-top:10px;display:inline-flex">تنزيل صورة QR</a></div>
          </div>
          <div class="kv"><div class="k">الرقم المرجعي</div><div>${esc(result.reference)}</div></div>
          <div class="kv"><div class="k">رمز التحقق الكامل</div><div class="code-box">${esc(fullCode)}</div></div>
          <div class="kv"><div class="k">رابط التحقق</div><div><a href="${esc(result.verifyUrl)}" target="_blank" style="color:var(--primary);font-weight:600">${esc(result.verifyUrl)}</a></div></div>
          <p style="font-size:13.5px;color:var(--text-secondary);margin-top:14px">
            اطبع صورة الـ QR أعلاه (أو الرمز النصي) على المستند المترجم الذي تسلّمه للعميل.
          </p>
        `;
        // Fetch the QR image with auth and show it (an <img src> can't send the Authorization header itself).
        const qrRes = await fetch(`${API_BASE}/documents/${result.id}/qr`, {
          headers: { Authorization: "Bearer " + getToken() },
        });
        const qrBlob = await qrRes.blob();
        const qrUrl = URL.createObjectURL(qrBlob);
        document.getElementById("doc-qr-img").src = qrUrl;
        const dl = document.getElementById("doc-qr-download");
        dl.href = qrUrl;
        dl.download = `${result.reference}-qr.png`;
        showToast("تم إصدار المستند");
      } catch {
        showToast("تعذّر إصدار المستند");
      }
    });
  }

  // ================================================================ AUDIT LOG
  async function renderAuditLog() {
    mainContent.innerHTML = `<h1>سجل العمليات</h1><div class="table-wrap"><div class="loading">جارٍ التحميل...</div></div>`;
    const wrap = mainContent.querySelector(".table-wrap");
    try {
      const data = await api("/audit-logs");
      if (!data.items.length) {
        wrap.innerHTML = `<div class="empty">لا توجد عمليات مسجّلة بعد.</div>`;
        return;
      }
      wrap.innerHTML = `
        <table>
          <thead><tr><th>التاريخ</th><th>المستخدم</th><th>العملية</th><th>النوع</th><th>المعرّف</th></tr></thead>
          <tbody>
            ${data.items.map((l) => `
              <tr>
                <td>${fmtDate(l.created_at)}</td>
                <td>${esc(l.user_name) || "—"}</td>
                <td>${esc(l.action)}</td>
                <td>${esc(l.entity_type)}</td>
                <td>${esc(l.entity_id) || "—"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    } catch {
      wrap.innerHTML = `<div class="empty">تعذّر تحميل السجل.</div>`;
    }
  }

  // ================================================================ BOOT
  if (getToken()) {
    renderApp();
  } else {
    renderLogin();
  }
})();
