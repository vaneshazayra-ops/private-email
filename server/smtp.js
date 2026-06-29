/**
 * Simple SMTP Server for receiving emails
 * Built with Node.js net module (no external dependencies)
 */

const net = require('net');
const config = require('../config');
const db = require('./database');

class SMTPServer {
  constructor() {
    this.server = null;
  }

  start() {
    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    this.server.listen(config.SMTP_PORT, config.SMTP_HOST, () => {
      console.log(`[SMTP] Server listening on ${config.SMTP_HOST}:${config.SMTP_PORT}`);
      console.log(`[SMTP] Accepting mail for domains: ${config.DOMAINS.join(', ')}`);
    });

    this.server.on('error', (err) => {
      console.error('[SMTP] Server error:', err.message);
    });
  }

  handleConnection(socket) {
    let state = 'GREETING';
    let mailFrom = '';
    let rcptTo = [];
    let dataBuffer = '';
    let receivingData = false;

    // Send greeting
    socket.write('220 TempMail SMTP Server Ready\r\n');

    socket.on('data', (chunk) => {
      const input = chunk.toString();

      if (receivingData) {
        dataBuffer += input;
        // Check for end of data marker
        if (dataBuffer.includes('\r\n.\r\n')) {
          receivingData = false;
          const emailData = dataBuffer.replace('\r\n.\r\n', '');
          this.processEmail(mailFrom, rcptTo, emailData);
          socket.write('250 OK Message accepted\r\n');
          // Reset for next message
          mailFrom = '';
          rcptTo = [];
          dataBuffer = '';
        }
        return;
      }

      const lines = input.split('\r\n').filter(l => l.length > 0);

      for (const line of lines) {
        const command = line.toUpperCase();

        if (command.startsWith('EHLO') || command.startsWith('HELO')) {
          socket.write('250-TempMail Hello\r\n');
          socket.write('250-SIZE ' + config.MAX_EMAIL_SIZE + '\r\n');
          socket.write('250 OK\r\n');

        } else if (command.startsWith('MAIL FROM:')) {
          mailFrom = this.extractAddress(line);
          socket.write('250 OK\r\n');

        } else if (command.startsWith('RCPT TO:')) {
          const addr = this.extractAddress(line);
          const domain = addr.split('@')[1];
          
          if (config.DOMAINS.includes(domain)) {
            rcptTo.push(addr);
            socket.write('250 OK\r\n');
          } else {
            socket.write('550 User not found\r\n');
          }

        } else if (command === 'DATA') {
          if (rcptTo.length === 0) {
            socket.write('503 No recipients\r\n');
          } else {
            receivingData = true;
            dataBuffer = '';
            socket.write('354 Start mail input; end with <CRLF>.<CRLF>\r\n');
          }

        } else if (command === 'QUIT') {
          socket.write('221 Bye\r\n');
          socket.end();

        } else if (command === 'RSET') {
          mailFrom = '';
          rcptTo = [];
          dataBuffer = '';
          socket.write('250 OK\r\n');

        } else if (command === 'NOOP') {
          socket.write('250 OK\r\n');

        } else {
          socket.write('500 Command not recognized\r\n');
        }
      }
    });

    socket.on('error', (err) => {
      // Connection reset, ignore
    });

    socket.on('timeout', () => {
      socket.write('421 Connection timeout\r\n');
      socket.end();
    });

    socket.setTimeout(60000); // 60 second timeout
  }

  extractAddress(line) {
    const match = line.match(/<([^>]+)>/);
    if (match) return match[1].toLowerCase();
    // Try without angle brackets
    const parts = line.split(':');
    if (parts.length > 1) {
      return parts.slice(1).join(':').trim().toLowerCase();
    }
    return '';
  }

  processEmail(from, recipients, rawData) {
    // Parse email headers and body
    const parsed = this.parseEmail(rawData);
    
    for (const to of recipients) {
      // Ensure mailbox exists
      db.getOrCreateMailbox(to);
      
      // Save email
      db.saveEmail({
        to: to,
        from: parsed.from || from,
        subject: parsed.subject,
        body: parsed.body,
        html: parsed.html,
        date: parsed.date || new Date().toISOString()
      });

      console.log(`[SMTP] Email received: ${from} -> ${to} | Subject: ${parsed.subject}`);
    }
  }

  parseEmail(rawData) {
    const result = {
      from: '',
      subject: '(No Subject)',
      body: '',
      html: '',
      date: ''
    };

    // Split headers and body
    const headerBodySplit = rawData.indexOf('\r\n\r\n');
    let headers = '';
    let body = '';

    if (headerBodySplit !== -1) {
      headers = rawData.substring(0, headerBodySplit);
      body = rawData.substring(headerBodySplit + 4);
    } else {
      // Try with just \n\n
      const altSplit = rawData.indexOf('\n\n');
      if (altSplit !== -1) {
        headers = rawData.substring(0, altSplit);
        body = rawData.substring(altSplit + 2);
      } else {
        headers = rawData;
      }
    }

    // Parse headers
    const headerLines = headers.split(/\r?\n/);
    let currentHeader = '';

    for (const line of headerLines) {
      if (line.startsWith(' ') || line.startsWith('\t')) {
        currentHeader += ' ' + line.trim();
      } else {
        if (currentHeader) {
          this.processHeader(currentHeader, result);
        }
        currentHeader = line;
      }
    }
    if (currentHeader) {
      this.processHeader(currentHeader, result);
    }

    // Check if body is HTML
    if (body.includes('<html') || body.includes('<HTML') || body.includes('<div') || body.includes('<p>')) {
      result.html = body;
      result.body = body.replace(/<[^>]*>/g, '').trim();
    } else {
      result.body = body;
    }

    return result;
  }

  processHeader(header, result) {
    const lower = header.toLowerCase();
    if (lower.startsWith('from:')) {
      result.from = header.substring(5).trim();
    } else if (lower.startsWith('subject:')) {
      result.subject = header.substring(8).trim();
    } else if (lower.startsWith('date:')) {
      result.date = header.substring(5).trim();
    }
  }
}

module.exports = SMTPServer;
