// index.js
require("dotenv").config();
const { App } = require("@slack/bolt");
const fetch = require("node-fetch");

// Slack app setup
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// Zoho API setup
const ZOHO_BOOKS_API = "https://www.zohoapis.com/books/v3"; // ✅ fixed
let accessToken = null;

// Refresh Zoho token
async function refreshZohoToken() {
  const res = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: process.env.ZB_REFRESH_TOKEN,
      client_id: process.env.ZB_CLIENT_ID,
      client_secret: process.env.ZB_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (data.access_token) {
    accessToken = data.access_token;
    console.log("🔑 Zoho access token refreshed");
  } else {
    console.error("❌ Failed to refresh token:", data);
  }
}

async function ensureAccessToken() {
  if (!accessToken) {
    await refreshZohoToken();
  }
  return accessToken;
}

// Generic Zoho fetch
async function zohoFetch(endpoint, orgId) {
  const token = await ensureAccessToken();
  const url = `${ZOHO_BOOKS_API}${endpoint}?organization_id=${orgId}`;

  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });

  const data = await res.json();
  if (data.code && data.code !== 0) {
    console.error("Zoho API error:", data);
    return null;
  }
  return data;
}

// Cash balance
async function getCashBalance(orgId) {
  const data = await zohoFetch("/chartofaccounts", orgId);
  if (!data) return "⚠️ not available";

  const cashAccts = data.chartofaccounts.filter(
    (acct) => acct.account_type === "cash"
  );
  if (cashAccts.length === 0) return "⚠️ no cash accounts";

  const total = cashAccts.reduce((sum, acct) => sum + acct.balance, 0);
  return `¥${total.toLocaleString()}`;
}

// Invoices
async function getInvoices(orgId) {
  const data = await zohoFetch("/invoices", orgId);
  if (!data || !data.invoices) return "⚠️ not available";

  return data.invoices
    .map((inv) => `#${inv.invoice_number} – ${inv.status} – ${inv.total}`)
    .join("\n");
}

// Bills
async function getBills(orgId) {
  const data = await zohoFetch("/bills", orgId);
  if (!data || !data.bills) return "⚠️ not available";

  return data.bills
    .map((bill) => `#${bill.bill_number} – ${bill.status} – ${bill.total}`)
    .join("\n");
}

// P&L
async function getPnL(orgId) {
  const data = await zohoFetch("/reports/profitandloss", orgId);
  if (!data || !data.report) return "⚠️ not available";

  return `P&L Summary: ${JSON.stringify(data.report, null, 2).slice(0, 400)}...`;
}

// Slack handlers
app.message(/cash balance/i, async ({ say }) => {
  const kk = await getCashBalance(process.env.ORG_ID_KK);
  const pt = await getCashBalance(process.env.ORG_ID_PT);
  await say(`💰 *Cash Balances:*\nKK: ${kk}\nPT: ${pt}`);
});

app.message(/invoices/i, async ({ say }) => {
  const kk = await getInvoices(process.env.ORG_ID_KK);
  const pt = await getInvoices(process.env.ORG_ID_PT);
  await say(`📄 *Invoices:*\nKK:\n${kk}\n\nPT:\n${pt}`);
});

app.message(/bills/i, async ({ say }) => {
  const kk = await getBills(process.env.ORG_ID_KK);
  const pt = await getBills(process.env.ORG_ID_PT);
  await say(`📑 *Bills:*\nKK:\n${kk}\n\nPT:\n${pt}`);
});

app.message(/p&l|profit/i, async ({ say }) => {
  const kk = await getPnL(process.env.ORG_ID_KK);
  const pt = await getPnL(process.env.ORG_ID_PT);
  await say(`📊 *P&L:*\nKK:\n${kk}\n\nPT:\n${pt}`);
});

// Start
(async () => {
  await refreshZohoToken();
  await app.start(process.env.PORT || 3000);
  console.log("⚡️ UL CFO bot is running (Phase 1: Slack ↔ Zoho KK+PT)");
})();
