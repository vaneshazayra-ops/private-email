/**
 * Temporary eMail Frontend Application
 */

// ===== Theme (Dark/Light Mode) =====
function initTheme() {
  const saved = localStorage.getItem('tempmail_theme');
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    // Auto-detect system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }
  updateThemeIcon();
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('tempmail_theme', next);
  updateThemeIcon();
}

function updateThemeIcon() {
  var icon = document.getElementById('themeIcon');
  if (!icon) return;
  var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  icon.textContent = isDark ? '☀️' : '🌙';
}

// Initialize theme immediately
initTheme();

// State
let currentAddress = localStorage.getItem('tempmail_address') || '';
let currentEmailId = null;
let autoRefreshInterval = null;
let currentEmailData = null;

// DOM Elements
const elements = {
  emailAddress: document.getElementById('emailAddress'),
  copyBtn: document.getElementById('copyBtn'),
  domainSelect: document.getElementById('domainSelect'),
  generateBtn: document.getElementById('generateBtn'),
  customUsername: document.getElementById('customUsername'),
  customDomainLabel: document.getElementById('customDomainLabel'),
  customBtn: document.getElementById('customBtn'),
  emailList: document.getElementById('emailList'),
  emailCount: document.getElementById('emailCount'),
  refreshBtn: document.getElementById('refreshBtn'),
  deleteAllBtn: document.getElementById('deleteAllBtn'),
  autoRefresh: document.getElementById('autoRefresh'),
  emailModal: document.getElementById('emailModal'),
  backBtn: document.getElementById('backBtn'),
  deleteEmailBtn: document.getElementById('deleteEmailBtn'),
  emailFrom: document.getElementById('emailFrom'),
  emailTo: document.getElementById('emailTo'),
  emailSubject: document.getElementById('emailSubject'),
  emailDate: document.getElementById('emailDate'),
  emailBody: document.getElementById('emailBody'),
  tabText: document.getElementById('tabText'),
  tabHtml: document.getElementById('tabHtml'),
  tabSource: document.getElementById('tabSource'),
  activeDomains: document.getElementById('activeDomains'),
  emailExpiry: document.getElementById('emailExpiry')
};



// API Helper
async function api(endpoint, options = {}) {
  try {
    const res = await fetch('/api' + endpoint, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    return await res.json();
  } catch (err) {
    showToast('Connection error', 'error');
    return null;
  }
}

// Toast notification
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Format date
function formatDate(dateStr) {
  if (!dateStr) return 'Unknown';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
}



// Load domains
async function loadDomains() {
  const data = await api('/domains');
  if (data && data.domains) {
    elements.domainSelect.innerHTML = '';
    data.domains.forEach(domain => {
      const opt = document.createElement('option');
      opt.value = domain;
      opt.textContent = domain;
      elements.domainSelect.appendChild(opt);
    });
    updateCustomDomainLabel();
  }
}

// Load config info
async function loadConfig() {
  const data = await api('/config');
  if (data) {
    if (elements.activeDomains) elements.activeDomains.textContent = data.domains.join(', ');
    if (elements.emailExpiry) elements.emailExpiry.textContent = data.expiryMinutes;
  }
}

// Update custom domain label
function updateCustomDomainLabel() {
  const domain = elements.domainSelect.value;
  elements.customDomainLabel.textContent = '@' + domain;
}

// Generate new email address
async function generateAddress() {
  const domain = elements.domainSelect.value;
  const data = await api('/generate?domain=' + encodeURIComponent(domain));
  if (data && data.address) {
    setAddress(data.address);
    showToast('New address generated!');
  }
}

// Use custom address
async function useCustomAddress() {
  const username = elements.customUsername.value.trim();
  if (!username) {
    showToast('Please enter a username', 'error');
    return;
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    showToast('Invalid username. Use letters, numbers, dots, hyphens', 'error');
    return;
  }
  const domain = elements.domainSelect.value;
  const address = username + '@' + domain;
  const data = await api('/mailbox', {
    method: 'POST',
    body: JSON.stringify({ address })
  });
  if (data && data.address) {
    setAddress(data.address);
    showToast('Custom address set!');
  } else if (data && data.error) {
    showToast(data.error, 'error');
  }
}

// Set current address
function setAddress(address) {
  currentAddress = address;
  elements.emailAddress.value = address;
  localStorage.setItem('tempmail_address', address);
  loadEmails();
}



// Load emails for current address
async function loadEmails() {
  if (!currentAddress) {
    renderEmptyInbox();
    return;
  }
  const data = await api('/emails?address=' + encodeURIComponent(currentAddress));
  if (data) {
    elements.emailCount.textContent = data.count;
    if (data.count === 0) {
      renderEmptyInbox();
    } else {
      renderEmailList(data.emails);
    }
  }
}

// Render empty inbox
function renderEmptyInbox() {
  elements.emailList.innerHTML = `
    <div class="empty-inbox">
      <p>&#128236; No emails yet</p>
      <p class="hint">Waiting for incoming emails...</p>
    </div>
  `;
  elements.emailCount.textContent = '0';
}

// Render email list
function renderEmailList(emails) {
  elements.emailList.innerHTML = '';
  emails.forEach(email => {
    const item = document.createElement('div');
    item.className = 'email-item' + (email.read ? '' : ' unread');
    item.innerHTML = `
      <div class="email-item-content">
        <div class="email-item-from">${escapeHtml(email.from)}</div>
        <div class="email-item-subject">${escapeHtml(email.subject)}</div>
      </div>
      <div class="email-item-date">${formatDate(email.date)}</div>
    `;
    item.addEventListener('click', () => openEmail(email.id));
    elements.emailList.appendChild(item);
  });
}

// Escape HTML
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Open email detail
async function openEmail(id) {
  const data = await api('/email/' + id);
  if (data && data.email) {
    currentEmailId = id;
    currentEmailData = data.email;
    elements.emailFrom.textContent = data.email.from;
    elements.emailTo.textContent = data.email.to;
    elements.emailSubject.textContent = data.email.subject;
    elements.emailDate.textContent = new Date(data.email.date).toLocaleString();
    // Always show HTML first if available (looks better)
    if (data.email.html) {
      showEmailBody('html');
    } else {
      showEmailBody('text');
    }
    elements.emailModal.classList.remove('hidden');
    loadEmails();
  }
}

// Show email body based on tab
function showEmailBody(tab) {
  if (!currentEmailData) return;
  elements.tabText.classList.toggle('active', tab === 'text');
  elements.tabHtml.classList.toggle('active', tab === 'html');
  elements.tabSource.classList.toggle('active', tab === 'source');

  if (tab === 'html') {
    if (currentEmailData.html) {
      elements.emailBody.style.whiteSpace = 'normal';
      elements.emailBody.innerHTML = currentEmailData.html;
    } else {
      elements.emailBody.style.whiteSpace = 'pre-wrap';
      elements.emailBody.textContent = currentEmailData.body || '(No HTML content)';
    }
  } else if (tab === 'text') {
    elements.emailBody.style.whiteSpace = 'pre-wrap';
    var text = currentEmailData.body || '';
    // Decode quoted-printable
    text = text.replace(/=\r?\n/g, '');
    text = text.replace(/=([0-9A-Fa-f]{2})/g, function(m, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    });
    // Remove MIME boundaries
    text = text.replace(/------=_Part_[\s\S]*/g, '');
    text = text.replace(/--[a-zA-Z0-9_=-]+--?\s*$/gm, '');
    // Remove Content-Type/Content-Transfer lines
    text = text.replace(/Content-Type:.*[\r\n]*/gi, '');
    text = text.replace(/Content-Transfer-Encoding:.*[\r\n]*/gi, '');
    // Clean unicode spaces
    text = text.replace(/\u00A0/g, ' ');
    text = text.replace(/\xC2\xA0/g, ' ');
    // Clean extra whitespace
    text = text.replace(/\r\n/g, '\n');
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.trim();
    if (!text) {
      // Fallback: extract from HTML
      if (currentEmailData.html) {
        var h = currentEmailData.html;
        h = h.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        h = h.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        h = h.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
        h = h.replace(/<!--[\s\S]*?-->/g, '');
        h = h.replace(/<br\s*\/?>/gi, '\n');
        h = h.replace(/<\/p>/gi, '\n');
        h = h.replace(/<\/div>/gi, '\n');
        h = h.replace(/<[^>]*>/g, '');
        h = h.replace(/&nbsp;/g, ' ');
        h = h.replace(/&amp;/g, '&');
        h = h.replace(/[ \t]+/g, ' ');
        h = h.replace(/\n\s*\n/g, '\n\n');
        text = h.trim();
      } else {
        text = '(No text content)';
      }
    }
    // If text still has CSS artifacts, clean from HTML
    if (text.indexOf('@media') > -1 || text.indexOf('{') > -1) {
      if (currentEmailData.html) {
        var h2 = currentEmailData.html;
        h2 = h2.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        h2 = h2.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        h2 = h2.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
        h2 = h2.replace(/<!--[\s\S]*?-->/g, '');
        h2 = h2.replace(/<br\s*\/?>/gi, '\n');
        h2 = h2.replace(/<\/p>/gi, '\n');
        h2 = h2.replace(/<\/div>/gi, '\n');
        h2 = h2.replace(/<[^>]*>/g, '');
        h2 = h2.replace(/&nbsp;/g, ' ');
        h2 = h2.replace(/&amp;/g, '&');
        h2 = h2.replace(/[ \t]+/g, ' ');
        h2 = h2.replace(/\n\s*\n/g, '\n\n');
        text = h2.trim();
      }
    }
    elements.emailBody.textContent = text;
  } else {
    elements.emailBody.style.whiteSpace = 'pre-wrap';
    var source = 'From: ' + currentEmailData.from + '\n';
    source += 'To: ' + currentEmailData.to + '\n';
    source += 'Subject: ' + currentEmailData.subject + '\n';
    source += 'Date: ' + currentEmailData.date + '\n';
    source += '\n--- Body ---\n\n';
    if (currentEmailData.html) {
      var hs = currentEmailData.html;
      hs = hs.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
      hs = hs.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
      hs = hs.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
      hs = hs.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '');
      hs = hs.replace(/<!--[\s\S]*?-->/g, '');
      hs = hs.replace(/<br\s*\/?>/gi, '\n');
      hs = hs.replace(/<\/p>/gi, '\n');
      hs = hs.replace(/<\/div>/gi, '\n');
      hs = hs.replace(/<[^>]*>/g, '');
      hs = hs.replace(/&nbsp;/g, ' ');
      hs = hs.replace(/&amp;/g, '&');
      hs = hs.replace(/\@media[^}]*\{[^}]*(\{[^}]*\}[^}]*)*\}/g, '');
      hs = hs.replace(/\.[a-zA-Z_-]+\s*\{[^}]*\}/g, '');
      hs = hs.replace(/#[a-zA-Z_-]+\s*\{[^}]*\}/g, '');
      hs = hs.replace(/[a-zA-Z]+\s*\{[^}]*\}/g, '');
      hs = hs.replace(/[ \t]+/g, ' ');
      hs = hs.replace(/\n\s*\n/g, '\n\n');
      source += hs.trim();
    } else {
      source += currentEmailData.body || '';
    }
    elements.emailBody.textContent = source;
  }
}



// Close email modal
function closeEmail() {
  elements.emailModal.classList.add('hidden');
  currentEmailId = null;
  currentEmailData = null;
}

// Delete current email
async function deleteCurrentEmail() {
  if (!currentEmailId) return;
  await api('/email/' + currentEmailId, { method: 'DELETE' });
  closeEmail();
  loadEmails();
  showToast('Email deleted');
}

// Delete all emails
async function deleteAllEmails() {
  if (!currentAddress) return;
  if (!confirm('Delete all emails in this inbox?')) return;
  await api('/emails?address=' + encodeURIComponent(currentAddress), { method: 'DELETE' });
  loadEmails();
  showToast('All emails deleted');
}

// Copy address to clipboard
function copyAddress() {
  if (!currentAddress) {
    showToast('No address to copy', 'error');
    return;
  }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(currentAddress).then(() => {
      showToast('Copied to clipboard!');
    });
  } else {
    elements.emailAddress.select();
    document.execCommand('copy');
    showToast('Copied to clipboard!');
  }
}

// Auto-refresh toggle
function toggleAutoRefresh() {
  if (elements.autoRefresh.checked) {
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshInterval = setInterval(() => {
    if (currentAddress) loadEmails();
  }, 5000);
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

// Event Listeners
elements.generateBtn.addEventListener('click', generateAddress);
elements.customBtn.addEventListener('click', useCustomAddress);
elements.copyBtn.addEventListener('click', copyAddress);
elements.refreshBtn.addEventListener('click', loadEmails);
elements.deleteAllBtn.addEventListener('click', deleteAllEmails);
elements.backBtn.addEventListener('click', closeEmail);
elements.deleteEmailBtn.addEventListener('click', deleteCurrentEmail);
elements.autoRefresh.addEventListener('change', toggleAutoRefresh);
elements.domainSelect.addEventListener('change', updateCustomDomainLabel);
elements.tabText.addEventListener('click', () => showEmailBody('text'));
elements.tabHtml.addEventListener('click', () => showEmailBody('html'));
elements.tabSource.addEventListener('click', () => showEmailBody('source'));

// Theme toggle
var themeToggleBtn = document.getElementById('themeToggle');
if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', toggleTheme);
}

// Allow Enter key on custom username
elements.customUsername.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') useCustomAddress();
});

// Initialize
async function init() {
  await loadDomains();
  await loadConfig();
  if (currentAddress) {
    elements.emailAddress.value = currentAddress;
    loadEmails();
  }
  startAutoRefresh();
}

init();
