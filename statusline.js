// Qoder statusline — default layout + git branch appended to directory.
// Uses ANSI "bright*" color variants so that Qoder's hardcoded dimColor
// wrapper brings them back to normal intensity (matching default look).
// Layout: <Model> Model[ · <ctx bar> <pct>]  <dir>:<branch>[  +a -r]

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SEP = ' \u00B7 ';

// Vivid pure RGB colors — max saturation, survive dimColor and stay punchy.
const C = {
  secondary: '\x1b[97m',     // bright white  → text.secondary
  warning:   '\x1b[1;38;5;226m',  // pure yellow (255,255,0) → status.warning
  error:     '\x1b[1;38;5;196m',  // pure red    (255,0,0)   → status.error
  success:   '\x1b[1;38;5;46m',   // pure green  (0,255,0)   → status.success
  reset:     '\x1b[0m',
};

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => resolve(data));
  });
}

function getBranch(cwd) {
  try {
    const b = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd, stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500,
    }).toString().trim();
    return (b && b !== 'HEAD') ? b : '';
  } catch { return ''; }
}

function getDiff(cwd) {
  try {
    const out = execSync('git --no-pager diff --shortstat', {
      cwd, stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500,
    }).toString();
    const a = (out.match(/(\d+) insertion/) || [])[1];
    const r = (out.match(/(\d+) deletion/) || [])[1];
    return { a: a ? +a : 0, r: r ? +r : 0 };
  } catch { return { a: 0, r: 0 }; }
}

function shortenDir(d) {
  const home = os.homedir();
  if (d === home) return '~';
  if (d.startsWith(home + path.sep)) return '~' + d.slice(home.length);
  return d;
}

function ctxBar(pct) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const filled = Math.round(p / 10);
  return 'ctx ' + '\u2593'.repeat(filled) + '\u2591'.repeat(10 - filled) + ' ' + p + '%';
}

function ctxColor(pct) {
  if (pct >= 70) return C.error;
  if (pct >= 50) return C.warning;
  return C.secondary;
}

function getPrice(modelName) {
  try {
    const pricesPath = path.join(__dirname, 'model-prices.json');
    const data = JSON.parse(fs.readFileSync(pricesPath, 'utf8'));
    const base = data.models[modelName] && data.models[modelName].price;
    if (typeof base !== 'number') return null;
    if (base === 0) return { price: 'Free' };

    const disc = data.discounts && data.discounts[modelName];
    if (disc) {
      const utcH = new Date().getUTCHours();
      for (const key of Object.keys(disc)) {
        const d = disc[key];
        if (d.expires && new Date() > new Date(d.expires)) continue;
        if (utcH >= d.utcStart && utcH < d.utcEnd) {
          const pctOff = Math.round((1 - d.factor / base) * 100);
          return { price: `${d.factor.toFixed(2)}x`, discount: `-${pctOff}%` };
        }
      }
    }
    return { price: `${base.toFixed(2)}x` };
  } catch {}
  return null;
}

function getUsage() {
  try {
    const usagePath = path.join(__dirname, 'usage.json');
    const stat = fs.statSync(usagePath);
    const ageH = (Date.now() - stat.mtimeMs) / 3600000;
    const data = JSON.parse(fs.readFileSync(usagePath, 'utf8'));
    if (data.error === 'auth_expired') return { authExpired: true };
    const { remaining, total, used, addon, plan } = data;
    if (typeof remaining !== 'number') return null;
    const pct = total > 0 ? Math.round((remaining / total) * 100) : 100;
    const filled = Math.round(pct / 10);
    const bar = '\u2593'.repeat(filled) + '\u2591'.repeat(10 - filled);
    const stale = ageH > 24 ? '!' : '';
    const addonStr = addon > 0 ? `+${addon}` : '';
    const color = pct <= 10 ? C.error : pct <= 30 ? C.warning : C.success;
    return { bar, pct, remaining, total, plan, color, stale, addonStr };
  } catch {}
  return null;
}

const STALE_MS = 6 * 60 * 60 * 1000;

function refreshPricesIfStale() {
  try {
    const p = path.join(__dirname, 'model-prices.json');
    const stat = fs.statSync(p);
    if ((Date.now() - stat.mtimeMs) < STALE_MS) return;
  } catch {}
  const script = path.join(__dirname, 'fetch-prices.js');
  require('child_process').spawn('node', [script], {
    detached: true, stdio: 'ignore', windowsHide: true,
  }).unref();
}

const USAGE_STALE_MS = 10 * 60 * 1000; // 10 minutes

function refreshUsageIfStale() {
  try {
    const p = path.join(__dirname, 'usage.json');
    const stat = fs.statSync(p);
    if ((Date.now() - stat.mtimeMs) < USAGE_STALE_MS) return;
  } catch {}
  const script = path.join(__dirname, 'fetch-usage.js');
  require('child_process').spawn('node', [script], {
    detached: true, stdio: 'ignore', windowsHide: true,
  }).unref();
}

(async () => {
  refreshPricesIfStale();
  refreshUsageIfStale();
  const raw = await readStdin();
  let j = {};
  try { j = JSON.parse(raw || '{}'); } catch {}

  const model = (j.model && (j.model.display_name || j.model.id)) || 'Auto';
  const dir = (j.workspace && j.workspace.current_dir) || j.cwd || process.cwd();
  const pct = (j.context_window && typeof j.context_window.used_percentage === 'number')
    ? j.context_window.used_percentage : null;

  const branch = getBranch(dir);
  const diff = getDiff(dir);

  const segments = [];
  const priceInfo = getPrice(model);
  if (priceInfo) {
    const discBadge = priceInfo.discount ? ` ${C.warning}${priceInfo.discount}${C.reset}${C.secondary}` : '';
    segments.push({ color: C.secondary, text: `${model} ${C.success}${priceInfo.price}${C.reset}${C.secondary}${discBadge} Model` });
  } else {
    segments.push({ color: C.secondary, text: `${model} Model` });
  }
  if (pct !== null) {
    segments.push({ color: ctxColor(pct), text: ctxBar(pct) });
  }

  const shortDir = shortenDir(dir);
  const dirLabel = branch ? `${shortDir}:${branch}` : shortDir;
  segments.push({ color: C.secondary, text: dirLabel });

  if (diff.a > 0 || diff.r > 0) {
    segments.push({
      color: null,
      text: `${C.success}+${diff.a}${C.reset} ${C.error}-${diff.r}`,
    });
  }

  const usage = getUsage();
  if (usage) {
    if (usage.authExpired) {
      segments.push({ color: C.warning, text: '⚠ cookie expired' });
    } else {
      const addonPart = usage.addonStr ? ` ${usage.addonStr}` : '';
      segments.push({
        color: C.secondary,
        text: `Credits ${usage.bar} ${usage.remaining}/${usage.total}${addonPart}${usage.stale}`,
      });
    }
  }

  const out = segments
    .map((s) => (s.color ? `${s.color}${s.text}${C.reset}` : s.text))
    .join(SEP);

  process.stdout.write(out);
})();
