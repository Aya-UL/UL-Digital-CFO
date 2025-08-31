import { App } from "@slack/bolt";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: false,
  appToken: process.env.SLACK_APP_TOKEN,
});

// -------------------------
// Helper: Refresh Access Token
// -------------------------
async function getAccessToken() {
  try {
    const response = await fetch("https://accounts.zoho.com/oauth/v2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: process.env.ZB_REFRESH_TOKEN,
        client_id: process.env.ZB_CLIENT_ID,
        client_secret: process.env.ZB_CLIENT_SECRET,
        grant_type: "refresh_token",
      }),
    });

    const data = await response.json();
    if (data.access_token) {
      return data.access_token;
    } else {
      console.error("Failed to refresh Zoho token:", data);
      return null;
    }
  } catch (error) {
    console.error("Error refreshing Zoho token:", error);
    return null;
  }
}

// -------------------------
// Helper: Fetch Cash Balance
// -------------------------
async function getCashBalance(orgId) {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const response = await fetch(
      `https://books.zoho.com/api/v3/chartofaccounts?organization_id=${orgId}`,
      {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
      }
    );

    const data = await response.json();

    if (data.chartofaccounts) {
      const cashAccounts = data.chartofaccounts.filter(
        (acc) => acc.account_type === "cash"
      );
      const total = cashAccounts.reduce((sum, acc) => sum + acc.current_balance, 0);
      return total;
    } else {
      console.error("Zoho API error:", data);
      return null;
    }
  } catch (error) {
    console.error("Error fetching Zoho cash balance:", error);
    return null;
  }
}

// -------------------------
// Slack Command Handling
// -------------------------
app.message(/cash balance/i, async ({ message, say }) => {
  await say("💡 Fetching latest cash balances...");

  const kkBalance = await getCashBalance(process.env.ORG_ID_KK);
  const ptBalance = await getCashBalance(process.env.ORG_ID_PT);

  let reply = "";
  reply += kkBalance !== null ? `🏦 KK Balance: ¥${kkBalance}\n` : "⚠️ KK balance not available\n";
  reply += ptBalance !== null ? `🏦 PT Balance: Rp${ptBalance}\n` : "⚠️ PT balance not available\n";

  await say(reply);
});

// -------------------------
// Start Bot
// -------------------------
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡ UL CFO bot is running!");
})();
