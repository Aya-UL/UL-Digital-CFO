const { App } = require("@slack/bolt");
const fetch = require("node-fetch");
const chrono = require("chrono-node");
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

// 🔄 Refresh Zoho access token
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

// Refresh every 50 min
setInterval(refreshZohoToken, 50 * 60 * 1000);
refreshZohoToken();

// 🌐 Generic Zoho API caller (fixed URL builder)
async function zohoApi(path, orgId) {
  if (!zohoAccessToken) await refreshZohoToken();

  // Decide whether to use ? or &
  const joinChar = path.includes("?") ? "&" : "?";
  const url = `${ZOHO_BOOKS_BASE}${path}${joinChar}organization_id=${orgId}`;

  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${zohoAccessToken}` },
  });
  const data = await res.json();

  if (!res.ok) {
    console.error("❌ Zoho API error:", data);
    throw new Error(data.message || "Zoho API call failed");
  }
  return data;
}

// 🏦 Cash in Bank (today or as of date)
async function getCashInBank(orgId, date = null) {
  if (date) {
    // Historical via Balance Sheet
    const path = `/reports/balance_sheet?date=${date}`;
    const data = await zohoApi(path, orgId);

    let total = 0;
    if (data && data.report && data.report.sections) {
      for (const section of data.report.sections) {
        if (section.name === "Assets") {
          for (const subgroup of section.sub_sections) {
            if (subgroup.name === "Current Assets") {
              for (const line of subgroup.sub_sections) {
                if (line.name === "Bank Accounts") {
                  line.accounts.forEach(acc => {
                    total += acc.bcy_amount;
                  });
                }
              }
            }
          }
        }
      }
    }
    return total;
  } else {
    // Current via Bank Accounts API
    const data = await zohoApi(`/bankaccounts?`, orgId);
    let total = 0;
    data.bankaccounts.forEach(acc => {
      if (acc.is_active && (acc.account_type === "bank" || acc.account_type === "cash")) {
        total += acc.bcy_balance;
      }
    });
    return total;
  }
}

// 📅 Parse date from message
function extractDateFromMessage(text) {
  const parsed = chrono.parseDate(text);
  if (!parsed) return null;

  // format YYYY-MM-DD
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// 🚀 Slack app init
const app = new App({
  token: SLACK_BOT_TOKEN,
  signingSecret: SLACK_SIGNING_SECRET,
});

// 💬 Handle Cash in Bank
app.message(/\bcash in bank\b/i, async ({ message, say }) => {
  const queryDate = extractDateFromMessage(message.text);

  const kkTotal = await getCashInBank(ORG_ID_KK, queryDate);
  const ptTotal = await getCashInBank(ORG_ID_PT, queryDate);

  let response = `*🏦 Cash in Bank${queryDate ? " as of " + queryDate : ""}:*\n`;
  response += `KK: ${kkTotal !== null ? "¥" + kkTotal.toLocaleString() : "⚠️ not available"}\n`;
  response += `PT: ${ptTotal !== null ? "Rp " + ptTotal.toLocaleString() : "⚠️ not available"}`;

  await say(response);
});

// 💬 Handle Cash Balance (DEBUG MODE: logs raw response)
app.message(/\bcash balance\b/i, async ({ message, say }) => {
  const queryDate = extractDateFromMessage(message.text);

  const data = await zohoApi(
    `/reports/cash_flow_statement${queryDate ? `?date=${queryDate}` : ""}`,
    ORG_ID_KK
  );

  console.log("📊 Raw Cash Flow Statement Response:", JSON.stringify(data, null, 2));

  await say("✅ Logged raw Zoho Cash Flow Statement response to Render logs. Check the logs for details.");
});

// 🚀 Start bot
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡ UL CFO bot running (Slack ↔ Zoho, Cash in Bank working, Cash Balance debug mode active)");
})();
