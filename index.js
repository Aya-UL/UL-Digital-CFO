const { App } = require("@slack/bolt");
const OpenAI = require("openai");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

// Slack setup
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

// OpenAI setup (not yet used, but ready)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// helper to refresh Zoho access token
async function getZohoAccessToken() {
  const res = await axios.post("https://accounts.zoho.com/oauth/v2/token", null, {
    params: {
      refresh_token: process.env.ZB_REFRESH_TOKEN,
      client_id: process.env.ZB_CLIENT_ID,
      client_secret: process.env.ZB_CLIENT_SECRET,
      grant_type: "refresh_token"
    }
  });
  return res.data.access_token;
}

// Demo handler (just proves bot is alive)
app.event("app_mention", async ({ event, say }) => {
  const zohoToken = await getZohoAccessToken();
  const orgs = await axios.get("https://books.zoho.com/api/v3/organizations", {
    headers: { Authorization: `Zoho-oauthtoken ${zohoToken}` }
  });
  await say(`Hello <@${event.user}> 👋 I can see ${orgs.data.organizations.length} org(s) in Zoho Books!`);
});

// Cash Balance command
app.message(/cash balance/i, async ({ message, say }) => {
  try {
    const text = message.text.toLowerCase();
    const zohoToken = await getZohoAccessToken();

    // helper to fetch bank balances
    async function fetchBalance(orgId, label) {
      const res = await axios.get("https://books.zoho.com/api/v3/bankaccounts", {
        headers: { Authorization: `Zoho-oauthtoken ${zohoToken}` },
        params: { organization_id: orgId }
      });

      let total = 0;
      res.data.bankaccounts.forEach(acc => {
        if (acc.balance !== undefined) {
          total += acc.balance;
        }
      });

      return { label, total };
    }

    let results = [];

    if (text.includes("kk")) {
      results.push(await fetchBalance(process.env.ORG_ID_KK, "KK"));
    } else if (text.includes("pt")) {
      results.push(await fetchBalance(process.env.ORG_ID_PT, "PT"));
    } else {
      // default: show both
      results.push(await fetchBalance(process.env.ORG_ID_KK, "KK"));
      results.push(await fetchBalance(process.env.ORG_ID_PT, "PT"));
    }

    let reply = "💰 Cash Balance:\n";
    results.forEach(r => {
      const formatted = r.label === "KK"
        ? `¥${r.total.toLocaleString("en-US")}`
        : `Rp${r.total.toLocaleString("en-US")}`;
      reply += `• ${r.label}: ${formatted}\n`;
    });

    await say(reply);

  } catch (error) {
    console.error("Error fetching cash balance:", error.response?.data || error.message);
    await say("⚠️ Sorry, I couldn’t fetch the cash balance right now.");
  }
});

(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡️ UL CFO bot is running!");
})();
