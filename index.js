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

// OpenAI setup
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

// simple example: reply when bot is mentioned
app.event("app_mention", async ({ event, say }) => {
  const zohoToken = await getZohoAccessToken();

  // demo call: fetch orgs to prove connection
  const orgs = await axios.get("https://books.zoho.com/api/v3/organizations", {
    headers: { Authorization: `Zoho-oauthtoken ${zohoToken}` }
  });

  await say(`Hello <@${event.user}> 👋 I can see ${orgs.data.organizations.length} org(s) in Zoho Books!`);
});

// Cash Balance command
app.message(/cash balance/i, async ({ message, say }) => {
  try {
    // For now, just reply with a placeholder
    await say(`💰 Hi <@${message.user}>, I’ll fetch your Zoho Books cash balance here soon.`);
  } catch (error) {
    console.error("Error handling cash balance:", error);
    await say("⚠️ Sorry, I had an issue fetching the cash balance.");
  }
});

(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡️ UL CFO bot is running!");
})();
