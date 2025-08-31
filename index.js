// index.js (CommonJS version)

const { App } = require("@slack/bolt");
const fetch = require("node-fetch");
require("dotenv").config();

// Initialize Slack app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// --- Helper: Fetch Cash Balance from Zoho Books ---
async function getCashBalance(orgId) {
  try {
    const url = `https://books.zohoapis.com/api/v3/chartofaccounts?organization_id=${orgId}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Zoho-oauthtoken ${process.env.ZB_REFRESH_TOKEN}`,
      },
    });

    const data = await response.json();

    if (!data || !data.chartofaccounts) {
      return null;
    }

    // Find accounts containing "Cash"
    const cashAccounts = data.chartofaccounts.filter(acc =>
      acc.account_name.toLowerCase().includes("cash")
    );

    // Sum balances
    const total = cashAccounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);

    return { total, accounts: cashAccounts };
  } catch (err) {
    console.error("Error fetching Zoho cash balance:", err);
    return null;
  }
}

// --- Slack Listener ---
app.message(/cash balance|show.*cash/i, async ({ message, say }) => {
  const text = message.text.toLowerCase();

  let reply = "";

  if (text.includes("kk")) {
    const balance = await getCashBalance(process.env.ORG_ID_KK);
    reply = balance
      ? `💰 KK Cash Balance: ¥${balance.total.toLocaleString()}`
      : "⚠️ Sorry, couldn’t fetch KK cash balance.";
  } else if (text.includes("pt")) {
    const balance = await getCashBalance(process.env.ORG_ID_PT);
    reply = balance
      ? `💰 PT Cash Balance: Rp ${balance.total.toLocaleString()}`
      : "⚠️ Sorry, couldn’t fetch PT cash balance.";
  } else {
    // Fetch both
    const kk = await getCashBalance(process.env.ORG_ID_KK);
    const pt = await getCashBalance(process.env.ORG_ID_PT);

    reply =
      (kk
        ? `💰 KK: ¥${kk.total.toLocaleString()}`
        : "⚠️ KK balance not available") +
      "\n" +
      (pt
        ? `💰 PT: Rp ${pt.total.toLocaleString()}`
        : "⚠️ PT balance not available");
  }

  await say(reply);
});

// --- Start the App ---
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡ UL CFO bot is running!");
})();
