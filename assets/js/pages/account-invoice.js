/* Customer account - printable invoice.
 *
 * Rendered as an A4 sheet so the customer can print it or use their browser's
 * "Save as PDF". No PDF library is loaded, which keeps the page light and works
 * on every phone and desktop.
 */
(function () {
  'use strict';
  var PR = window.PR;
  var cfg = PR.config;

  function render(order) {
    var items = order.order_items || [];
    var paid = order.payment_status === 'paid';
    var address = [order.address, order.city, order.state, order.pincode].filter(Boolean).join(', ');

    document.getElementById('invoiceContent').innerHTML =
      '<div class="invoice-sheet">' +
        '<div class="invoice-head">' +
          '<div>' +
            '<img src="/assets/powerrun-logo.png" alt="PowerRun Industries">' +
            '<div class="company">' +
              '<b>' + PR.esc(cfg.COMPANY) + '</b><br>' +
              '☎ ' + PR.esc(cfg.PHONE) + '<br>' +
              '✉ ' + PR.esc(cfg.EMAIL) + '<br>' +
              PR.esc(cfg.SITE_URL.replace('https://', '')) +
            '</div>' +
          '</div>' +
          '<div class="invoice-title">' +
            '<h1>Invoice</h1>' +
            '<div class="meta">' +
              'Order <b>' + PR.esc(order.order_number) + '</b><br>' +
              'Date <b>' + PR.formatDate(order.created_at) + '</b><br>' +
              (order.invoice_number ? 'Invoice <b>' + PR.esc(order.invoice_number) + '</b><br>' : '') +
              '<span class="invoice-stamp ' + (paid ? 'paid' : 'pending') + '">' +
                (paid ? 'Paid' : 'Payment pending') + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="invoice-parties">' +
          '<div>' +
            '<h3>Billed to</h3>' +
            '<p><b>' + PR.esc(order.customer_name) + '</b><br>' +
              PR.esc(address) + '<br>' +
              '☎ ' + PR.esc(order.customer_mobile) +
              (order.customer_email ? '<br>✉ ' + PR.esc(order.customer_email) : '') +
            '</p>' +
          '</div>' +
          '<div>' +
            '<h3>Order details</h3>' +
            '<p>' +
              'Status: <b style="text-transform:capitalize">' + PR.esc(order.order_status) + '</b><br>' +
              'Payment method: <b>' +
                PR.esc(order.payment_method === 'razorpay' ? 'Online (Razorpay)' : 'Pay on confirmation') +
              '</b>' +
              (order.tracking_number
                ? '<br>Courier: <b>' + PR.esc(order.courier_partner || '-') + '</b>' +
                  '<br>Tracking: <b>' + PR.esc(order.tracking_number) + '</b>'
                : '') +
            '</p>' +
          '</div>' +
        '</div>' +

        '<table class="invoice-items"><thead><tr>' +
          '<th style="width:38px">#</th><th>Product</th><th>SKU</th>' +
          '<th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th>' +
        '</tr></thead><tbody>' +
        items.map(function (item, index) {
          return '<tr>' +
            '<td>' + (index + 1) + '</td>' +
            '<td><b>' + PR.esc(item.product_name) + '</b></td>' +
            '<td>' + PR.esc(item.product_sku || '-') + '</td>' +
            '<td class="num">' + item.quantity + '</td>' +
            '<td class="num">' + PR.money(item.unit_price) + '</td>' +
            '<td class="num">' + PR.money(item.total_price) + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table>' +

        '<div class="invoice-totals"><table>' +
          '<tr><td>Subtotal</td><td>' + PR.money(order.subtotal) + '</td></tr>' +
          '<tr><td>Shipping</td><td>' +
            (Number(order.shipping_cost) > 0 ? PR.money(order.shipping_cost) : 'Free') + '</td></tr>' +
          (Number(order.discount_amount) > 0
            ? '<tr><td>Discount</td><td>- ' + PR.money(order.discount_amount) + '</td></tr>' : '') +
          (Number(order.gst_amount) > 0
            ? '<tr><td>GST</td><td>' + PR.money(order.gst_amount) + '</td></tr>' : '') +
          '<tr class="grand"><td>Grand Total</td><td>' + PR.money(order.total_amount) + '</td></tr>' +
        '</table></div>' +

        '<div class="invoice-note">' +
          'Thank you for choosing ' + PR.esc(cfg.COMPANY) + '.<br>' +
          'For warranty registration visit ' + PR.esc(cfg.SITE_URL) + '/warranty/ &nbsp;·&nbsp; ' +
          'For service support visit ' + PR.esc(cfg.SITE_URL) + '/service/<br><br>' +
          'This is a computer-generated document and is valid without a signature.' +
        '</div>' +
      '</div>';

    document.title = 'Invoice ' + order.order_number + ' | PowerRun Industries';
  }

  document.addEventListener('DOMContentLoaded', async function () {
    var host = document.getElementById('invoiceContent');
    document.getElementById('printBtn').addEventListener('click', function () { window.print(); });

    var session = await PR.account.getSession();
    if (!session) {
      window.location.replace('/account/?next=' + encodeURIComponent(window.location.pathname + window.location.search));
      return;
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
