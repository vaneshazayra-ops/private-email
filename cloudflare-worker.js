export default {
  async email(message, env, ctx) {
    // GANTI URL DENGAN URL RENDER ANDA
    var url = "https://NAMA-APP-ANDA.onrender.com/webhook/email";
    // GANTI SECRET SAMA DENGAN WEBHOOK_SECRET DI RENDER
    var secret = "GANTI-DENGAN-WEBHOOK-SECRET-ANDA";
    var subject = message.headers.get("subject") || "No Subject";
    var from = message.from || "unknown";
    var to = message.to || "unknown";
    var date = message.headers.get("date") || new Date().toISOString();
    var contentType = message.headers.get("content-type") || "";
    var raw = await new Response(message.raw).text();
    var body = "";
    var html = "";
    var attachments = [];

    function decodeQuotedPrintable(str) {
      return str.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, function(m, hex) {
        return String.fromCharCode(parseInt(hex, 16));
      });
    }

    function decodeContent(content, headers) {
      var encoding = "";
      var encMatch = headers.match(/content-transfer-encoding:\s*([^\r\n]+)/i);
      if (encMatch) encoding = encMatch[1].trim().toLowerCase();
      if (encoding === "quoted-printable") {
        return decodeQuotedPrintable(content);
      } else if (encoding === "base64") {
        try {
          return atob(content.replace(/[\r\n\s]/g, ""));
        } catch(e) {
          return content;
        }
      }
      return content;
    }

    function parseParts(content, boundary) {
      var parts = content.split("--" + boundary);
      for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (part === "" || part === "--" || part.trim() === "--") continue;
        var headerEnd = part.indexOf("\r\n\r\n");
        if (headerEnd === -1) headerEnd = part.indexOf("\n\n");
        if (headerEnd === -1) continue;
        var partHeaderStr = part.substring(0, headerEnd);
        var partHeaders = partHeaderStr.toLowerCase();
        var partContent = part.substring(headerEnd + 4);
        partContent = partContent.replace(/\r?\n--$/, "").trim();
        if (partHeaders.indexOf("multipart/") > -1) {
          var nestedBoundary = partHeaders.match(/boundary="?([^";\s\r\n]+)"?/);
          if (nestedBoundary) {
            parseParts(partContent, nestedBoundary[1]);
          }
        } else if (partHeaders.indexOf("text/plain") > -1 && !body) {
          body = decodeContent(partContent, partHeaderStr);
        } else if (partHeaders.indexOf("text/html") > -1 && !html) {
          html = decodeContent(partContent, partHeaderStr);
        } else if (partHeaders.indexOf("image/") > -1) {
          var nameMatch = partHeaders.match(/name="?([^";\r\n]+)"?/);
          var filename = nameMatch ? nameMatch[1].trim() : "image.png";
          var ctMatch = partHeaderStr.match(/content-type:\s*([^\r\n;]+)/i);
          var mimeType = ctMatch ? ctMatch[1].trim() : "image/png";
          var isBase64 = partHeaders.indexOf("base64") > -1;
          if (isBase64) {
            var cleanData = partContent.replace(/[\r\n\s]/g, "");
            attachments.push({
              filename: filename,
              contentType: mimeType,
              data: cleanData
            });
          }
        }
      }
    }

    var idx = raw.indexOf("\r\n\r\n");
    if (idx === -1) idx = raw.indexOf("\n\n");
    if (idx > -1) {
      var content = raw.substring(idx + 4);
      if (contentType.indexOf("multipart") > -1) {
        var boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/);
        if (boundaryMatch) {
          parseParts(content, boundaryMatch[1]);
        }
      } else if (contentType.indexOf("text/html") > -1) {
        html = decodeContent(content, raw.substring(0, idx));
      } else {
        body = decodeContent(content, raw.substring(0, idx));
      }
    }

    if (!body && html) {
      body = html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    }

    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": secret
      },
      body: JSON.stringify({
        from: from,
        to: to,
        subject: subject,
        text: body,
        html: html,
        attachments: attachments,
        date: date
      })
    });
  }
}
