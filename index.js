const { App } = require("@slack/bolt");
const fetch = require("node-fetch");
require("dotenv").config();

const {
  SLACK_BOT_TOKEN,
  SLACK_SIGNING_SECRET,
  ZB_CLIENT_ID,
  ZB_CLIENT_SECRET,
  ZB_REFRESH_TOKEN,
  ORG_ID_KK,
  ORG_ID_PT
} = process.env;

const ZOHO_API_DOMAIN = "https://www.zohoapis.com";
const ZOHO_BOOKS_BASE = `${ZOHO_API_DOMAIN}/books/v3`;

let zohoAccessToken = null;

// Refresh Zoho OAuth token
async function refreshZohoToken() {
  try {
    const url = `https://accounts.zoho.com/oauth/v2/token?refresh_token=${ZB_REFRESH_TOKEN}&client_id=${ZB_CLIENT_ID}&client_secret=${ZB_CLIENT_SECRET}&grant_type=refresh_token`;
    const res = await fetch(url, { method: "POST" });
    const data = await res.json();

    if (data.access_token) {
      zohoAccessToken = data.access_token;
      console.log("🔑 Zoho token refreshed");
    } else {
      console.error("❌ Failed to refresh token:", data);
    }
  } catch (err) {
    console.error("❌ Error refreshing Zoho token:", err);
  }
}

setInterval(refreshZohoToken, 50 * 60 * 1000);
refreshZohoToken();

// Fetch bank balances for one org
async function fetchBankBalances(orgId) {
  if (!zohoAccessToken) await refreshZohoToken();

  try {
    const url = `${ZOHO_BOOKS_BASE}/bankaccounts?organization_id=${orgId}`;
    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${zohoAccessToken}` },
    });
    const data = await res.json();

    // Debug log full response (remove later if noisy)
    console.log(`📊 Zoho bankaccounts response for org ${orgId}:`, JSON.stringify(data, null, 2));

    if (!data || !data.bankaccounts) {
      console.error("❌ Invalid Zoho response:", data);
      return null;
    }

    let total = 0;
    data.bankaccounts.forEach(acc => {
      if (acc.account_type === "bank" && acc.status === "active") {
        // ✅ Correct field: account_balance
        const bal = acc.account_balance || 0;
        total += bal;
      }
    });

    return total;
  } catch (err) {
    console.error("❌ Error fetching bank accounts:", err);
    return null;
  }
}

// Slack app
const app = new App({
  token: SLACK_BOT_TOKEN,
  signingSecret: SLACK_SIGNING_SECRET,
});

// Cash balance command
app.message(/cash balance/i, async ({ say }) => {
  const kkBalance = await fetchBankBalances(ORG_ID_KK);
  const ptBalance = await fetchBankBalances(ORG_ID_PT);

  let response = "*💰 Cash Balances:*\n";
  response += `KK: ${kkBalance !== null ? "¥" + kkBalance.toLocaleString() : "⚠️ not available"}\n`;
  response += `PT: ${ptBalance !== null ? "¥" + ptBalance.toLocaleString() : "⚠️ not available"}`;

  await say(response);
});

// Start the bot
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡ UL CFO bot running (Slack ↔ Zoho, Phase 1)");
})();
