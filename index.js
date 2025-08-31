// index.js
import { App } from "@slack/bolt";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// ----------------- ZOHO AUTH HANDLING -----------------
let accessToken = null;
let tokenExpiry = 0;

async function refreshAccessToken() {
  if (Date.now() < tokenExpiry && accessToken) return accessToken;

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
  if (!res.ok || data.error) {
    console.error("Failed to refresh token:", data);
    throw new Error("Zoho auth failed");
  }

  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  console.log("🔑 Zoho access token refreshed");
  return accessToken;
}

async function zohoFetch(path, orgId) {
  const token = await refreshAccessToken();
  const url = `https://books.zohoapis.com/api/v3${path}&organization_id=${orgId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  const data = await res.json();
  if (!res.ok || data.code !== 0) {
    console.error("Zoho API error:", data);
    throw new Error("Zoho API error");
  }
  return data;
}

// ----------------- QUERIES -----------------
async function getCashBalance(orgId) {
  try {
    const data = await zohoFetch("/chartofaccounts?filter_by=AccountType.Cash", orgId);
    if (!data || !data.chartofaccounts) return "⚠️ not available";

    const cashAccts = data.chartofaccounts;
    if (cashAccts.length === 0) return "⚠️ no cash accounts";

    const total = cashAccts.reduce((sum, acct) => {
      const bal = parseFloat(
        acct.current_balance || acct.balance || acct.account_balance || 0
      );
      return sum + (isNaN(bal) ? 0 : bal);
    }, 0);

    return `¥${total.toLocaleString()}`;
  } catch (err) {
    console.error("Error fetching Zoho cash balance:", err);
    return "⚠️ not available";
  }
}

async function getInvoices(orgId) {
  try {
    const data = await zohoFetch("/invoices?per_page=10", orgId); // fetch more than 3
    return data.invoices?.map((inv) => ({
      number: inv.invoice_number,
      customer: inv.customer_name,
      amount: inv.total,
      status: inv.status,
    }));
  } catch {
    return [];
  }
}

async function getBills(orgId) {
  try {
    const data = await zohoFetch("/bills?per_page=10", orgId); // fetch more than 3
    return data.bills?.map((bill) => ({
      number: bill.bill_number,
      vendor: bill.vendor_name,
      amount: bill.total,
      status: bill.status,
    }));
  } catch {
    return [];
  }
}

async function getPnL(orgId) {
  try {
    const data = await zohoFetch("/profitandloss?date_range=this_month", orgId);
    return data;
  } catch {
    return null;
  }
}

// ----------------- SLACK LISTENER -----------------
app.message(/cash balance/i, async ({ message, say }) => {
  const [kk, pt] = await Promise.all([
    getCashBalance(process.env.ORG_ID_KK),
    getCashBalance(process.env.ORG_ID_PT),
  ]);

  await say(
    `💰 *Cash Balances:*\nKK: ${kk}\nPT: ${pt}`
  );
});

app.message(/invoices/i, async ({ say }) => {
  const invoices = await getInvoices(process.env.ORG_ID_KK);
  if (!invoices.length) return await say("⚠️ No invoices found");
  const text = invoices.map(
    (i) => `#${i.number} | ${i.customer} | ¥${i.amount} | ${i.status}`
  ).join("\n");
  await say(`📑 *Invoices (KK)*:\n${text}`);
});

app.message(/bills/i, async ({ say }) => {
  const bills = await getBills(process.env.ORG_ID_KK);
  if (!bills.length) return await say("⚠️ No bills found");
  const text = bills.map(
    (b) => `#${b.number} | ${b.vendor} | ¥${b.amount} | ${b.status}`
  ).join("\n");
  await say(`📑 *Bills (KK)*:\n${text}`);
});

app.message(/p&l|profit/i, async ({ say }) => {
  const pnl = await getPnL(process.env.ORG_ID_KK);
  if (!pnl) return await say("⚠️ P&L not available");
  await say(`📊 *P&L (KK this month)*:\n${JSON.stringify(pnl, null, 2)}`);
});

// ----------------- START -----------------
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡ UL CFO bot is running (Phase 1: Slack ↔ Zoho KK+PT)");
})();
