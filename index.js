import { App } from '@slack/bolt';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

// Slack app initialization
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

// Simple listener for "hello"
app.message(/hello/i, async ({ message, say }) => {
  await say(`Hello <@${message.user}> 👋 I can see 2 org(s) in Zoho Books!`);
});

// Example: cash balance command
app.message(/cash balance/i, async ({ say, message }) => {
  try {
    const orgs = [
      { name: 'KK', id: process.env.ORG_ID_KK },
      { name: 'PT', id: process.env.ORG_ID_PT }
    ];

    for (const org of orgs) {
      const response = await fetch(
        `${process.env.ZOHO_BOOKS_API}/bankaccounts?organization_id=${org.id}`,
        {
          headers: {
            Authorization: `Zoho-oauthtoken ${process.env.ZB_ACCESS_TOKEN}`
          }
        }
      );

      const data = await response.json();

      if (data && data.bankaccounts) {
        const total = data.bankaccounts.reduce(
          (sum, acct) => sum + (acct.balance || 0),
          0
        );
        await say(`🏦 ${org.name} balance: ${total.toLocaleString()}`);
      } else {
        await say(`⚠️ ${org.name} balance not available`);
      }
    }
  } catch (err) {
    console.error('Error fetching Zoho cash balance:', err);
    await say(`⚠️ Sorry <@${message.user}>, I couldn’t fetch the cash balance right now.`);
  }
});

// Start the app
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('⚡ UL CFO bot is running!');
})();
