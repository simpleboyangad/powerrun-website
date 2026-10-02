/* Admin - printable quotation (A4 sheet, window.print() - same approach as
   assets/js/pages/account-invoice.js, reusing the same invoice.css classes). */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;
  var cfg = PR.config;

  var STAMP_LABEL = { draft: 'Draft', sent: 'Awaiting Response', accepted: 'Accepted', rejected: 'Rejected', expired: 'Expired' };
  var TYPE_LABEL = { customer: 'Customer', dealer: 'Dealer', project: 'Project / B2B' };

  function render(quote, company, showDealerMargin) {
    var items = (quote.quotation_items || []).sort(function (a, b) { return a.sort_order - b.sort_order; });
    var showGst = (Number(quote.gst_amount) || 0) > 0;
    var discount = Number(quote.discount_amount) || 0;
    var cgst = Number(quote.cgst_amount) || 0, sgst = Number(quote.sgst_amount) || 0, igst = Number(quote.igst_amount) || 0;
    var isDealer = quote.quotation_type === 'dealer' && showDealerMargin;
    var companyAddress = [company.address_line1, company.address_line2, company.city, company.state, company.pincode]
      .filter(Boolean).join(', ');
    var address = [quote.address, quote.city, quote.state, quote.pincode].filter(Boolean).join(', ');
    var shipAddress = [quote.shipping_address, quote.shipping_city, quote.shipping_state, quote.shipping_pincode].filter(Boolean).join(', ');

    document.getElementById('quoteContent').innerHTML =
      '<div class="invoice-sheet">' +
        '<div class="invoice-head">' +
          '<div>' +
            '<img src="/assets/powerrun-logo.png" alt="PowerRun Industries">' +
            '<div class="company">' +
              '<b>' + PR.esc(company.legal_name || cfg.COMPANY) + '</b><br>' +
              (companyAddress ? PR.esc(companyAddress) + '<br>' : '') +
              (company.gstin ? 'GSTIN: <b>' + PR.esc(company.gstin) + '</b><br>' : '') +
              (company.pan ? 'PAN: <b>' + PR.esc(company.pan) + '</b><br>' : '') +
              '☎ ' + PR.esc(cfg.PHONE) + '<br>✉ ' + PR.esc(cfg.EMAIL) + '<br>' +
              PR.esc(cfg.SITE_URL.replace('https://', '')) +
            '</div>' +
          '</div>' +
          '<div class="invoice-title">' +
            '<h1>Quotation</h1>' +
            '<div class="meta">' +
              'Quote <b>' + PR.esc(quote.quote_number) + '</b><br>' +
              'Type <b>' + (TYPE_LABEL[quote.quotation_type] || 'Customer') + '</b><br>' +
              'Date <b>' + PR.formatDate(quote.created_at) + '</b><br>' +
              (quote.valid_until ? 'Valid until <b>' + PR.formatDate(quote.valid_until) + '</b><br>' : '') +
              '<span class="invoice-stamp ' + PR.esc(quote.status) + '">' + (STAMP_LABEL[quote.status] || quote.status) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="invoice-parties">' +
          '<div><h3>Quoted to</h3><p><b>' + PR.esc(quote.customer_name) + '</b>' +
            (quote.company_name ? '<br>' + PR.esc(quote.company_name) : '') +
            (quote.contact_person ? '<br>Attn: ' + PR.esc(quote.contact_person) : '') + '<br>' +
            (address ? PR.esc(address) + '<br>' : '') +
            (quote.gstin ? 'GSTIN: ' + PR.esc(quote.gstin) + '<br>' : '') +
            '☎ ' + PR.esc(quote.customer_mobile || '-') +
            (quote.customer_email ? '<br>✉ ' + PR.esc(quote.customer_email) : '') +
          '</p></div>' +
          '<div><h3>Ship to</h3><p>' + (shipAddress ? PR.esc(shipAddress) : PR.esc(address || '-')) + '</p></div>' +
        '</div>' +

        (quote.quotation_type === 'project' && (quote.project_name || quote.client_name)
          ? '<div class="invoice-note"><b>Project Details</b><br>' +
            (quote.project_name ? 'Project: ' + PR.esc(quote.project_name) + '<br>' : '') +
            (quote.project_location ? 'Location: ' + PR.esc(quote.project_location) + '<br>' : '') +
            (quote.client_name ? 'Client: ' + PR.esc(quote.client_name) + '<br>' : '') +
            (quote.consultant ? 'Consultant: ' + PR.esc(quote.consultant) + '<br>' : '') +
            (quote.reference_number ? 'Reference: ' + PR.esc(quote.reference_number) : '') +
          '</div>'
          : '') +

        '<table class="invoice-items"><thead><tr>' +
          '<th style="width:38px">#</th><th>Product</th><th>SKU</th>' +
          (showGst ? '<th>HSN</th><th class="num">GST</th>' : '') +
          '<th class="num">Qty</th><th class="num">Rate</th>' +
          (isDealer ? '<th class="num">Dealer Price</th>' : '') +
          '<th class="num">Amount</th>' +
        '</tr></thead><tbody>' +
        items.map(function (item, index) {
          return '<tr><td>' + (index + 1) + '</td>' +
            '<td><b>' + PR.esc(item.product_name) + '</b>' +
              (Number(item.mrp) > Number(item.unit_price) ? '<br><small style="color:#888">MRP ' + PR.money(item.mrp) + '</small>' : '') + '</td>' +
            '<td>' + PR.esc(item.product_sku || '-') + '</td>' +
            (showGst ? '<td>' + PR.esc(item.hsn_code || '-') + '</td><td class="num">' + (Number(item.gst_rate) || 0) + '%</td>' : '') +
            '<td class="num">' + item.quantity + '</td>' +
            '<td class="num">' + PR.money(item.unit_price) + '</td>' +
            (isDealer ? '<td class="num">' + (item.dealer_price != null ? PR.money(item.dealer_price) : '-') + '</td>' : '') +
            '<td class="num">' + PR.money(item.total_price) + '</td></tr>';
        }).join('') +
        '</tbody></table>' +

        (isDealer
          ? '<div class="invoice-note"><b>Dealer Terms (Internal)</b><br>' +
            (quote.dealer_discount_percent ? 'Dealer Discount: ' + quote.dealer_discount_percent + '%<br>' : '') +
            (quote.dealer_margin_percent ? 'Dealer Margin: ' + quote.dealer_margin_percent + '%<br>' : '') +
            (quote.moq ? 'MOQ: ' + quote.moq + '<br>' : '') +
            (quote.dealer_scheme ? 'Scheme: ' + PR.esc(quote.dealer_scheme) + '<br>' : '') +
            (quote.credit_terms ? 'Credit Terms: ' + PR.esc(quote.credit_terms) : '') +
          '</div>'
          : '') +

        '<div class="invoice-totals"><table>' +
          (discount > 0
            ? '<tr><td>Total MRP</td><td>' + PR.money(quote.mrp_total) + '</td></tr>' +
              '<tr><td style="color:#14663a">Discount</td><td style="color:#14663a">- ' + PR.money(discount) + '</td></tr>'
            : '') +
          '<tr><td>' + (showGst ? 'Taxable Value' : 'Subtotal') + '</td><td>' + PR.money(showGst ? quote.taxable_amount : quote.subtotal) + '</td></tr>' +
          (showGst && igst > 0 ? '<tr><td>IGST</td><td>' + PR.money(igst) + '</td></tr>' : '') +
          (showGst && cgst > 0 ? '<tr><td>CGST</td><td>' + PR.money(cgst) + '</td></tr><tr><td>SGST</td><td>' + PR.money(sgst) + '</td></tr>' : '') +
          '<tr><td>Shipping</td><td>' + (Number(quote.shipping_cost) > 0 ? PR.money(quote.shipping_cost) : 'Free') + '</td></tr>' +
          (Number(quote.freight_cost) > 0 ? '<tr><td>Freight</td><td>' + PR.money(quote.freight_cost) + '</td></tr>' : '') +
          (Number(quote.installation_cost) > 0 ? '<tr><td>Installation</td><td>' + PR.money(quote.installation_cost) + '</td></tr>' : '') +
          (Number(quote.other_charges) ? '<tr><td>Other Charges</td><td>' + PR.money(quote.other_charges) + '</td></tr>' : '') +
          (Number(quote.round_off) ? '<tr><td>Round Off</td><td>' + PR.money(quote.round_off) + '</td></tr>' : '') +
          '<tr class="grand"><td>Grand Total</td><td>' + PR.money(quote.total_amount) + '</td></tr>' +
        '</table></div>' +

        '<div class="invoice-note">' +
          (quote.payment_terms ? '<b>Payment Terms:</b> ' + PR.esc(quote.payment_terms) + '<br>' : '') +
          (quote.estimated_delivery ? '<b>Estimated Delivery:</b> ' + PR.esc(quote.estimated_delivery) + '<br>' : '') +
          (quote.dispatch_from ? '<b>Dispatch From:</b> ' + PR.esc(quote.dispatch_from) + '<br>' : '') +
          (quote.transportation ? '<b>Transportation:</b> ' + PR.esc(quote.transportation) +
            (quote.freight_terms ? ' (' + (quote.freight_terms === 'paid' ? 'Freight Paid' : 'Freight To Pay') + ')' : '') + '<br>' : '') +
          (quote.installation_included ? 'Installation included.<br>' : '') +
          (quote.commissioning_included ? 'Commissioning included.<br>' : '') +
        '</div>' +

        (quote.warranty_terms
          ? '<div class="invoice-note"><b>Warranty</b><br>' + PR.esc(quote.warranty_terms).replace(/\n/g, '<br>') + '</div>'
          : '') +

        (quote.terms
          ? '<div class="invoice-note"><b>Terms &amp; Conditions</b><br>' + PR.esc(quote.terms).replace(/\n/g, '<br>') + '</div>'
          : '<div class="invoice-note">This quotation is valid until the date shown above. Prices and availability are subject to change thereafter.</div>') +

        (company.bank_name || company.signatory_name
          ? '<div class="invoice-parties" style="margin-top:14px">' +
            '<div>' + (company.bank_name
              ? '<h3>Bank Details</h3><p>' +
                PR.esc(company.bank_name) + '<br>' +
                (company.bank_account_name ? 'A/c Name: ' + PR.esc(company.bank_account_name) + '<br>' : '') +
                (company.bank_account_number ? 'A/c No: ' + PR.esc(company.bank_account_number) + '<br>' : '') +
                (company.bank_ifsc ? 'IFSC: ' + PR.esc(company.bank_ifsc) + '<br>' : '') +
                (company.bank_branch ? 'Branch: ' + PR.esc(company.bank_branch) : '') +
              '</p>' : '<div></div>') + '</div>' +
            '<div>' + (company.signatory_name
              ? '<p style="margin-top:46px;text-align:right"><b>' + PR.esc(company.signatory_name) + '</b><br>Authorised Signatory</p>' : '') + '</div>' +
          '</div>'
          : '') +

        '<div class="invoice-note" style="text-align:center;color:#999">This is a computer-generated document.' +
          (company.pdf_footer ? '<br>' + PR.esc(company.pdf_footer) : '') + '</div>' +
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
      var company = Object.assign({}, settings.company || {}, { pdf_footer: (settings.quotation_defaults || {}).pdf_footer });
      var rows = await PR.call('load quotation', function (sb) {
        return sb.from('quotations').select('*, quotation_items(*)').eq('id', id).limit(1);
      });
      if (!rows || !rows.length) {
        host.innerHTML = '<div class="invoice-sheet"><h2>Quotation not found</h2></div>';
        return;
      }
      var quote = rows[0];
      render(quote, company, false);

      if (quote.quotation_type === 'dealer') {
        var toggleWrap = document.getElementById('dealerMarginToggleWrap');
        toggleWrap.hidden = false;
        document.getElementById('dealerMarginToggle').addEventListener('change', function (e) {
          render(quote, company, e.target.checked);
        });
      }
    } catch (err) {
      host.innerHTML = '<div class="invoice-sheet"><h2>The quotation could not be loaded</h2><p>' + PR.esc(err.message) + '</p></div>';
    }
  });
})();
