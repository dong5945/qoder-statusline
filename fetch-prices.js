#!/usr/bin/env node
// Fetch latest Qoder model pricing from docs and update model-prices.json
// Usage: node fetch-prices.js [--force]
// Without --force, skips fetch if model-prices.json is < 6 hours old.

const fs = require('fs');
const path = require('path');

const PRICES_FILE = path.join(__dirname, 'model-prices.json');
const STALE_MS = 6 * 60 * 60 * 1000; // 6 hours
const TIER_URL = 'https://docs.qoder.com/user-guide/chat/model-tier-selector';
const DISCOUNT_URL = 'https://docs.qoder.com/events/offpeakrate';

function isFresh() {
  try {
    const stat = fs.statSync(PRICES_FILE);
    return (Date.now() - stat.mtimeMs) < STALE_MS;
  } catch { return false; }
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'QoderStatusline/1.0', 'Accept': 'text/html' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function stripTags(s) {
  return s.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
}

function parseTierPrices(html) {
  const models = {};
  const rows = html.match(/<tr>[\s\S]*?<\/tr>/g) || [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => stripTags(m[1]));
    if (cells.length < 2) continue;
    const lastCell = cells[cells.length - 1];
    const nameRaw = cells[0];

    const priceMatch = lastCell.match(/~?([\d.]+)×/) || lastCell.match(/^Free$/i);
    if (!priceMatch) continue;

    let name = nameRaw.replace(/\s*\(.*?\)\s*/g, '').trim();
    if (!name) continue;

    if (/^free$/i.test(lastCell)) {
      models[name] = { price: 0 };
    } else {
      const factor = parseFloat(priceMatch[1]);
      if (!isNaN(factor)) models[name] = { price: factor };
    }
  }
  return models;
}

function parseDiscounts(html) {
  const discounts = {};
  const rows = html.match(/<tr>[\s\S]*?<\/tr>/g) || [];

  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => stripTags(m[1]));

    if (cells.length === 4) {
      const name = cells[0].trim();
      const standard = parseFloat((cells[1].match(/([\d.]+)x/) || [])[1]);
      const regularFactor = parseFloat((cells[2].match(/([\d.]+)x/) || [])[1]);
      const offPeakFactor = parseFloat((cells[3].match(/([\d.]+)x/) || [])[1]);

      if (isNaN(standard) || isNaN(offPeakFactor) || !name) continue;

      const d = {};
      d.offPeak = { factor: offPeakFactor, utcStart: 14, utcEnd: 24 };
      if (!isNaN(regularFactor) && regularFactor < standard) {
        d.regular = { factor: regularFactor, utcStart: 0, utcEnd: 14 };
      }
      discounts[name] = d;
    }

    if (cells.length === 3) {
      for (const [name, disc] of Object.entries(discounts)) {
        if (cells[0].includes(name) && disc.offPeak) {
          const dateMatch = cells[2].match(/(\w+\s+\d+,?\s*\d{4})/);
          if (dateMatch) {
            const d = new Date(dateMatch[1] + ' 00:00:00 UTC');
            if (!isNaN(d.getTime())) disc.offPeak.expires = d.toISOString();
          }
        }
      }
    }
  }

  return discounts;
}

async function main() {
  const force = process.argv.includes('--force');

  if (!force && isFresh()) {
    console.log('model-prices.json is fresh, skipping.');
    return;
  }

  console.log('Fetching latest model pricing...');

  let models = {};
  let discounts = {};

  try {
    const [tierHtml, discountHtml] = await Promise.all([
      fetchHtml(TIER_URL),
      fetchHtml(DISCOUNT_URL),
    ]);

    models = parseTierPrices(tierHtml);
    discounts = parseDiscounts(discountHtml);

    if (Object.keys(models).length === 0) {
      console.error('Warning: no models parsed from tier page, keeping defaults.');
      models = {
        'Auto': { price: 1.0 }, 'Ultimate': { price: 1.6 },
        'Performance': { price: 1.1 }, 'Efficient': { price: 0.3 },
        'Lite': { price: 0 }, 'Qwen3.7-Max': { price: 0.5 },
        'Qwen3.7-Plus': { price: 0.1 }, 'DeepSeek-V4-Pro': { price: 0.5 },
        'DeepSeek-V4-Flash': { price: 0.1 }, 'GLM-5.2': { price: 0.6 },
        'Kimi-K2.7-Code': { price: 0.3 }, 'MiniMax-M3': { price: 0.2 },
      };
    }
  } catch (e) {
    console.error(`Fetch failed: ${e.message}. Keeping existing prices.`);
    try {
      const existing = JSON.parse(fs.readFileSync(PRICES_FILE, 'utf8'));
      models = existing.models || {};
      discounts = existing.discounts || {};
    } catch {
      models = {
        'Auto': { price: 1.0 }, 'Ultimate': { price: 1.6 },
        'Performance': { price: 1.1 }, 'Efficient': { price: 0.3 },
        'Lite': { price: 0 }, 'Qwen3.7-Max': { price: 0.5 },
        'Qwen3.7-Plus': { price: 0.1 }, 'DeepSeek-V4-Pro': { price: 0.5 },
        'DeepSeek-V4-Flash': { price: 0.1 }, 'GLM-5.2': { price: 0.6 },
        'Kimi-K2.7-Code': { price: 0.3 }, 'MiniMax-M3': { price: 0.2 },
      };
    }
  }

  const data = {
    models,
    discounts,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(PRICES_FILE, JSON.stringify(data, null, 2) + '\n');
  console.log(`Updated model-prices.json: ${Object.keys(models).length} models, ${Object.keys(discounts).length} discount rules.`);
}

main().catch(e => { console.error(e); process.exit(1); });
