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

// 🌐 Generic Zoho API caller (smart URL builder)
async function zohoApi(path, orgId) {
  if (!zohoAccessToken) await refreshZohoToken();

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

// 🏦 Cash in Bank (today or historical)
async function getCashInBank(orgId, date = null) {
  if (date) {
    // Historical via Balance Sheet
    const path = `/reports/balance_sheet?date=${date}`;
    const data = await zohoApi(path, orgId);

    let total = 0;
    if (data && data.report && data.report.sections) {
      data.report.sections.forEach(section => {
        if (section.sub_sections) {
          section.sub_sections.forEach(subgroup => {
            if (subgroup.sub_sections) {
              subgroup.sub_sections.forEach(line => {
                if (line.accounts) {
                  line.accounts.forEach(acc => {
                    if (acc.account_type === "bank" || acc.account_type === "cash") {
                      total += acc.bcy_amount || 0;
                    }
                  });
                }
              });
            }
          });
        }
      });
    }
    return total;
  } else {
    // Current via Bank Accounts API
    const data = await zohoApi(`/bankaccounts`, orgId);
    let total = 0;
    data.bankaccounts.forEach(acc => {
      if (acc.is_active && (acc.account_type === "bank" || acc.account_type === "cash")) {
        total += acc.bcy_balance || 0;
      }
    });
    return total;
  }
}

// 💰 Cash Balance (closing balance from Cash Flow Statement)
async function getCashBalance(orgId, date = null) {
  let path;
  if (date) {
    // Use from_date = to_date = requested date
    path = `/reports/cash_flow_statement?from_date=${date}&to_date=${date}`;
  } else {
    path = `/reports/cash_flow_statement`;
  }

  const data = await zohoApi(path, orgId);

  let total = 0;
  if (data && data.report && data.report.footer) {
    total = data.report.footer.closing_balance || 0;
  }
  return total;
}

// 📅 Parse date from message
function extractDateFromMessage(text) {
  const parsed = chrono.parseDate(text);
  if (!parsed) return null;

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
  try {
    const queryDate = extractDateFromMessage(message.text);

    const kkTotal = await getCashInBank(ORG_ID_KK, queryDate);
    const ptTotal = await getCashInBank(ORG_ID_PT, queryDate);

    let response = `*🏦 Cash in Bank${queryDate ? " as of " + queryDate : ""}:*\n`;
    response += `KK: ${kkTotal !== null ? "¥" + kkTotal.toLocaleString() : "⚠️ not available"}\n`;
    response += `PT: ${ptTotal !== null ? "Rp " + ptTotal.toLocaleString() : "⚠️ not available"}`;

    await say(response);
  } catch (err) {
    console.error("❌ Error handling Cash in Bank:", err);
    await say("⚠️ Unable to fetch Cash in Bank right now.");
  }
});

// 💬 Handle Cash Balance
app.message(/\bcash balance\b/i, async ({ message, say }) => {
  try {
    const queryDate = extractDateFromMessage(message.text);

    const kkTotal = await getCashBalance(ORG_ID_KK, queryDate);
    const ptTotal = await getCashBalance(ORG_ID_PT, queryDate);

    let response = `*💰 Cash Balance${queryDate ? " as of " + queryDate : ""}:*\n`;
    response += `KK: ${kkTotal !== null ? "¥" + kkTotal.toLocaleString() : "⚠️ not available"}\n`;
    response += `PT: ${ptTotal !== null ? "Rp " + ptTotal.toLocaleString() : "⚠️ not available"}`;

    await say(response);
  } catch (err) {
    console.error("❌ Error handling Cash Balance:", err);
    await say("⚠️ Unable to fetch Cash Balance right now.");
  }
});

// 🚀 Start bot
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡ UL CFO bot running (Slack ↔ Zoho, Cash in Bank + Cash Balance stable)");
})();
