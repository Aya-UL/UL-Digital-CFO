import { App } from "@slack/bolt";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

// Slack app initialization
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// Zoho credentials
const ZB_CLIENT_ID = process.env.ZB_CLIENT_ID;
const ZB_CLIENT_SECRET = process.env.ZB_CLIENT_SECRET;
const ZB_REFRESH_TOKEN = process.env.ZB_REFRESH_TOKEN;
const ORG_ID_KK = process.env.ORG_ID_KK;
const ORG_ID_PT = process.env.ORG_ID_PT;

// Helper: get Zoho access token
async function getAccessToken() {
  const url = `https://accounts.zoho.com/oauth/v2/token`;
  const params = new URLSearchParams({
    refresh_token: ZB_REFRESH_TOKEN,
    client_id: ZB_CLIENT_ID,
    client_secret: ZB_CLIENT_SECRET,
    grant_type: "refresh_token",
  });

  const response = await fetch(url, {
    method: "POST",
    body: params,
  });

  if (!response.ok) {
    throw new Error(`Zoho token fetch failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Helper: get cash balance for one org
async function getCashBalance(orgId, accessToken) {
  const url = `https://books.zoho.com/api/v3/chartofaccounts?organization_id=${orgId}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!data.chartofaccounts) {
    throw new Error(`Zoho response error: ${JSON.stringify(data)}`);
  }

  // Find accounts of type "bank"
  const bankAccounts = data.chartofaccounts.filter(
    (acct) => acct.account_type === "bank"
  );

  const total = bankAccounts.reduce(
    (sum, acct) => sum + (acct.current_balance || 0),
    0
  );

  return { total, accounts: bankAccounts };
}

// Slack handler: cash balance
app.message(/(?=.*cash)(?=.*balance)/i, async ({ message, say }) => {
  try {
    const text = message.text.toLowerCase();
    const accessToken = await getAccessToken();

    // Determine which org(s) to fetch
    let results = [];

    if (text.includes("kk")) {
      const kkBalance = await getCashBalance(ORG_ID_KK, accessToken);
      results.push(`🏦 KK: ¥${kkBalance.total.toLocaleString()}`);
    } else if (text.includes("pt")) {
      const ptBalance = await getCashBalance(ORG_ID_PT, accessToken);
      results.push(`🏦 PT: Rp${ptBalance.total.toLocaleString()}`);
    } else {
      const kkBalance = await getCashBalance(ORG_ID_KK, accessToken);
      const ptBalance = await getCashBalance(ORG_ID_PT, accessToken);
      results.push(`🏦 KK: ¥${kkBalance.total.toLocaleString()}`);
      results.push(`🏦 PT: Rp${ptBalance.total.toLocaleString()}`);
    }

    await say(`💰 Cash Balances:\n${results.join("\n")}`);
  } catch (error) {
    console.error("Error fetching cash balance:", error);
    await say("⚠️ Sorry, I couldn’t fetch the cash balance right now.");
  }
});

// Start app
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡ UL CFO bot is running!");
})();
