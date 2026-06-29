/**
 * Cloudflare API Helper
 * Auto-setup domains for email routing
 */

const https = require('https');
const config = require('../config');

const CF_API = 'api.cloudflare.com';

// Make HTTPS request to Cloudflare API
function cfRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CF_API,
      port: 443,
      path: '/client/v4' + path,
      method: method,
      headers: {
        'Authorization': 'Bearer ' + config.CLOUDFLARE_API_TOKEN,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ success: false, errors: [{ message: 'Parse error' }] });
        }
      });
    });

    req.on('error', (e) => {
      resolve({ success: false, errors: [{ message: e.message }] });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Get zone ID for a domain
async function getZoneId(domain) {
  const res = await cfRequest('GET', '/zones?name=' + domain);
  if (res.success && res.result && res.result.length > 0) {
    return res.result[0].id;
  }
  return null;
}

// Add domain to Cloudflare account
async function addZone(domain) {
  const res = await cfRequest('POST', '/zones', {
    name: domain,
    account: { id: config.CLOUDFLARE_ACCOUNT_ID },
    type: 'full'
  });
  if (res.success) {
    return {
      success: true,
      zoneId: res.result.id,
      nameservers: res.result.name_servers,
      status: res.result.status
    };
  }
  // Check if already exists
  if (res.errors && res.errors[0] && res.errors[0].code === 1061) {
    const zoneId = await getZoneId(domain);
    return {
      success: true,
      zoneId: zoneId,
      nameservers: [],
      status: 'already_exists',
      message: 'Domain sudah ada di Cloudflare'
    };
  }
  return {
    success: false,
    error: res.errors ? res.errors[0].message : 'Unknown error'
  };
}

// Delete existing MX records
async function deleteMXRecords(zoneId) {
  const res = await cfRequest('GET', '/zones/' + zoneId + '/dns_records?type=MX');
  if (res.success && res.result) {
    for (const record of res.result) {
      await cfRequest('DELETE', '/zones/' + zoneId + '/dns_records/' + record.id);
    }
  }
}

// Add Cloudflare Email Routing MX records
async function addEmailMXRecords(zoneId, domain) {
  await deleteMXRecords(zoneId);

  const mxRecords = [
    { name: domain, content: 'route1.mx.cloudflare.net', priority: 1 },
    { name: domain, content: 'route2.mx.cloudflare.net', priority: 2 },
    { name: domain, content: 'route3.mx.cloudflare.net', priority: 3 }
  ];

  const results = [];
  for (const mx of mxRecords) {
    const res = await cfRequest('POST', '/zones/' + zoneId + '/dns_records', {
      type: 'MX',
      name: mx.name,
      content: mx.content,
      priority: mx.priority,
      ttl: 1
    });
    results.push(res.success);
  }

  // Also add SPF TXT record for email
  await cfRequest('POST', '/zones/' + zoneId + '/dns_records', {
    type: 'TXT',
    name: domain,
    content: 'v=spf1 include:_spf.mx.cloudflare.net ~all',
    ttl: 1
  });

  return results.every(r => r);
}

// Enable Email Routing for zone
async function enableEmailRouting(zoneId) {
  // Method 1: POST /zones/{zone_id}/email/routing/dns (new API)
  var res = await cfRequest('POST', '/zones/' + zoneId + '/email/routing/dns');
  if (res.success) return true;
  console.log('[CF] Enable method 1 failed:', JSON.stringify(res.errors || []));

  // Method 2: POST /zones/{zone_id}/email/routing/enable (legacy)
  res = await cfRequest('POST', '/zones/' + zoneId + '/email/routing/enable');
  if (res.success) return true;
  console.log('[CF] Enable method 2 failed:', JSON.stringify(res.errors || []));

  // Method 3: PUT /zones/{zone_id}/email/routing with enabled=true
  res = await cfRequest('PUT', '/zones/' + zoneId + '/email/routing', {
    enabled: true,
    skip_wizard: true
  });
  if (res.success) return true;
  console.log('[CF] Enable method 3 failed:', JSON.stringify(res.errors || []));

  return false;
}

// Create catch-all rule to forward to webhook
async function createCatchAllRule(zoneId) {
  // Use the dedicated catch-all endpoint
  // PUT /zones/{zone_id}/email/routing/rules/catch_all
  const res = await cfRequest('PUT', '/zones/' + zoneId + '/email/routing/rules/catch_all', {
    matchers: [{ type: 'all' }],
    actions: [{ type: 'worker', value: ['richmail-worker'] }],
    enabled: true
  });
  
  if (res.success) return true;

  // If worker action fails, try with drop (at least enable catch-all)
  // User will need to manually set worker in Cloudflare
  console.log('[CF] Catch-all worker setup result:', JSON.stringify(res.errors || []));
  return false;
}

// Full auto-setup for a new domain
async function setupDomain(domain) {
  const steps = [];

  if (!config.CLOUDFLARE_API_TOKEN || !config.CLOUDFLARE_ACCOUNT_ID) {
    return {
      success: false,
      error: 'Cloudflare API Token atau Account ID belum di-set',
      steps: []
    };
  }

  // Step 1: Add zone
  steps.push({ step: 'Menambah domain ke Cloudflare...', status: 'working' });
  const zone = await addZone(domain);
  if (!zone.success) {
    steps[0].status = 'failed';
    steps[0].error = zone.error;
    return { success: false, error: zone.error, steps };
  }
  steps[0].status = 'done';
  steps[0].info = zone.status === 'already_exists' ? 'Domain sudah ada' : 'Domain ditambahkan';

  const zoneId = zone.zoneId;

  // Step 2: Add MX records
  steps.push({ step: 'Menambah MX records...', status: 'working' });
  const mxOk = await addEmailMXRecords(zoneId, domain);
  steps[1].status = mxOk ? 'done' : 'warning';

  // Step 3: Enable email routing
  steps.push({ step: 'Mengaktifkan Email Routing...', status: 'working' });
  const routingOk = await enableEmailRouting(zoneId);
  steps[2].status = routingOk ? 'done' : 'warning';
  if (!routingOk) {
    steps[2].info = 'Mungkin perlu enable manual di Cloudflare';
  }

  // Step 4: Create catch-all rule
  steps.push({ step: 'Membuat catch-all routing rule...', status: 'working' });
  const ruleOk = await createCatchAllRule(zoneId);
  steps[3].status = ruleOk ? 'done' : 'warning';
  if (!ruleOk) {
    steps[3].info = 'Set catch-all ke Worker manual di Cloudflare';
  }

  return {
    success: true,
    zoneId: zoneId,
    nameservers: zone.nameservers || [],
    status: zone.status,
    steps: steps,
    message: zone.status === 'already_exists' 
      ? 'Domain sudah aktif di Cloudflare!' 
      : 'Domain ditambahkan! Ganti nameserver domain ke: ' + (zone.nameservers || []).join(', ')
  };
}

// Check if Cloudflare is configured
function isConfigured() {
  return !!(config.CLOUDFLARE_API_TOKEN && config.CLOUDFLARE_ACCOUNT_ID);
}

module.exports = {
  setupDomain,
  getZoneId,
  addZone,
  addEmailMXRecords,
  enableEmailRouting,
  createCatchAllRule,
  isConfigured
};
