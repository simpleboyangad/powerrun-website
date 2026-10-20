/* Customer account - printable GST invoice.
 *
 * Rendered as an A4 sheet so the customer can print it or use their browser's
 * "Save as PDF". No PDF library is loaded, which keeps the page light and works
 * on every phone and desktop.
 */
(function () {
  'use strict';
  var PR = window.PR;

  var company = {};

  /* A Tax Invoice once the order has a number from us (issued at dispatch),
     a Proforma Invoice until then - see assets/js/invoice-doc.js. */
  function render(order) {
    var tax = !!order.invoice_number;
    document.getElementById('invoiceContent').innerHTML =
      PR.invoiceHtml(order, company, { type: tax ? 'tax' : 'proforma' });
    document.title = (tax ? 'Tax Invoice ' + order.invoice_number : 'Proforma Invoice ' + order.order_number) +
      ' | PowerRun Industries';
  }

  document.addEventListener('DOMContentLoaded', async function () {
    var host = document.getElementById('invoiceContent');
    document.getElementById('printBtn').addEventListener('click', function () { window.print(); });

    var session = await PR.account.getSession();
    if (!session) {
      window.location.replace('/account/?next=' + encodeURIComponent(window.location.pathname + window.location.search));
      return;
    }

    try {
      var settings = await PR.getSettings();
      company = settings.company || {};
    } catch (err) {
      console.warn('[PowerRun] company details unavailable for the invoice:', err.message);
    }

    var orderNumber = PR.param('id');
    if (!orderNumber) {
      host.innerHTML = '<div class="invoice-sheet"><h2>No order selected</h2>' +
        '<p><a href="/account/orders/">Back to my orders</a></p></div>';
      return;
    }

    try {
      var order = await PR.account.loadOrder(orderNumber);
      if (!order) {
        host.innerHTML = '<div class="invoice-sheet"><h2>Invoice not available</h2>' +
          '<p>This order is not linked to your account. If you ordered as a guest, add it from ' +
          '<a href="/account/">My Account</a> first.</p></div>';
        return;
      }
      render(order);
    } catch (err) {
      console.error('[PowerRun] invoice failed:', err);
      host.innerHTML = '<div class="invoice-sheet"><h2>The invoice could not be loaded</h2>' +
        '<p>' + PR.esc(err.message) + '</p></div>';
    }
  });
})();
