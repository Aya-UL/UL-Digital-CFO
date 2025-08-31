const { App } = require("@slack/bolt");
const fetch = require("node-fetch");
require("dotenv").config();

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

// Zoho API base
const ZOHO_BOOKS_API = "https://books.zoho.com/api/v3";

// Get cash balance
async function getCashBalance(orgId) {
  try {
    const response = await fetch(
      `${ZOHO_BOOKS_API}/chartofaccounts?organization_id=${orgId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Zoho-oauthtoken ${process.env.ZB_REFRESH_TOKEN}`
        }
      }
    );

    const data = await response.json();

    // Example: pick first account with "Cash" in name
    const cash = data.chartofaccounts?.find(acc =>
      acc.account_name.toLowerCase().includes("cash")
    );

    return cash ? `${cash.account_name}: ${cash.current_balance}` : null;
  } catch (err) {
    console.error("Error fetching Zoho cash balance:", err);
    return null;
  }
}

// Slack listener
app.message(/cash balance/i, async ({ message, say }) => {
  let reply = "";

  const kk = await getCashBalance(process.env.ORG_ID_KK);
  reply += kk ? `💰 KK Balance: ${kk}\n` : "⚠️ KK balance not available\n";

  const pt = await getCashBalance(process.env.ORG_ID_PT);
  reply += pt ? `💰 PT Balance: ${pt}\n` : "⚠️ PT balance not available\n";

  await say(reply);
});

(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡ UL CFO bot is running!");
})();
