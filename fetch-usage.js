#!/usr/bin/env node
// Fetch Qoder usage from API and update usage.json
// Usage: node fetch-usage.js [--force]
// Cookie stored in ~/.qoder/.auth/cookie

const fs = require('fs');
const path = require('path');
const os = require('os');

const USAGE_FILE = path.join(__dirname, 'usage.json');
const COOKIE_FILE = path.join(os.homedir(), '.qoder', '.auth', 'cookie');
const STALE_MS = 10 * 60 * 1000; // 10 minutes
const API_URL = 'https://qoder.com/api/v1/me/usages/big_model_credits';

function isFresh() {
  try {
    const stat = fs.statSync(USAGE_FILE);
    return (Date.now() - stat.mtimeMs) < STALE_MS;
  } catch { return false; }
}

function readCookie() {
  try {
    return fs.readFileSync(COOKIE_FILE, 'utf8').trim();
  } catch {
    return null;
  }
}

async function fetchUsage(cookie) {
  const res = await fetch(API_URL, {
    headers: {
      'User-Agent': 'QoderStatusline/1.0',
      'Accept': 'application/json',
      'Cookie': cookie,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('AUTH_EXPIRED');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const force = process.argv.includes('--force');

  if (!force && isFresh()) {
    console.log('usage.json is fresh, skipping.');
    return;
  }

  const cookie = readCookie();
  if (!cookie) {
    console.error('No cookie found in ~/.qoder/.auth/cookie, skipping usage fetch.');
    return;
  }

  console.log('Fetching usage data...');

  let data;
  try {
    data = await fetchUsage(cookie);
  } catch (e) {
    if (e.message === 'AUTH_EXPIRED') {
      console.error('Cookie expired. Please update ~/.qoder/.auth/cookie');
      const marker = {
        error: 'auth_expired',
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(USAGE_FILE, JSON.stringify(marker, null, 2) + '\n');
      return;
    }
    console.error(`Fetch failed: ${e.message}`);
    return;
  }

  const usage = {
    plan: data.status === 'active' ? 'Active' : data.status,
    total: data.limit_value || 0,
    used: data.used_value || 0,
    remaining: data.remaining_value || 0,
    addon: 0,
    nextReset: data.next_reset_at ? new Date(data.next_reset_at).toISOString() : null,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2) + '\n');
  console.log(`Updated usage.json: ${usage.remaining}/${usage.total} remaining.`);
}

main().catch(e => { console.error(e); process.exit(1); });
