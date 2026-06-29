/**
 * Temporary eMail - Main Application
 * Web server + Email webhook receiver
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const config = require('../config');
const db = require('./database');
const cloudflare = require('./cloudflare');

// MIME types
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

// Parse JSON body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

// Parse raw body (for email content)
function parseRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// Send JSON response
function sendJSON(res, data, status = 200) {
  res.writeHead(status, { 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Webhook-Secret'
  });
  res.end(JSON.stringify(data));
}

// Generate random username
function generateUsername() {
  const adjectives = ['quick', 'lazy', 'happy', 'sad', 'bright', 'dark', 'cool', 'warm', 'fast', 'slow', 'wild', 'calm', 'bold', 'shy', 'free'];
  const nouns = ['fox', 'cat', 'dog', 'bird', 'wolf', 'bear', 'deer', 'hawk', 'fish', 'lion', 'tiger', 'eagle', 'shark', 'panda', 'koala'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 999);
  return `${adj}.${noun}${num}`;
}

// Verify webhook secret
function verifyWebhook(req) {
  const secret = req.headers['x-webhook-secret'] || '';
  return secret === config.WEBHOOK_SECRET;
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Webhook-Secret'
    });
    res.end();
    return;
  }

  // API Routes
  if (pathname.startsWith('/api/')) {
    
    // GET /api/domains - Get available domains
    if (pathname === '/api/domains' && method === 'GET') {
      return sendJSON(res, { domains: db.getDomains() });
    }

    // GET /api/generate - Generate random email address
    if (pathname === '/api/generate' && method === 'GET') {
      const domains = db.getDomains();
      const domain = parsedUrl.query.domain || domains[0];
      const username = generateUsername();
      const address = `${username}@${domain}`;
      db.getOrCreateMailbox(address);
      return sendJSON(res, { address });
    }

    // POST /api/mailbox - Create/access mailbox with specific address
    if (pathname === '/api/mailbox' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.address) {
        return sendJSON(res, { error: 'Address is required' }, 400);
      }
      const address = body.address.toLowerCase();
      const domain = address.split('@')[1];
      const domains = db.getDomains();
      if (!domains.includes(domain)) {
        return sendJSON(res, { error: 'Invalid domain. Available: ' + domains.join(', ') }, 400);
      }
      db.getOrCreateMailbox(address);
      return sendJSON(res, { address });
    }

    // GET /api/emails?address=xxx - Get emails for address
    if (pathname === '/api/emails' && method === 'GET') {
      const address = parsedUrl.query.address;
      if (!address) {
        return sendJSON(res, { error: 'Address parameter required' }, 400);
      }
      const emails = db.getEmails(address);
      return sendJSON(res, { emails, count: emails.length });
    }

    // GET /api/email/:id - Get single email
    if (pathname.match(/^\/api\/email\/[^/]+$/) && method === 'GET') {
      const id = pathname.split('/').pop();
      const email = db.getEmail(id);
      if (!email) {
        return sendJSON(res, { error: 'Email not found' }, 404);
      }
      db.markAsRead(id);
      return sendJSON(res, { email });
    }

    // DELETE /api/email/:id - Delete single email
    if (pathname.match(/^\/api\/email\/[^/]+$/) && method === 'DELETE') {
      const id = pathname.split('/').pop();
      db.deleteEmail(id);
      return sendJSON(res, { success: true });
    }

    // DELETE /api/emails?address=xxx - Delete all emails for address
    if (pathname === '/api/emails' && method === 'DELETE') {
      const address = parsedUrl.query.address;
      if (!address) {
        return sendJSON(res, { error: 'Address parameter required' }, 400);
      }
      db.deleteAllEmails(address);
      return sendJSON(res, { success: true });
    }

    // GET /api/config - Get public config info
    if (pathname === '/api/config' && method === 'GET') {
      return sendJSON(res, {
        domains: db.getDomains(),
        expiryMinutes: config.EMAIL_EXPIRY_MINUTES
      });
    }

    return sendJSON(res, { error: 'Not Found' }, 404);
  }

  // ==========================================
  // ADMIN API: /admin/*
  // ==========================================
  if (pathname.startsWith('/admin/api/')) {
    // Login doesn't need auth
    if (pathname === '/admin/api/login' && method === 'POST') {
      const body = await parseBody(req);
      if (body.password === config.ADMIN_PASSWORD) {
        return sendJSON(res, { success: true, token: config.ADMIN_PASSWORD });
      }
      return sendJSON(res, { error: 'Wrong password' }, 401);
    }

    // Verify admin password for all other routes
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace('Bearer ', '');
    if (token !== config.ADMIN_PASSWORD) {
      return sendJSON(res, { error: 'Unauthorized' }, 401);
    }

    // GET /admin/api/stats - Dashboard statistics
    if (pathname === '/admin/api/stats' && method === 'GET') {
      return sendJSON(res, db.getStats());
    }

    // GET /admin/api/domains - List all domains
    if (pathname === '/admin/api/domains' && method === 'GET') {
      return sendJSON(res, { domains: db.getDomains() });
    }

    // POST /admin/api/domains - Add a domain
    if (pathname === '/admin/api/domains' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.domain) {
        return sendJSON(res, { error: 'Domain is required' }, 400);
      }
      const domain = body.domain.toLowerCase().trim();
      if (!/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
        return sendJSON(res, { error: 'Invalid domain format' }, 400);
      }
      const domains = db.addDomain(domain);
      return sendJSON(res, { success: true, domains });
    }

    // DELETE /admin/api/domains - Remove a domain
    if (pathname === '/admin/api/domains' && method === 'DELETE') {
      const domain = parsedUrl.query.domain;
      if (!domain) {
        return sendJSON(res, { error: 'Domain parameter required' }, 400);
      }
      const domains = db.removeDomain(domain);
      return sendJSON(res, { success: true, domains });
    }

    // POST /admin/api/domains/auto-setup - Auto setup domain via Cloudflare
    if (pathname === '/admin/api/domains/auto-setup' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.domain) {
        return sendJSON(res, { error: 'Domain is required' }, 400);
      }
      const domain = body.domain.toLowerCase().trim();
      if (!/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
        return sendJSON(res, { error: 'Format domain tidak valid' }, 400);
      }

      if (!cloudflare.isConfigured()) {
        return sendJSON(res, { error: 'Cloudflare API belum dikonfigurasi. Set CLOUDFLARE_API_TOKEN dan CLOUDFLARE_ACCOUNT_ID di environment.' }, 400);
      }

      console.log('[ADMIN] Auto-setup domain:', domain);
      const result = await cloudflare.setupDomain(domain);
      
      if (result.success) {
        // Add to local domain list
        db.addDomain(domain);
      }

      return sendJSON(res, result);
    }

    // GET /admin/api/cloudflare-status - Check if Cloudflare API is configured
    if (pathname === '/admin/api/cloudflare-status' && method === 'GET') {
      return sendJSON(res, { configured: cloudflare.isConfigured() });
    }

    // GET /admin/api/config - Get full config
    if (pathname === '/admin/api/config' && method === 'GET') {
      return sendJSON(res, {
        domains: db.getDomains(),
        webhookSecret: config.WEBHOOK_SECRET,
        emailExpiry: config.EMAIL_EXPIRY_MINUTES,
        webhookUrl: '/webhook/email'
      });
    }

    return sendJSON(res, { error: 'Not Found' }, 404);
  }

  // ==========================================
  // WEBHOOK: Receive email from Cloudflare
  // POST /webhook/email
  // ==========================================
  if (pathname === '/webhook/email' && method === 'POST') {
    // Verify webhook secret
    if (!verifyWebhook(req)) {
      console.log('[WEBHOOK] Unauthorized request');
      return sendJSON(res, { error: 'Unauthorized' }, 401);
    }

    try {
      const body = await parseBody(req);
      
      const to = (body.to || '').toLowerCase();
      const from = body.from || 'unknown@unknown.com';
      const subject = body.subject || '(No Subject)';
      let text = body.text || '';
      let html = body.html || '';
      const date = body.date || new Date().toISOString();
      const attachments = body.attachments || [];

      if (!to) {
        return sendJSON(res, { error: 'Missing "to" field' }, 400);
      }

      // Decode quoted-printable if still encoded
      function decodeQP(str) {
        return str.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, function(m, hex) {
          return String.fromCharCode(parseInt(hex, 16));
        });
      }

      // Check if text/html still has QP encoding
      if (text.indexOf('=C2=A0') > -1 || text.indexOf('=3D') > -1 || text.indexOf('=\n') > -1) {
        text = decodeQP(text);
      }
      if (html.indexOf('=C2=A0') > -1 || html.indexOf('=3D') > -1 || html.indexOf('=\n') > -1) {
        html = decodeQP(html);
      }

      // Remove MIME boundary leftovers from text
      text = text.replace(/------=_Part_[\s\S]*/g, '').trim();
      // Clean non-breaking spaces
      text = text.replace(/\xC2\xA0/g, ' ').replace(/\u00A0/g, ' ');

      // If text is empty but html exists, extract text from html
      if (!text && html) {
        // Remove style, script, head tags and their content first
        var cleanHtml = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        cleanHtml = cleanHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        cleanHtml = cleanHtml.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
        cleanHtml = cleanHtml.replace(/<!--[\s\S]*?-->/g, '');
        // Replace br/p/div with newlines
        cleanHtml = cleanHtml.replace(/<br\s*\/?>/gi, '\n');
        cleanHtml = cleanHtml.replace(/<\/p>/gi, '\n');
        cleanHtml = cleanHtml.replace(/<\/div>/gi, '\n');
        cleanHtml = cleanHtml.replace(/<\/tr>/gi, '\n');
        cleanHtml = cleanHtml.replace(/<\/li>/gi, '\n');
        // Remove all remaining HTML tags
        cleanHtml = cleanHtml.replace(/<[^>]*>/g, '');
        // Decode HTML entities
        cleanHtml = cleanHtml.replace(/&nbsp;/g, ' ');
        cleanHtml = cleanHtml.replace(/&amp;/g, '&');
        cleanHtml = cleanHtml.replace(/&lt;/g, '<');
        cleanHtml = cleanHtml.replace(/&gt;/g, '>');
        cleanHtml = cleanHtml.replace(/&quot;/g, '"');
        // Clean whitespace
        cleanHtml = cleanHtml.replace(/[ \t]+/g, ' ');
        cleanHtml = cleanHtml.replace(/\n\s*\n/g, '\n\n');
        text = cleanHtml.trim();
      }

      // Also clean text if it contains CSS/HTML artifacts
      if (text.indexOf('@media') > -1 || text.indexOf('{') > -1) {
        // Text likely contains CSS - re-extract from HTML
        if (html) {
          var cleanHtml2 = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
          cleanHtml2 = cleanHtml2.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
          cleanHtml2 = cleanHtml2.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
          cleanHtml2 = cleanHtml2.replace(/<!--[\s\S]*?-->/g, '');
          cleanHtml2 = cleanHtml2.replace(/<br\s*\/?>/gi, '\n');
          cleanHtml2 = cleanHtml2.replace(/<\/p>/gi, '\n');
          cleanHtml2 = cleanHtml2.replace(/<\/div>/gi, '\n');
          cleanHtml2 = cleanHtml2.replace(/<[^>]*>/g, '');
          cleanHtml2 = cleanHtml2.replace(/&nbsp;/g, ' ');
          cleanHtml2 = cleanHtml2.replace(/&amp;/g, '&');
          cleanHtml2 = cleanHtml2.replace(/[ \t]+/g, ' ');
          cleanHtml2 = cleanHtml2.replace(/\n\s*\n/g, '\n\n');
          text = cleanHtml2.trim();
        }
      }

      // If there are image attachments, embed them in HTML
      let finalHtml = html;

      // Remove broken CID image references that have no data
      finalHtml = finalHtml.replace(/<img[^>]*src=["']cid:[^"']*["'][^>]*>/gi, '');
      
      // Remove any remaining broken image tags with empty or invalid src
      finalHtml = finalHtml.replace(/<img[^>]*src=["'](?!data:|https?:\/\/)[^"']*["'][^>]*>/gi, '');

      if (attachments.length > 0) {
        let imgHtml = '';
        attachments.forEach(att => {
          if (att.contentType && att.contentType.startsWith('image/')) {
            imgHtml += '<div style="margin:10px 0"><img src="data:' + att.contentType + ';base64,' + att.data + '" style="max-width:100%;height:auto;border-radius:4px" alt="' + (att.filename || 'image') + '"></div>';
          }
        });
        if (imgHtml) {
          finalHtml = (finalHtml || '') + imgHtml;
        }
      }

      // Save email
      db.getOrCreateMailbox(to);
      const saved = db.saveEmail({
        to: to,
        from: from,
        subject: subject,
        body: text,
        html: finalHtml,
        date: date
      });

      console.log(`[WEBHOOK] Email received: ${from} -> ${to} | Subject: ${subject} | Attachments: ${attachments.length}`);
      return sendJSON(res, { success: true, id: saved.id });
    } catch (e) {
      console.error('[WEBHOOK] Error:', e.message);
      return sendJSON(res, { error: 'Internal error' }, 500);
    }
  }

  // Health check
  if (pathname === '/health') {
    return sendJSON(res, { status: 'ok', uptime: process.uptime() });
  }

  // Serve static files
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(__dirname, '..', 'public', filePath);

  // Security: prevent directory traversal
  const publicDir = path.resolve(__dirname, '..', 'public');
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const stat = fs.statSync(resolvedPath);
    if (stat.isFile()) {
      const ext = path.extname(resolvedPath);
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const content = fs.readFileSync(resolvedPath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  } catch (e) {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// Start server
const PORT = config.WEB_PORT;
server.listen(PORT, config.WEB_HOST, () => {
  console.log('='.repeat(50));
  console.log('  RICHMAIL - Disposable Email Service');
  console.log('='.repeat(50));
  console.log(`  Web Interface: http://localhost:${PORT}`);
  console.log(`  Webhook: http://localhost:${PORT}/webhook/email`);
  console.log(`  Domains: ${config.DOMAINS.join(', ')}`);
  console.log(`  Email Expiry: ${config.EMAIL_EXPIRY_MINUTES} minutes`);
  console.log('='.repeat(50));
});
