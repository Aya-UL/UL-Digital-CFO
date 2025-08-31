// index.js

import { App } from "@slack/bolt";
import fetch from "node-fetch";

// -------------------
// 🔑 Environment variables
// -------------------
const {
  SLACK_BOT_TOKEN,
  SLACK_SIGNING_SECRET,
  ZB_CLIENT_ID,
  ZB_CLIENT_SECRET,
  ZB_REFRESH_TOKEN,
  ORG_ID_KK,
  ORG_ID_PT,
} = process.env;

// -------------------
// 🌍 Zoho Books API base URLs
// -------------------
const ZOHO_BOOKS_API = "https://books.zoho.com/api/v3";   // Global (for PT - Indonesia)
const ZOHO_BOOKS_API_JP = "https://books.zoho.jp/api/v3"; // Japan (for KK)

// -------------------
// 🚀 Slack App
// -------------------
const app = new App({
  token: SLACK_BOT_TOKEN,
  signingSecret: SLACK_SIGNING_SECRET,
});

// -------------------
// 🔄 Function to fetch cash balance from Zoho
// -------------------
async function getCashBalance(orgId, country) {
  try {
    // Choose API base URL depending on org
    const baseUrl = country === "JP" ? ZOHO_BOOKS_API_JP : ZOHO_BOOKS_API;
    const url = `${baseUrl}/chartofaccounts?organization_id=${orgId}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Zoho-oauthtoken ${ZB_REFRESH_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Zoho API error ${response.status}`);
    }

    const data = await response.json();

    if (!data.chartofaccounts) {
      return "⚠️ No data returned";
    }

    // ✅ Filter cash/bank accounts only
    const cashAccounts = data.chartofaccounts.filter(
      (acc) => acc.account_type === "cash" || acc.account_type === "bank"
    );

    if (cashAccounts.length === 0) {
      return "⚠️ No cash/bank accounts found";
    }

    // Sum balances
    const total = cashAccounts.reduce((sum, acc) => sum + acc.balance, 0);

    return `¥${total.toLocaleString()}`;
  } catch (err) {
    console.error("Error fetching Zoho cash balance:", err);
    return "⚠️ Error fetching balance";
  }
}

// -------------------
// 💬 Slack message handling
// -------------------
app.message(/cash balance/i, async ({ message, say }) => {
  const text = message.text.toLowerCase();

  if (text.includes("kk")) {
    // KK only
    const kkBalance = await getCashBalance(ORG_ID_KK, "JP");
    await say(`🏦 KK Cash Balance: ${kkBalance}`);
  } else if (text.includes("pt")) {
    // PT only
    const ptBalance = await getCashBalance(ORG_ID_PT, "PT");
    await say(`🏦 PT Cash Balance: ${ptBalance}`);
  } else {
    // Default: show both
    const kkBalance = await getCashBalance(ORG_ID_KK, "JP");
    const ptBalance = await getCashBalance(ORG_ID_PT, "PT");

    await say(`🏦 KK: ${kkBalance}\n🏦 PT: ${ptBalance}`);
  }
});

// -------------------
// ⚡ Start App
// -------------------
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡ UL CFO bot is running!");
})();
