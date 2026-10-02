/* Admin - printable quotation (A4 sheet, window.print() - same approach as
   assets/js/pages/account-invoice.js, reusing the same invoice.css classes). */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;
  var cfg = PR.config;

  var STAMP_LABEL = { draft: 'Draft', sent: 'Awaiting Response', accepted: 'Accepted', rejected: 'Rejected', expired: 'Expired' };

  function render(quote, company) {
    var items = (quote.quotation_items || []).sort(function (a, b) { return a.sort_order - b.sort_order; });
    var showGst = (Number(quote.gst_amount) || 0) > 0;
    var discount = Number(quote.discount_amount) || 0;
    var cgst = Number(quote.cgst_amount) || 0, sgst = Number(quote.sgst_amount) || 0, igst = Number(quote.igst_amount) || 0;
    var companyAddress = [company.address_line1, company.address_line2, company.city, company.state, company.pincode]
      .filter(Boolean).join(', ');
    var address = [quote.address, quote.city, quote.state, quote.pincode].filter(Boolean).join(', ');

    document.getElementById('quoteContent').innerHTML =
      '<div class="invoice-sheet">' +
        '<div class="invoice-head">' +
          '<div>' +
            '<img src="/assets/powerrun-logo.png" alt="PowerRun Industries">' +
            '<div class="company">' +
              '<b>' + PR.esc(company.legal_name || cfg.COMPANY) + '</b><br>' +
              (companyAddress ? PR.esc(companyAddress) + '<br>' : '') +
              (company.gstin ? 'GSTIN: <b>' + PR.esc(company.gstin) + '</b><br>' : '') +
              '☎ ' + PR.esc(cfg.PHONE) + '<br>✉ ' + PR.esc(cfg.EMAIL) + '<br>' +
              PR.esc(cfg.SITE_URL.replace('https://', '')) +
            '</div>' +
          '</div>' +
          '<div class="invoice-title">' +
            '<h1>Quotation</h1>' +
            '<div class="meta">' +
              'Quote <b>' + PR.esc(quote.quote_number) + '</b><br>' +
              'Date <b>' + PR.formatDate(quote.created_at) + '</b><br>' +
              (quote.valid_until ? 'Valid until <b>' + PR.formatDate(quote.valid_until) + '</b><br>' : '') +
              '<span class="invoice-stamp ' + PR.esc(quote.status) + '">' + (STAMP_LABEL[quote.status] || quote.status) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="invoice-parties">' +
          '<div><h3>Quoted to</h3><p><b>' + PR.esc(quote.customer_name) + '</b><br>' +
            (address ? PR.esc(address) + '<br>' : '') +
            '☎ ' + PR.esc(quote.customer_mobile || '-') +
            (quote.customer_email ? '<br>✉ ' + PR.esc(quote.customer_email) : '') +
          '</p></div>' +
          '<div><h3>Quotation details</h3><p>Status: <b style="text-transform:capitalize">' + PR.esc(quote.status) + '</b></p></div>' +
        '</div>' +

        '<table class="invoice-items"><thead><tr>' +
          '<th style="width:38px">#</th><th>Product</th><th>SKU</th>' +
          (showGst ? '<th>HSN</th><th class="num">GST</th>' : '') +
          '<th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th>' +
        '</tr></thead><tbody>' +
        items.map(function (item, index) {
          return '<tr><td>' + (index + 1) + '</td>' +
            '<td><b>' + PR.esc(item.product_name) + '</b>' +
              (Number(item.mrp) > Number(item.unit_price) ? '<br><small style="color:#888">MRP ' + PR.money(item.mrp) + '</small>' : '') + '</td>' +
            '<td>' + PR.esc(item.product_sku || '-') + '</td>' +
            (showGst ? '<td>' + PR.esc(item.hsn_code || '-') + '</td><td class="num">' + (Number(item.gst_rate) || 0) + '%</td>' : '') +
            '<td class="num">' + item.quantity + '</td>' +
            '<td class="num">' + PR.money(item.unit_price) + '</td>' +
            '<td class="num">' + PR.money(item.total_price) + '</td></tr>';
        }).join('') +
        '</tbody></table>' +

        '<div class="invoice-totals"><table>' +
          (discount > 0
            ? '<tr><td>Total MRP</td><td>' + PR.money(quote.mrp_total) + '</td></tr>' +
              '<tr><td style="color:#14663a">Discount</td><td style="color:#14663a">- ' + PR.money(discount) + '</td></tr>'
            : '') +
          '<tr><td>' + (showGst ? 'Taxable Value' : 'Subtotal') + '</td><td>' + PR.money(showGst ? quote.taxable_amount : quote.subtotal) + '</td></tr>' +
          (showGst && igst > 0 ? '<tr><td>IGST</td><td>' + PR.money(igst) + '</td></tr>' : '') +
          (showGst && cgst > 0 ? '<tr><td>CGST</td><td>' + PR.money(cgst) + '</td></tr><tr><td>SGST</td><td>' + PR.money(sgst) + '</td></tr>' : '') +
          '<tr><td>Shipping</td><td>' + (Number(quote.shipping_cost) > 0 ? PR.money(quote.shipping_cost) : 'Free') + '</td></tr>' +
          '<tr class="grand"><td>Grand Total</td><td>' + PR.money(quote.total_amount) + '</td></tr>' +
        '</table></div>' +

        (quote.terms
          ? '<div class="invoice-note"><b>Terms &amp; Conditions</b><br>' + PR.esc(quote.terms).replace(/\n/g, '<br>') + '</div>'
          : '<div class="invoice-note">This quotation is valid until the date shown above. Prices and availability are subject to change thereafter.<br>' +
            'This is a computer-generated document and is valid without a signature.</div>') +
      '</div>';

    document.title = 'Quotation ' + quote.quote_number + ' | PowerRun Industries';
  }

  document.addEventListener('DOMContentLoaded', async function () {
    var host = document.getElementById('quoteContent');
    document.getElementById('printBtn').addEventListener('click', function () { window.print(); });

    try {
      await PRA.requireAdmin();
    } catch (err) {
      return; // requireAdmin already redirected to login
    }

    var id = PR.param('id');
    if (!id) {
      host.innerHTML = '<div class="invoice-sheet"><h2>No quotation selected</h2></div>';
      return;
    }

    try {
      var settings = await PR.getSettings();
      var rows = await PR.call('load quotation', function (sb) {
        return sb.from('quotations').select('*, quotation_items(*)').eq('id', id).limit(1);
      });
      if (!rows || !rows.length) {
        host.innerHTML = '<div class="invoice-sheet"><h2>Quotation not found</h2></div>';
        return;
      }
      render(rows[0], settings.company || {});
    } catch (err) {
      host.innerHTML = '<div class="invoice-sheet"><h2>The quotation could not be loaded</h2><p>' + PR.esc(err.message) + '</p></div>';
    }
  });
})();
