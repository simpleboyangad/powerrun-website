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

  var company = {};

  function render(order) {
    var items = order.order_items || [];
    var paid = order.payment_status === 'paid';
    var discount = Number(order.discount_amount) || 0;
    var cgst = Number(order.cgst_amount) || 0;
    var sgst = Number(order.sgst_amount) || 0;
    var igst = Number(order.igst_amount) || 0;
    // GST only appears once a rate is actually in force on the order.
    var showGst = (Number(order.gst_amount) || 0) > 0;
    var companyAddress = [company.address_line1, company.address_line2,
                          company.city, company.state, company.pincode]
                         .filter(Boolean).join(', ');
    var address = [order.address, order.city, order.state, order.pincode].filter(Boolean).join(', ');

    document.getElementById('invoiceContent').innerHTML =
      '<div class="invoice-sheet">' +
        '<div class="invoice-head">' +
          '<div>' +
            '<img src="/assets/powerrun-logo.png" alt="PowerRun Industries">' +
            '<div class="company">' +
              '<b>' + PR.esc(company.legal_name || cfg.COMPANY) + '</b><br>' +
              (companyAddress ? PR.esc(companyAddress) + '<br>' : '') +
              (company.gstin ? 'GSTIN: <b>' + PR.esc(company.gstin) + '</b><br>' : '') +
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
          (showGst ? '<th>HSN</th><th class="num">GST</th>' : '') +
          '<th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th>' +
        '</tr></thead><tbody>' +
        items.map(function (item, index) {
          return '<tr>' +
            '<td>' + (index + 1) + '</td>' +
            '<td><b>' + PR.esc(item.product_name) + '</b>' +
              (Number(item.mrp) > Number(item.unit_price)
                ? '<br><small style="color:#888">MRP ' + PR.money(item.mrp) + '</small>' : '') +
            '</td>' +
            '<td>' + PR.esc(item.product_sku || '-') + '</td>' +
            (showGst
              ? '<td>' + PR.esc(item.hsn_code || '-') + '</td>' +
                '<td class="num">' + (Number(item.gst_rate) || 0) + '%</td>'
              : '') +
            '<td class="num">' + item.quantity + '</td>' +
            '<td class="num">' + PR.money(item.unit_price) + '</td>' +
            '<td class="num">' + PR.money(item.total_price) + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table>' +

        '<div class="invoice-totals"><table>' +
          (discount > 0
            ? '<tr><td>Total MRP</td><td>' + PR.money(order.mrp_total) + '</td></tr>' +
              '<tr><td style="color:#14663a">Discount</td>' +
              '<td style="color:#14663a">- ' + PR.money(discount) + '</td></tr>'
            : '') +
          '<tr><td>' + (showGst ? 'Taxable Value' : 'Subtotal') + '</td><td>' +
            PR.money(showGst ? order.taxable_amount : order.subtotal) + '</td></tr>' +
          (showGst && igst > 0
            ? '<tr><td>IGST</td><td>' + PR.money(igst) + '</td></tr>' : '') +
          (showGst && cgst > 0
            ? '<tr><td>CGST</td><td>' + PR.money(cgst) + '</td></tr>' +
              '<tr><td>SGST</td><td>' + PR.money(sgst) + '</td></tr>' : '') +
          '<tr><td>Shipping</td><td>' +
            (Number(order.shipping_cost) > 0 ? PR.money(order.shipping_cost) : 'Free') + '</td></tr>' +
          '<tr class="grand"><td>Grand Total</td><td>' + PR.money(order.total_amount) + '</td></tr>' +
        '</table></div>' +
        (discount > 0
          ? '<p style="text-align:right;margin:10px 0 0;color:#14663a;font-weight:800">' +
            'You saved ' + PR.money(discount) + ' on this order</p>'
          : '') +

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
