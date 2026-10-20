/* PowerRun Industries - GST invoice document (Tax Invoice and Proforma).
 *
 * One renderer for the customer's invoice page (/account/invoice/) and the
 * admin print page (/admin/invoice/), so both always show the same figures.
 *
 * Every figure is worked out per line from what create_website_order() stored:
 *   - prices include GST, so a line's value = taxable_amount + gst_amount;
 *   - a coupon is a discount given at the time of sale, so it is spread over
 *     the lines in proportion to their value and lowers the taxable value;
 *   - delivery charges are part of the same (composite) supply and are taxed
 *     at the rate of the main item;
 *   - CGST + SGST when the place of supply is the company's own state,
 *     otherwise IGST (same rule as the order function, migration 32);
 *   - any paisa left over from rounding goes to a "Round off" row so the
 *     invoice total always equals the order total.
 *
 * A Tax Invoice exists only once an admin has issued a number for the order
 * (issue_tax_invoice()); until then the same layout prints as a PROFORMA.
 */
(function () {
  'use strict';
  var PR = window.PR;

  var r2 = function (n) { return Math.round((Number(n) || 0) * 100) / 100; };
  var num = function (v) { var n = Number(v); return Number.isFinite(n) ? n : 0; };
  var amt = function (n) {
    return num(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  /* ------------------------------------------------- amount in words (INR) */
  var ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
              'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
              'Eighteen', 'Nineteen'];
  var TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function twoDigits(n) {
    return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  }

  function words(n) {
    var parts = [];
    [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand'], [100, 'Hundred']].forEach(function (u) {
      if (n >= u[0]) {
        var count = Math.floor(n / u[0]);
        parts.push((count >= 100 ? words(count) : twoDigits(count)) + ' ' + u[1]);
        n %= u[0];
      }
    });
    if (n) parts.push(twoDigits(n));
    return parts.join(' ');
  }

  PR.rupeesInWords = function (value) {
    var paise = Math.round(Math.abs(num(value)) * 100);
    var rupees = Math.floor(paise / 100);
    paise %= 100;
    return 'Indian Rupees ' + (rupees ? words(rupees) : 'Zero') +
      (paise ? ' and ' + twoDigits(paise) + ' Paise' : '') + ' Only';
  };

  /* ------------------------------------------------------------ figures */
  function stateWithCode(state) {
    var code = PR.GST_STATE_CODES[state];
    return state ? state + (code ? ' (' + code + ')' : '') : '-';
  }

  PR.invoiceFigures = function (order, company) {
    var items = order.order_items || order.items || [];
    var pos = order.place_of_supply || order.shipping_state || order.state || '';
    var seller = (company && company.state) || '';
    var intra = !seller || !pos || seller.toLowerCase() === pos.toLowerCase();

    var lines = items.map(function (item) {
      var rate = num(item.gst_rate);
      var qty = num(item.quantity) || 1;
      // orders placed before GST was recorded have no taxable_amount
      var gross = num(item.taxable_amount) > 0
        ? num(item.taxable_amount) + num(item.gst_amount)
        : num(item.total_price);
      return {
        name: item.product_name, sku: item.product_sku, hsn: item.hsn_code || '',
        qty: qty, rate: rate, gross: gross
      };
    });

    // coupon spread over the goods, in proportion to their value
    var coupon = Math.min(num(order.coupon_discount), lines.reduce(function (s, l) { return s + l.gross; }, 0));
    var totalGross = lines.reduce(function (s, l) { return s + l.gross; }, 0);
    var left = r2(coupon);
    lines.forEach(function (line, i) {
      var share = i === lines.length - 1 ? left : r2(coupon * line.gross / (totalGross || 1));
      left = r2(left - share);
      line.couponShare = share;
    });

    var shipping = num(order.shipping_cost);
    if (shipping > 0) {
      var main = lines.slice().sort(function (a, b) { return b.gross - a.gross; })[0];
      lines.push({
        name: 'Freight & Delivery Charges', sku: '', hsn: '9965', qty: 1,
        rate: main ? main.rate : 0, gross: shipping, couponShare: 0, isCharge: true
      });
    }

    var totals = { taxable: 0, cgst: 0, sgst: 0, igst: 0, discount: 0, total: 0 };
    var hsn = {};
    lines.forEach(function (line) {
      var factor = 1 + line.rate / 100;
      var listTaxable = r2(line.gross / factor);
      line.unitRate = r2(listTaxable / line.qty);
      line.taxable = r2((line.gross - line.couponShare) / factor);
      line.discount = r2(listTaxable - line.taxable);
      var tax = r2(line.gross - line.couponShare - line.taxable);
      line.cgst = intra ? r2(tax / 2) : 0;
      line.sgst = intra ? r2(tax - line.cgst) : 0;
      line.igst = intra ? 0 : tax;
      line.total = r2(line.taxable + tax);

      totals.taxable += line.taxable; totals.discount += line.discount;
      totals.cgst += line.cgst; totals.sgst += line.sgst; totals.igst += line.igst;
      totals.total += line.total;

      var key = (line.hsn || '-') + '|' + line.rate;
      var h = hsn[key] || (hsn[key] = { hsn: line.hsn || '-', rate: line.rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 });
      h.taxable += line.taxable; h.cgst += line.cgst; h.sgst += line.sgst; h.igst += line.igst;
    });
    Object.keys(totals).forEach(function (k) { totals[k] = r2(totals[k]); });

    var grand = r2(order.total_amount);
    return {
      lines: lines, intra: intra, placeOfSupply: pos, totals: totals,
      hsn: Object.keys(hsn).map(function (k) { return hsn[k]; }),
      roundOff: r2(grand - totals.total), grand: grand
    };
  };

  /* A manual proforma (table proforma_invoices) in the shape PR.invoiceHtml
     reads. Line rates include GST, like the shop; the overall discount is
     treated like a coupon (spread over the goods, lowers the taxable value)
     and freight is taxed at the main item's rate. Place of supply: the
     buyer's GSTIN state for a registered dealer, otherwise the ship-to state. */
  PR.proformaOrder = function (pi) {
    var items = (pi.items || []).filter(function (it) { return it && (it.product_name || '').trim(); })
      .map(function (it) {
        var qty = Math.max(1, num(it.quantity) || 1);
        var rate = num(it.gst_rate);
        var gross = r2(num(it.unit_price) * qty);
        var taxable = r2(gross / (1 + rate / 100));
        return {
          product_name: it.product_name, product_sku: it.product_sku || '', hsn_code: it.hsn_code || '',
          quantity: qty, gst_rate: rate, unit_price: num(it.unit_price),
          taxable_amount: taxable, gst_amount: r2(gross - taxable), total_price: gross
        };
      });
    var goods = items.reduce(function (s, it) { return s + it.total_price; }, 0);
    var discount = Math.min(Math.max(0, num(pi.discount_amount)), goods);
    var shipping = Math.max(0, num(pi.shipping_cost));
    var same = pi.ship_same !== false;
    var shipState = same ? pi.state : (pi.shipping_state || pi.state);
    return {
      order_number: pi.pi_number || 'DRAFT', created_at: pi.pi_date || pi.created_at,
      customer_name: pi.customer_name || '', customer_business_name: pi.business_name || '',
      customer_gstin: (pi.gstin || '').trim().toUpperCase(),
      customer_mobile: pi.mobile || '', customer_email: pi.email || '',
      address: pi.address || '', city: pi.city || '', state: pi.state || '', pincode: pi.pincode || '',
      shipping_address: same ? pi.address : pi.shipping_address, shipping_city: same ? pi.city : pi.shipping_city,
      shipping_state: shipState, shipping_pincode: same ? pi.pincode : pi.shipping_pincode,
      place_of_supply: (pi.gstin || '').trim() ? (pi.state || shipState) : shipState,
      order_items: items, coupon_discount: discount, shipping_cost: shipping,
      total_amount: r2(goods - discount + shipping),
      payment_status: pi.status === 'paid' ? 'paid' : 'pending'
    };
  };

  /* ---------------------------------------------------------- document */
  /* opts: { type: 'tax' | 'proforma', copy: 'Original for Recipient',
             bank: true to print bank details (admin only - customers can't read them),
             manual proforma (admin/proforma): proformaNo, proformaDate, validUntil,
             paymentTerms, notes - the "Order No." row is left out } */
  PR.invoiceHtml = function (order, company, opts) {
    opts = opts || {};
    company = company || {};
    var cfg = PR.config;
    var tax = opts.type === 'tax' && order.invoice_number;
    var f = PR.invoiceFigures(order, company);
    var esc = PR.esc;
    var paid = order.payment_status === 'paid';
    var b2b = !!order.customer_gstin;

    var companyAddress = [company.address_line1, company.address_line2, company.city,
                          company.state, company.pincode].filter(Boolean).join(', ');
    var billAddress = [order.address, order.city, order.state, order.pincode].filter(Boolean).join(', ');
    var shipAddress = [order.shipping_address || order.address, order.shipping_city || order.city,
                       order.shipping_state || order.state, order.shipping_pincode || order.pincode]
                      .filter(Boolean).join(', ');
    var taxHeads = f.intra
      ? '<th class="num">CGST</th><th class="num">SGST</th>'
      : '<th class="num">IGST</th>';
    var taxCells = function (row, rate) {
      return f.intra
        ? '<td class="num">' + amt(row.cgst) + '<small>' + (rate / 2) + '%</small></td>' +
          '<td class="num">' + amt(row.sgst) + '<small>' + (rate / 2) + '%</small></td>'
        : '<td class="num">' + amt(row.igst) + '<small>' + rate + '%</small></td>';
    };

    return '<div class="invoice-sheet gst-invoice">' +
      '<div class="invoice-head">' +
        '<div>' +
          '<img src="/assets/powerrun-logo.png" alt="PowerRun Industries">' +
          '<div class="company">' +
            '<b>' + esc(company.legal_name || cfg.COMPANY) + '</b><br>' +
            (companyAddress ? esc(companyAddress) + '<br>' : '') +
            (company.gstin ? 'GSTIN: <b>' + esc(company.gstin) + '</b>' +
              (company.state ? ' &nbsp;·&nbsp; State: ' + esc(stateWithCode(company.state)) : '') + '<br>' : '') +
            '☎ ' + esc(cfg.PHONE) + ' &nbsp;·&nbsp; ✉ ' + esc(cfg.EMAIL) +
          '</div>' +
        '</div>' +
        '<div class="invoice-title">' +
          '<h1>' + (tax ? 'Tax Invoice' : 'Proforma Invoice') + '</h1>' +
          '<div class="copy-label">' + (tax ? esc(opts.copy || 'Original for Recipient') : 'Not a Tax Invoice') + '</div>' +
          '<table class="inv-meta">' +
            (tax
              ? '<tr><td>Invoice No.</td><td><b>' + esc(order.invoice_number) + '</b></td></tr>' +
                '<tr><td>Invoice Date</td><td><b>' + PR.formatDate(order.invoice_date) + '</b></td></tr>'
              : '<tr><td>Proforma No.</td><td><b>' + esc(opts.proformaNo || ('PI-' + order.order_number)) + '</b></td></tr>' +
                '<tr><td>Date</td><td><b>' + PR.formatDate(opts.proformaDate || new Date()) + '</b></td></tr>' +
                (opts.validUntil ? '<tr><td>Valid Until</td><td>' + PR.formatDate(opts.validUntil) + '</td></tr>' : '')) +
            (opts.proformaNo ? '' : '<tr><td>Order No.</td><td>' + esc(order.order_number) + ' · ' + PR.formatDate(order.created_at) + '</td></tr>') +
            '<tr><td>Place of Supply</td><td>' + esc(stateWithCode(f.placeOfSupply)) + '</td></tr>' +
            '<tr><td>Reverse Charge</td><td>No</td></tr>' +
          '</table>' +
          '<span class="invoice-stamp ' + (paid ? 'paid' : 'pending') + '">' +
            (paid ? 'Paid' : 'Payment pending') + '</span>' +
        '</div>' +
      '</div>' +

      '<div class="invoice-parties">' +
        '<div><h3>Bill to</h3><p>' +
          '<b>' + esc(order.customer_business_name || order.customer_name) + '</b><br>' +
          (order.customer_business_name ? 'Attn: ' + esc(order.customer_name) + '<br>' : '') +
          esc(billAddress) + '<br>' +
          'State: ' + esc(stateWithCode(order.state)) + '<br>' +
          'GSTIN: <b>' + (b2b ? esc(order.customer_gstin) : 'Unregistered') + '</b><br>' +
          '☎ ' + esc(order.customer_mobile || '-') +
          (order.customer_email ? '<br>✉ ' + esc(order.customer_email) : '') +
        '</p></div>' +
        '<div><h3>Ship to</h3><p>' +
          '<b>' + esc(order.customer_name) + '</b><br>' + esc(shipAddress) + '<br>' +
          'State: ' + esc(stateWithCode(order.shipping_state || order.state)) +
          (order.tracking_number
            ? '<br>Courier: ' + esc(order.courier_partner || '-') + '<br>Tracking: ' + esc(order.tracking_number)
            : '') +
        '</p></div>' +
      '</div>' +

      '<table class="invoice-items inv-lines"><thead><tr>' +
        '<th>#</th><th>Description</th><th>HSN/SAC</th><th class="num">Qty</th>' +
        '<th class="num">Rate</th><th class="num">Discount</th><th class="num">Taxable Value</th>' +
        taxHeads + '<th class="num">Amount</th>' +
      '</tr></thead><tbody>' +
      f.lines.map(function (line, i) {
        return '<tr>' +
          '<td>' + (i + 1) + '</td>' +
          '<td><b>' + esc(line.name) + '</b>' + (line.sku ? '<small>SKU ' + esc(line.sku) + '</small>' : '') + '</td>' +
          '<td>' + esc(line.hsn || '-') + '</td>' +
          '<td class="num">' + line.qty + (line.isCharge ? '' : ' Nos') + '</td>' +
          '<td class="num">' + amt(line.unitRate) + '</td>' +
          '<td class="num">' + (line.discount ? amt(line.discount) : '-') + '</td>' +
          '<td class="num">' + amt(line.taxable) + '</td>' +
          taxCells(line, line.rate) +
          '<td class="num"><b>' + amt(line.total) + '</b></td>' +
        '</tr>';
      }).join('') +
      '</tbody><tfoot><tr>' +
        '<td></td><td colspan="4"><b>Total</b></td>' +
        '<td class="num">' + (f.totals.discount ? amt(f.totals.discount) : '-') + '</td>' +
        '<td class="num"><b>' + amt(f.totals.taxable) + '</b></td>' +
        (f.intra
          ? '<td class="num"><b>' + amt(f.totals.cgst) + '</b></td><td class="num"><b>' + amt(f.totals.sgst) + '</b></td>'
          : '<td class="num"><b>' + amt(f.totals.igst) + '</b></td>') +
        '<td class="num"><b>' + amt(f.totals.total) + '</b></td>' +
      '</tr></tfoot></table>' +

      '<div class="inv-bottom">' +
        '<div>' +
          '<table class="invoice-items inv-hsn"><thead><tr>' +
            '<th>HSN/SAC</th><th class="num">Taxable Value</th>' + taxHeads + '<th class="num">Total Tax</th>' +
          '</tr></thead><tbody>' +
          f.hsn.map(function (h) {
            return '<tr><td>' + esc(h.hsn) + '</td><td class="num">' + amt(h.taxable) + '</td>' +
              taxCells(h, h.rate) + '<td class="num">' + amt(h.cgst + h.sgst + h.igst) + '</td></tr>';
          }).join('') +
          '</tbody></table>' +
          '<p class="inv-words"><span>Amount in words</span>' + esc(PR.rupeesInWords(f.grand)) + '</p>' +
        '</div>' +
        '<div class="invoice-totals"><table>' +
          '<tr><td>Taxable Value</td><td>' + amt(f.totals.taxable) + '</td></tr>' +
          (f.intra
            ? '<tr><td>CGST</td><td>' + amt(f.totals.cgst) + '</td></tr><tr><td>SGST</td><td>' + amt(f.totals.sgst) + '</td></tr>'
            : '<tr><td>IGST</td><td>' + amt(f.totals.igst) + '</td></tr>') +
          (f.roundOff ? '<tr><td>Round Off</td><td>' + (f.roundOff > 0 ? '+' : '') + amt(f.roundOff) + '</td></tr>' : '') +
          '<tr class="grand"><td>Grand Total</td><td>' + PR.money2(f.grand) + '</td></tr>' +
          (order.coupon_code
            ? '<tr><td colspan="2" class="inv-small">Coupon ' + esc(order.coupon_code) + ' applied: ' +
              PR.money2(order.coupon_discount) + ' (included in Discount)</td></tr>'
            : '') +
        '</table></div>' +
      '</div>' +

      '<div class="inv-foot">' +
        '<div>' +
          (opts.bank && company.bank_name
            ? '<h3>Bank Details</h3><p>' + esc(company.bank_name) + '<br>' +
              (company.bank_account_name ? 'A/c Name: ' + esc(company.bank_account_name) + '<br>' : '') +
              (company.bank_account_number ? 'A/c No: <b>' + esc(company.bank_account_number) + '</b><br>' : '') +
              (company.bank_ifsc ? 'IFSC: <b>' + esc(company.bank_ifsc) + '</b><br>' : '') +
              (company.bank_branch ? 'Branch: ' + esc(company.bank_branch) : '') + '</p>'
            : '') +
          (opts.paymentTerms ? '<h3>Payment Terms</h3><p>' + esc(opts.paymentTerms) + '</p>' : '') +
          (opts.notes ? '<h3>Notes</h3><p style="white-space:pre-line">' + esc(opts.notes) + '</p>' : '') +
          '<h3>Terms</h3><p>' +
            (tax
              ? 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.<br>'
              : 'This is a proforma invoice for payment / approval only. The GST tax invoice is issued when the goods are dispatched.<br>') +
            'Warranty as per the product warranty card. Register at ' + esc(cfg.SITE_URL.replace('https://', '')) + '/warranty/' +
            (company.city ? '<br>Subject to ' + esc(company.city) + ' jurisdiction.' : '') +
          '</p>' +
        '</div>' +
        '<div class="inv-sign">' +
          '<p>For <b>' + esc(company.legal_name || cfg.COMPANY) + '</b></p>' +
          '<p class="inv-sign-line">' + (company.signatory_name ? esc(company.signatory_name) + '<br>' : '') +
            'Authorised Signatory</p>' +
        '</div>' +
      '</div>' +
      '<p class="invoice-note" style="text-align:center;color:#999">This is a computer-generated ' +
        (tax ? 'tax invoice' : 'proforma invoice') + '.</p>' +
    '</div>';
  };
})();
