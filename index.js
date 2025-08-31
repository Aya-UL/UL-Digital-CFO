// index.js
import pkg from "@slack/bolt";
const { App } = pkg;
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

// ----------------------
// Slack App Setup
// ----------------------
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

// ----------------------
// Get Zoho Access Token
// ----------------------
async function getAccessToken() {
  const url = `https://accounts.zoho.com/oauth/v2/token?refresh_token=${process.env.ZB_REFRESH_TOKEN}&client_id=${process.env.ZB_CLIENT_ID}&client_secret=${process.env.ZB_CLIENT_SECRET}&grant_type=refresh_token`;

  try {
    const response = await fetch(url, { method: "POST" });
    const data = await response.json();

    if (data.access_token) {
      return data.access_token;
    } else {
      console.error("Failed to get access token:", data);
      return null;
    }
  } catch (err) {
    console.error("Error fetching access token:", err);
    return null;
  }
}

// ----------------------
// Get Cash Balance
// ----------------------
async function getCashBalance(orgId) {
  try {
    const token = await getAccessToken();
    if (!token) return null;

    const response = await fetch(
      `https://books.zoho.com/api/v3/bankaccounts?organization_id=${orgId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`
        }
      }
    );

    const data = await response.json();

    if (!data || !data.bankaccounts) {
      console.error("Zoho response error:", data);
      return null;
    }

    // Sum up all account balances
    let total = 0;
    data.bankaccounts.forEach(acc => {
      total += acc.balance;
    });

    return total;
  } catch (err) {
    console.error("Error fetching Zoho cash balance:", err);
    return null;
  }
}

// ----------------------
// Slack Message Handler
// ----------------------
app.message(/cash balance/i, async ({ message, say }) => {
  const text = message.text.toLowerCase();

  let reply = "";

  if (text.includes("kk")) {
    const kkBalance = await getCashBalance(process.env.ORG_ID_KK);
    reply += kkBalance !== null ? `💰 KK Balance: ${kkBalance}\n` : "⚠️ KK balance not available\n";
  } else if (text.includes("pt")) {
    const ptBalance = await getCashBalance(process.env.ORG_ID_PT);
    reply += ptBalance !== null ? `💰 PT Balance: ${ptBalance}\n` : "⚠️ PT balance not available\n";
  } else {
    const kkBalance = await getCashBalance(process.env.ORG_ID_KK);
    const ptBalance = await getCashBalance(process.env.ORG_ID_PT);

    reply += kkBalance !== null ? `💰 KK Balance: ${kkBalance}\n` : "⚠️ KK balance not available\n";
    reply += ptBalance !== null ? `💰 PT Balance: ${ptBalance}\n` : "⚠️ PT balance not available\n";
  }

  await say(reply);
});

// ----------------------
// Start Slack App
// ----------------------
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡ UL CFO bot is running!");
})();
