const { App } = require('@slack/bolt');
const dotenv = require('dotenv');
const fetch = require('node-fetch');

dotenv.config();

// -------------------
// Slack App Init
// -------------------
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// -------------------
// Zoho Auth Setup
// -------------------
let accessToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);

  if (accessToken && now < tokenExpiry - 60) {
    return accessToken; // still valid
  }

  try {
    const resp = await fetch("https://accounts.zoho.com/oauth/v2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: process.env.ZB_REFRESH_TOKEN,
        client_id: process.env.ZB_CLIENT_ID,
        client_secret: process.env.ZB_CLIENT_SECRET,
        grant_type: "refresh_token",
      }),
    });

    const data = await resp.json();
    if (data.access_token) {
      accessToken = data.access_token;
      tokenExpiry = now + data.expires_in;
      console.log("🔑 Zoho access token refreshed");
      return accessToken;
    } else {
      console.error("❌ Failed to refresh token:", data);
      return null;
    }
  } catch (err) {
    console.error("⚠️ Error refreshing Zoho token:", err);
    return null;
  }
}

// -------------------
// Zoho API Helper
// -------------------
async function zohoGet(orgId, endpoint) {
  const token = await getAccessToken();
  if (!token) return null;

  const url = `https://books.zoho.com/api/v3/${endpoint}?organization_id=${orgId}`;

  try {
    const resp = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
    const data = await resp.json();

    if (data.code && data.code !== 0) {
      console.error("Zoho API error:", data);
      return null;
    }
    return data;
  } catch (err) {
    console.error("⚠️ Fetch error:", err);
    return null;
  }
}

// -------------------
// Slack Listeners
// -------------------

// Cash Balance
app.message(/cash balance/i, async ({ message, say }) => {
  const [kk, pt] = await Promise.all([
    zohoGet(process.env.ORG_ID_KK, "bankaccounts"),
    zohoGet(process.env.ORG_ID_PT, "bankaccounts"),
  ]);

  await say({
    text: `💰 *Cash Balances:*\n`
      + `KK: ${kk ? JSON.stringify(kk.bankaccounts.map(a => ({name:a.account_name,bal:a.balance})), null, 2) : "⚠️ not available"}\n`
      + `PT: ${pt ? JSON.stringify(pt.bankaccounts.map(a => ({name:a.account_name,bal:a.balance})), null, 2) : "⚠️ not available"}`
  });
});

// Invoices
app.message(/invoices/i, async ({ say }) => {
  const [kk, pt] = await Promise.all([
    zohoGet(process.env.ORG_ID_KK, "invoices"),
    zohoGet(process.env.ORG_ID_PT, "invoices"),
  ]);

  await say({
    text: `📑 *Invoices (next 3 shown)*\n`
      + `KK: ${kk ? JSON.stringify(kk.invoices.slice(0, 3), null, 2) : "⚠️ not available"}\n`
      + `PT: ${pt ? JSON.stringify(pt.invoices.slice(0, 3), null, 2) : "⚠️ not available"}`
  });
});

// Bills
app.message(/bills/i, async ({ say }) => {
  const [kk, pt] = await Promise.all([
    zohoGet(process.env.ORG_ID_KK, "bills"),
    zohoGet(process.env.ORG_ID_PT, "bills"),
  ]);

  await say({
    text: `🧾 *Bills (next 3 shown)*\n`
      + `KK: ${kk ? JSON.stringify(kk.bills.slice(0, 3), null, 2) : "⚠️ not available"}\n`
      + `PT: ${pt ? JSON.stringify(pt.bills.slice(0, 3), null, 2) : "⚠️ not available"}`
  });
});

// P&L
app.message(/p&l|profit/i, async ({ say }) => {
  const [kk, pt] = await Promise.all([
    zohoGet(process.env.ORG_ID_KK, "reports/profitandloss"),
    zohoGet(process.env.ORG_ID_PT, "reports/profitandloss"),
  ]);

  await say({
    text: `📊 *P&L Summary:*\n`
      + `KK: ${kk ? JSON.stringify(kk, null, 2) : "⚠️ not available"}\n`
      + `PT: ${pt ? JSON.stringify(pt, null, 2) : "⚠️ not available"}`
  });
});

// -------------------
// Start Slack App
// -------------------
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡ UL CFO bot is running (Phase 1: Slack ↔ Zoho for KK + PT)!");
})();
