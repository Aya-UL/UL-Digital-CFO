const { App } = require("@slack/bolt");
const fetch = require("node-fetch");
require("dotenv").config();

// Slack App initialization
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

// In-memory Zoho tokens
let zohoAccessToken = null;

// Refresh Zoho Access Token
async function refreshZohoToken() {
  try {
    const res = await fetch("https://accounts.zoho.com/oauth/v2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: process.env.ZB_REFRESH_TOKEN,
        client_id: process.env.ZB_CLIENT_ID,
        client_secret: process.env.ZB_CLIENT_SECRET,
        grant_type: "refresh_token"
      })
    });

    const data = await res.json();
    if (data.access_token) {
      zohoAccessToken = data.access_token;
      console.log("✅ Zoho token refreshed");
    } else {
      console.error("❌ Failed to refresh Zoho token", data);
    }
  } catch (err) {
    console.error("❌ Error refreshing Zoho token", err);
  }
}

// Fetch cash balance from Zoho Books
async function getCashBalance(orgId) {
  if (!zohoAccessToken) {
    await refreshZohoToken();
  }

  try {
    const res = await fetch(
      `https://books.zohoapis.com/api/v3/chartofaccounts?organization_id=${orgId}`,
      { headers: { Authorization: `Zoho-oauthtoken ${zohoAccessToken}` } }
    );

    const data = await res.json();
    if (!data.chartofaccounts) {
      console.error("⚠️ Zoho API error:", data);
      return null;
    }

    const cashAccounts = data.chartofaccounts.filter(
      acc => acc.account_type === "cash" || acc.account_type === "bank"
    );

    return cashAccounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
  } catch (err) {
    console.error("❌ Error fetching cash balance", err);
    return null;
  }
}

// Slack command handler
app.message(/cash balance/i, async ({ say }) => {
  const kkBalance = await getCashBalance(process.env.ORG_ID_KK);
  const ptBalance = await getCashBalance(process.env.ORG_ID_PT);

  await say(
    `💰 Cash Balances:\n` +
      `KK: ${kkBalance !== null ? "¥" + kkBalance : "⚠️ not available"}\n` +
      `PT: ${ptBalance !== null ? "¥" + ptBalance : "⚠️ not available"}`
  );
});

// Start Slack app
(async () => {
  await refreshZohoToken();
  await app.start(process.env.PORT || 3000);
  console.log("🚀 UL CFO bot is running (Slack ↔ Zoho KK/PT)");
})();
