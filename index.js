import { App } from "@slack/bolt";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// ✅ Zoho API base URL (correct domain)
const ZOHO_BOOKS_API = "https://www.zohoapis.com/books/v3";

async function getCashBalance(orgId) {
  try {
    const response = await fetch(`${ZOHO_BOOKS_API}/chartofaccounts?organization_id=${orgId}`, {
      method: "GET",
      headers: {
        Authorization: `Zoho-oauthtoken ${process.env.ZB_REFRESH_TOKEN}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Zoho API error:", data);
      return null;
    }

    // Find accounts with type = "cash"
    const cashAccounts = (data.chartofaccounts || []).filter(acc => acc.account_type === "cash");
    const total = cashAccounts.reduce((sum, acc) => sum + (acc.current_balance || 0), 0);

    return total;
  } catch (error) {
    console.error("Error fetching Zoho cash balance:", error);
    return null;
  }
}

app.message(/cash balance/i, async ({ message, say }) => {
  let reply = "";

  // Check both orgs unless user specifies
  if (/kk/i.test(message.text)) {
    const kkBalance = await getCashBalance(process.env.ORG_ID_KK);
    reply = kkBalance !== null ? `💰 KK Cash Balance: ${kkBalance}` : "⚠️ KK balance not available";
  } else if (/pt/i.test(message.text)) {
    const ptBalance = await getCashBalance(process.env.ORG_ID_PT);
    reply = ptBalance !== null ? `💰 PT Cash Balance: ${ptBalance}` : "⚠️ PT balance not available";
  } else {
    const kkBalance = await getCashBalance(process.env.ORG_ID_KK);
    const ptBalance = await getCashBalance(process.env.ORG_ID_PT);

    reply =
      (kkBalance !== null ? `💰 KK Cash Balance: ${kkBalance}\n` : "⚠️ KK balance not available\n") +
      (ptBalance !== null ? `💰 PT Cash Balance: ${ptBalance}` : "⚠️ PT balance not available");
  }

  await say(reply);
});

(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡ UL CFO bot is running!");
})();
