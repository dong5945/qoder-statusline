# Qoder Statusline

Qoder CLI 自定义状态栏 —— 实时显示模型定价、折扣徽章、Git 信息和信用额度。

---

## 效果预览

```
Qwen3.7-Max 0.25x -50% Model · ctx ▓▓▓░░░░░░░ 30% · ~/project:main · +12 -3 · ▓▓░░░░░░░░ 104
```

| 区段 | 含义 |
|---|---|
| `Qwen3.7-Max 0.25x -50%` | 当前模型 + 价格系数 + 折扣徽章（黄色） |
| `ctx ▓▓▓░░░░░░░ 30%` | 上下文窗口使用率 |
| `~/project:main` | 工作目录 + Git 分支 |
| `+12 -3` | Git diff（绿增/红删） |
| `▓▓░░░░░░░░ 104` | 信用额度剩余（绿>30%、黄≤30%、红≤10%） |
| `⚠ cookie expired` | Cookie 过期提示（黄色） |

---

## 文件结构

```
qoder-statusline/
├── statusline.js       # 主渲染脚本（CLI 直接调用）
├── fetch-prices.js     # 从 docs.qoder.com 抓取模型定价和折扣规则
├── fetch-usage.js      # 通过 Cookie 调用 Qoder API 获取信用额度
├── model-prices.json   # 定价数据（每 6 小时自动刷新）
├── usage.json          # 用量数据（每 10 分钟自动刷新，已 gitignore）
├── package.json
└── .gitignore
```

---

## 安装

### 1. 克隆到本地

```bash
git clone <repo-url> D:/workspace/qoder-statusline
```

### 2. 配置 Cookie（用量查询必需）

```bash
mkdir -p ~/.qoder/.auth
# 从浏览器复制 qoder_session_cookie，写入文件：
echo "qoder_locale=zh; qoder_session_cookie=YOUR_COOKIE_HERE" > ~/.qoder/.auth/cookie
```

> Cookie 仅存储在本地 `~/.qoder/.auth/cookie`，不会进入 Git 仓库。

### 3. 更新 Qoder CLI 配置

在 `~/.qoder/settings.json` 中添加：

```json
{
  "statusLine": {
    "type": "command",
    "command": "node D:/workspace/qoder-statusline/statusline.js"
  }
}
```

### 4. 重启 Qoder CLI

`/quit` 后重新进入即可看到状态栏。

---

## 工作原理

### 自动刷新

| 数据 | 刷新间隔 | 数据源 |
|---|---|---|
| 模型定价 | 6 小时 | `docs.qoder.com` HTML 表格抓取 |
| 折扣规则 | 6 小时 | `docs.qoder.com/events/offpeakrate` |
| 信用额度 | 10 分钟 | `qoder.com/api/v1/me/usages/big_model_credits` |

每次状态栏渲染时，脚本会检查数据文件是否过期，过期则在后台启动刷新进程（不阻塞渲染）。

### 折扣计算

根据当前 UTC 时间匹配折扣窗口：

- **Off-Peak（低谷）**: UTC 14:00 – 00:00，部分模型大幅降价
- **Regular（常规）**: UTC 00:00 – 14:00，部分模型有小幅折扣
- 折扣过期后自动回退到原价

### 用量颜色

| 剩余额度占比 | 颜色 |
|---|---|
| > 30% | 绿色 |
| ≤ 30% | 黄色 |
| ≤ 10% | 红色 |

---

## 手动操作

```bash
# 强制刷新定价（忽略 6 小时间隔）
npm run fetch-prices

# 强制刷新用量（忽略 10 分钟间隔）
npm run fetch-usage
```

---

## Cookie 过期

当 API 返回 401/403 时，状态栏显示 `⚠ cookie expired`。重新从浏览器复制 Cookie 并覆盖：

```bash
echo "qoder_locale=zh; qoder_session_cookie=NEW_COOKIE" > ~/.qoder/.auth/cookie
node D:/workspace/qoder-statusline/fetch-usage.js --force
```

---

## 技术细节

- **运行环境**: Node.js ≥ 18（使用内置 `fetch`）
- **ANSI 颜色**: 使用 bright 变体，在 Qoder CLI 的 `dimColor` 包装下恢复为正常亮度
- **进程模型**: 刷新脚本以 `detached` + `unref` 方式启动，不阻塞状态栏渲染
- **数据格式**: `model-prices.json` 包含 `models`（基础价格）和 `discounts`（折扣规则 + UTC 时间窗口 + 过期时间）

---

---

# Qoder Statusline (English)

Custom status line for Qoder CLI — real-time model pricing, discount badges, Git info, and credit tracking.

## Preview

```
Qwen3.7-Max 0.25x -50% Model · ctx ▓▓▓░░░░░░░ 30% · ~/project:main · +12 -3 · ▓▓░░░░░░░░ 104
```

| Segment | Meaning |
|---|---|
| `Qwen3.7-Max 0.25x -50%` | Model name + price coefficient + discount badge (yellow) |
| `ctx ▓▓▓░░░░░░░ 30%` | Context window usage |
| `~/project:main` | Working directory + Git branch |
| `+12 -3` | Git diff stats (green additions / red deletions) |
| `▓▓░░░░░░░░ 104` | Remaining credits (green >30%, yellow ≤30%, red ≤10%) |
| `⚠ cookie expired` | Cookie expired warning (yellow) |

## File Structure

```
qoder-statusline/
├── statusline.js       # Main renderer (called by CLI)
├── fetch-prices.js     # Scrapes model pricing from docs.qoder.com
├── fetch-usage.js      # Fetches credit usage via Qoder API (cookie auth)
├── model-prices.json   # Pricing data (auto-refreshes every 6h)
├── usage.json          # Usage data (auto-refreshes every 10min, gitignored)
├── package.json
└── .gitignore
```

## Setup

### 1. Clone

```bash
git clone <repo-url> D:/workspace/qoder-statusline
```

### 2. Configure Cookie (required for usage tracking)

```bash
mkdir -p ~/.qoder/.auth
echo "qoder_locale=zh; qoder_session_cookie=YOUR_COOKIE_HERE" > ~/.qoder/.auth/cookie
```

> Cookie stays local at `~/.qoder/.auth/cookie` — never committed to Git.

### 3. Update Qoder CLI Settings

Add to `~/.qoder/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node D:/workspace/qoder-statusline/statusline.js"
  }
}
```

### 4. Restart Qoder CLI

Run `/quit` and re-enter to see the status line.

## How It Works

### Auto-Refresh

| Data | Interval | Source |
|---|---|---|
| Model pricing | 6 hours | `docs.qoder.com` HTML table scraping |
| Discount rules | 6 hours | `docs.qoder.com/events/offpeakrate` |
| Credit usage | 10 minutes | `qoder.com/api/v1/me/usages/big_model_credits` |

On each render, stale data files trigger background refresh processes (non-blocking).

### Discount Calculation

Matches the current UTC hour against discount windows:

- **Off-Peak**: UTC 14:00–00:00 — significant price reductions on select models
- **Regular Hours**: UTC 00:00–14:00 — smaller discounts on some models
- Expired discounts automatically revert to base price

### Usage Color Thresholds

| Remaining % | Color |
|---|---|
| > 30% | Green |
| ≤ 30% | Yellow |
| ≤ 10% | Red |

## Manual Commands

```bash
# Force refresh pricing (ignores 6h interval)
npm run fetch-prices

# Force refresh usage (ignores 10min interval)
npm run fetch-usage
```

## Cookie Expiration

When the API returns 401/403, the status line shows `⚠ cookie expired`. Re-copy from browser:

```bash
echo "qoder_locale=zh; qoder_session_cookie=NEW_COOKIE" > ~/.qoder/.auth/cookie
node D:/workspace/qoder-statusline/fetch-usage.js --force
```

## Technical Notes

- **Runtime**: Node.js ≥ 18 (uses built-in `fetch`)
- **ANSI Colors**: Bright variants that normalize under Qoder CLI's `dimColor` wrapper
- **Process Model**: Refresh scripts spawn with `detached: true` + `unref()` — never block rendering
- **Data Format**: `model-prices.json` contains `models` (base prices) and `discounts` (rules with UTC windows + expiry dates)
