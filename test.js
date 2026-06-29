/**
 * Integration test for TempMail
 * Tests: Web API + SMTP server + email delivery
 */

// Remove NODE_OPTIONS to prevent issues
delete process.env.NODE_OPTIONS;

const http = require('http');
const net = require('net');

const API_BASE = 'http://127.0.0.1:3000';
const SMTP_PORT = 2525;

function httpRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sendSMTPEmail(from, to, subject, body) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let step = 0;
    let output = '';
    const commands = [
      `EHLO test.local`,
      `MAIL FROM:<${from}>`,
      `RCPT TO:<${to}>`,
      'DATA',
      `From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\nDate: Wed, 24 Jun 2026 10:00:00 +0000\r\n\r\n${body}\r\n.`,
      'QUIT'
    ];

    client.connect(SMTP_PORT, '127.0.0.1', () => {});
    client.on('data', (data) => {
      output += data.toString();
      if (step < commands.length) {
        client.write(commands[step] + '\r\n');
        step++;
      } else {
        client.end();
      }
    });
    client.on('close', () => resolve(output));
    client.on('end', () => resolve(output));
    client.on('error', (e) => resolve(output || e.message));
    setTimeout(() => { client.destroy(); resolve(output || 'timeout'); }, 3000);
  });
}

async function runTests() {
  console.log('=== TempMail Integration Tests ===\n');
  let passed = 0;
  let failed = 0;

  // Test 1: Get domains
  try {
    const res = await httpRequest('GET', '/api/domains');
    console.log('Test 1 - Get Domains:', res.domains.length > 0 ? 'PASS' : 'FAIL');
    console.log('  Domains:', res.domains.join(', '));
    if (res.domains.length > 0) passed++; else failed++;
  } catch(e) { console.log('Test 1 - FAIL:', e.message); failed++; }

  // Test 2: Generate address
  try {
    const res = await httpRequest('GET', '/api/generate?domain=mymail.com');
    console.log('Test 2 - Generate Address:', res.address ? 'PASS' : 'FAIL');
    console.log('  Generated:', res.address);
    if (res.address) passed++; else failed++;
  } catch(e) { console.log('Test 2 - FAIL:', e.message); failed++; }

  // Test 3: Custom address
  try {
    const res = await httpRequest('POST', '/api/mailbox', { address: 'user@mymail.com' });
    console.log('Test 3 - Custom Address:', res.address === 'user@mymail.com' ? 'PASS' : 'FAIL');
    if (res.address === 'user@mymail.com') passed++; else failed++;
  } catch(e) { console.log('Test 3 - FAIL:', e.message); failed++; }

  // Test 4: Empty inbox
  try {
    const res = await httpRequest('GET', '/api/emails?address=user@mymail.com');
    console.log('Test 4 - Empty Inbox:', res.count === 0 ? 'PASS' : 'FAIL');
    if (res.count === 0) passed++; else failed++;
  } catch(e) { console.log('Test 4 - FAIL:', e.message); failed++; }

  // Test 5: Send email via SMTP
  try {
    const smtpRes = await sendSMTPEmail(
      'sender@example.com',
      'user@mymail.com',
      'Test Email Subject',
      'Hello!\nThis is the email body.\nLine 3.'
    );
    console.log('Test 5 - SMTP Send:', smtpRes.includes('250') ? 'PASS' : 'FAIL');
    if (smtpRes.includes('250')) passed++; else failed++;
  } catch(e) { console.log('Test 5 - FAIL:', e.message); failed++; }

  // Wait a moment for processing
  await new Promise(r => setTimeout(r, 500));

  // Test 6: Check inbox has email
  try {
    const res = await httpRequest('GET', '/api/emails?address=user@mymail.com');
    console.log('Test 6 - Inbox Has Email:', res.count === 1 ? 'PASS' : 'FAIL');
    console.log('  Count:', res.count);
    if (res.count >= 1) {
      console.log('  Subject:', res.emails[0].subject);
      console.log('  From:', res.emails[0].from);
      passed++;
    } else { failed++; }
  } catch(e) { console.log('Test 6 - FAIL:', e.message); failed++; }

  // Test 7: Read single email
  try {
    const inbox = await httpRequest('GET', '/api/emails?address=user@mymail.com');
    if (inbox.emails.length > 0) {
      const res = await httpRequest('GET', '/api/email/' + inbox.emails[0].id);
      console.log('Test 7 - Read Email:', res.email ? 'PASS' : 'FAIL');
      if (res.email) {
        console.log('  Body:', res.email.body.substring(0, 60));
        passed++;
      } else failed++;
    }
  } catch(e) { console.log('Test 7 - FAIL:', e.message); failed++; }

  // Test 8: Send second email
  try {
    await sendSMTPEmail(
      'admin@company.com',
      'user@mymail.com',
      'Second Test Email',
      'This is email number two.'
    );
    await new Promise(r => setTimeout(r, 300));
    const res = await httpRequest('GET', '/api/emails?address=user@mymail.com');
    console.log('Test 8 - Multiple Emails:', res.count === 2 ? 'PASS' : 'FAIL');
    console.log('  Count:', res.count);
    if (res.count === 2) passed++; else failed++;
  } catch(e) { console.log('Test 8 - FAIL:', e.message); failed++; }

  // Test 9: Static file serving
  try {
    const res = await httpRequest('GET', '/');
    const isHtml = typeof res === 'string' && res.includes('<!DOCTYPE html>');
    console.log('Test 9 - Static Files:', isHtml ? 'PASS' : 'FAIL');
    if (isHtml) passed++; else failed++;
  } catch(e) { console.log('Test 9 - FAIL:', e.message); failed++; }

  // Test 10: Config endpoint
  try {
    const res = await httpRequest('GET', '/api/config');
    console.log('Test 10 - Config:', res.smtpPort ? 'PASS' : 'FAIL');
    if (res.smtpPort) passed++; else failed++;
  } catch(e) { console.log('Test 10 - FAIL:', e.message); failed++; }

  console.log(`\n=== Results: ${passed}/${passed + failed} tests passed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
