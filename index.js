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

// 🌐 Generic Zoho API caller
async function zohoApi(path, orgId) {
  if (!zohoAccessToken) await refreshZohoToken();

  const url = `${ZOHO_BOOKS_BASE}${path}&organization_id=${orgId}`;
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

// 💰 Cash Balance (true cash & equivalents from Cash Flow Statement)
async function getCashBalance(orgId, date = null) {
  const dateParam = date ? `?date=${date}` : "";
  const path = `/reports/cash_flow_statement${dateParam}`;
  const data = await zohoApi(path, orgId);

  let total = 0;
  if (data && data.report && data.report.sections) {
    const sections = data.report.sections;
    const lastSection = sections[sections.length - 1];
    if (lastSection && lastSection.name.includes("Cash and Cash Equivalents")) {
      total = lastSection.closing_balance || 0;
    }
  }
  return total;
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
app.message(/cash in bank/i, async ({ message, say }) => {
  const queryDate = extractDateFromMessage(message.text);

  const kkTotal = await getCashInBank(ORG_ID_KK, queryDate);
  const ptTotal = await getCashInBank(ORG_ID_PT, queryDate);

  let response = `*🏦 Cash in Bank${queryDate ? " as of " + queryDate : ""}:*\n`;
  response += `KK: ${kkTotal !== null ? "¥" + kkTotal.toLocaleString() : "⚠️ not available"}\n`;
  response += `PT: ${ptTotal !== null ? "Rp " + ptTotal.toLocaleString() : "⚠️ not available"}`;

  await say(response);
});

// 💬 Handle Cash Balance
app.message(/cash balance/i, async ({ message, say }) => {
  const queryDate = extractDateFromMessage(message.text);

  const kkTotal = await getCashBalance(ORG_ID_KK, queryDate);
  const ptTotal = await getCashBalance(ORG_ID_PT, queryDate);

  let response = `*💰 Cash Balance${queryDate ? " as of " + queryDate : ""}:*\n`;
  response += `KK: ${kkTotal !== null ? "¥" + kkTotal.toLocaleString() : "⚠️ not available"}\n`;
  response += `PT: ${ptTotal !== null ? "Rp " + ptTotal.toLocaleString() : "⚠️ not available"}`;

  await say(response);
});

// 🚀 Start bot
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡ UL CFO bot running (Slack ↔ Zoho, Cash in Bank + Cash Balance ready)");
})();
