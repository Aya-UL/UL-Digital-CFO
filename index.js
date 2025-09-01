const { App } = require("@slack/bolt");
const fetch = require("node-fetch");
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

  const joinChar = path.includes("?") ? "&" : "?";
  const url = `${ZOHO_BOOKS_BASE}${path}${joinChar}organization_id=${orgId}`;

  console.log("🌐 Calling Zoho API:", url);

  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${zohoAccessToken}` },
  });
  const data = await res.json();

  if (!res.ok) {
    console.error("❌ Zoho API error:", data);
    throw new Error(JSON.stringify(data));
  }
  return data;
}

// 🏦 Fetch Cash (Bank Accounts only)
async function getCash(orgId) {
  const data = await zohoApi(`/bankaccounts`, orgId);
  let total = 0;
  data.bankaccounts.forEach(acc => {
    if (acc.is_active && (acc.account_type === "bank" || acc.account_type === "cash")) {
      total += acc.bcy_balance || 0;
    }
  });
  return total;
}

// 📄 Fetch Invoices
async function getInvoices(orgId, filter = "unpaid") {
  let path = `/invoices?status=${filter}`;
  if (filter === "overdue") path = `/invoices?status=unpaid&overdue=true`;

  const data = await zohoApi(path, orgId);

  let total = 0;
  let details = [];

  if (data && data.invoices) {
    data.invoices.forEach(inv => {
      total += inv.balance || 0;
      details.push({
        customer: inv.customer_name,
        invoice: inv.invoice_number,
        due_date: inv.due_date,
        amount: inv.balance
      });
    });
  }

  return { total, details };
}

// 🚀 Slack app init
const app = new App({
  token: SLACK_BOT_TOKEN,
  signingSecret: SLACK_SIGNING_SECRET,
});

// 💬 Handle Cash queries (balance/in bank)
app.message(/cash (in bank|balance)/i, async ({ say }) => {
  try {
    const kkTotal = await getCash(ORG_ID_KK);
    const ptTotal = await getCash(ORG_ID_PT);

    let response = `*💰 Cash Balances:*\n`;
    response += `• KK: ${kkTotal !== null ? "¥" + kkTotal.toLocaleString() : "⚠️ not available"}\n`;
    response += `• PT: ${ptTotal !== null ? "Rp " + ptTotal.toLocaleString() : "⚠️ not available"}`;

    await say(response);
  } catch (err) {
    console.error("❌ Error handling cash query:", err);
    await say("⚠️ Unable to fetch Cash right now.");
  }
});

// 💬 Handle Invoices (Unpaid)
app.message(/invoices$/i, async ({ say }) => {
  try {
    const unpaidKK = await getInvoices(ORG_ID_KK, "unpaid");
    const unpaidPT = await getInvoices(ORG_ID_PT, "unpaid");

    let response = `*📄 Unpaid Invoices:*\n`;
    response += `• KK Total: ${unpaidKK.total ? "¥" + unpaidKK.total.toLocaleString() : "0"}\n`;
    response += `• PT Total: ${unpaidPT.total ? "Rp " + unpaidPT.total.toLocaleString() : "0"}`;

    await say(response);
  } catch (err) {
    console.error("❌ Error handling invoices:", err);
    await say("⚠️ Unable to fetch invoices right now.");
  }
});

// 💬 Handle Overdue Invoices
app.message(/overdue invoices/i, async ({ say }) => {
  try {
    const overdueKK = await getInvoices(ORG_ID_KK, "overdue");
    const overduePT = await getInvoices(ORG_ID_PT, "overdue");

    let response = `*⚠️ Overdue Invoices:*\n`;

    if (overdueKK.details.length > 0) {
      response += `*KK:*\n`;
      overdueKK.details.forEach(inv => {
        response += `• ${inv.customer} | ${inv.invoice} | Due ${inv.due_date} | ¥${inv.amount.toLocaleString()}\n`;
      });
    } else {
      response += `*KK:* None\n`;
    }

    if (overduePT.details.length > 0) {
      response += `*PT:*\n`;
      overduePT.details.forEach(inv => {
        response += `• ${inv.customer} | ${inv.invoice} | Due ${inv.due_date} | Rp ${inv.amount.toLocaleString()}\n`;
      });
    } else {
      response += `*PT:* None\n`;
    }

    await say(response);
  } catch (err) {
    console.error("❌ Error handling overdue invoices:", err);
    await say("⚠️ Unable to fetch overdue invoices right now.");
  }
});

// 🚀 Start bot
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡ UL CFO bot running (Slack ↔ Zoho, Cash + Invoices)");
})();
