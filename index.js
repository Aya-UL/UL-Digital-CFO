// 📄 Fetch Invoices (Unpaid + Partially Paid)
async function getInvoices(orgId, filter = "all") {
  // Get all invoices without filters
  const data = await zohoApi(`/invoices`, orgId);

  let total = 0;
  let details = [];

  if (data && data.invoices) {
    data.invoices.forEach(inv => {
      const status = inv.status.toLowerCase();
      // Only include outstanding ones
      if (status === "sent" || status === "partially_paid") {
        total += inv.balance || 0;

        if (filter === "overdue") {
          // Include only if past due date
          const today = new Date().toISOString().split("T")[0];
          if (inv.due_date && inv.due_date < today) {
            details.push({
              customer: inv.customer_name,
              invoice: inv.invoice_number,
              due_date: inv.due_date,
              amount: inv.balance
            });
          }
        } else if (filter === "unpaid") {
          // Keep details of all outstanding
          details.push({
            customer: inv.customer_name,
            invoice: inv.invoice_number,
            due_date: inv.due_date,
            amount: inv.balance
          });
        }
      }
    });
  }

  return { total, details };
}

// 💬 Handle Invoices (Unpaid total)
app.message(/invoices$/i, async ({ say }) => {
  try {
    const unpaidKK = await getInvoices(ORG_ID_KK, "unpaid");
    const unpaidPT = await getInvoices(ORG_ID_PT, "unpaid");

    let response = `*📄 Unpaid Invoices (Sent + Partially Paid):*\n`;
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
