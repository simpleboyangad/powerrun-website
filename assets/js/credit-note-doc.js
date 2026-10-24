/* PowerRun Industries - GST credit note: line maths and the printable document.
 *
 * The lines start from PR.invoiceFigures() of the original tax invoice, so a
 * credit note always uses the same taxable values and tax split as the invoice
 * it reduces. Three ways to credit a line:
 *   full     - the whole line (and the invoice's round-off when every line is credited)
 *   qty      - some units came back / were cancelled: the line's values pro rata
 *   amount   - a price reduction: an amount including GST, split at the line's rate
 * admin_issue_credit_note() re-checks every line in the database.
 */
(function () {
  'use strict';
  var PR = window.PR;

  var r2 = function (n) { return Math.round((Number(n) || 0) * 100) / 100; };
  var num = function (v) { var n = Number(v); return Number.isFinite(n) ? n : 0; };
  var amt = function (n) {
    return num(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  PR.CN_REASONS = {
    order_cancelled: 'Order cancelled',
    goods_returned: 'Goods returned',
    price_reduction: 'Price reduction / discount',
    deficiency: 'Deficiency in goods or service',
    other: 'Other'
  };

  function split(taxable, tax, intra) {
    var cgst = intra ? r2(tax / 2) : 0;
    return { cgst: cgst, sgst: intra ? r2(tax - cgst) : 0, igst: intra ? 0 : r2(tax) };
  }

  /* One credit-note line from an invoice line (PR.invoiceFigures().lines[i]).
     how: { qty: n } or { amount: rupees incl. GST }. */
  PR.creditLine = function (line, how, intra) {
    var taxable, tax, qty;
    if (how.amount != null) {
      var a = r2(how.amount);
      taxable = r2(a / (1 + line.rate / 100));
      tax = r2(a - taxable);
      qty = 0;
    } else {
      qty = Math.max(0, num(how.qty));
      var ratio = qty / (line.qty || 1);
      taxable = qty === line.qty ? line.taxable : r2(line.taxable * ratio);
      tax = qty === line.qty ? r2(line.cgst + line.sgst + line.igst) : r2((line.cgst + line.sgst + line.igst) * ratio);
    }
    var s = split(taxable, tax, intra);
    return {
      key: line.key, name: line.name, hsn: line.hsn || '', qty: qty, rate: line.rate,
      taxable: taxable, cgst: s.cgst, sgst: s.sgst, igst: s.igst, total: r2(taxable + tax),
      product_id: line.productId || null
    };
  };

  PR.creditTotals = function (lines, roundOff) {
    var t = { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
    lines.forEach(function (l) {
      t.taxable += l.taxable; t.cgst += l.cgst; t.sgst += l.sgst; t.igst += l.igst; t.total += l.total;
    });
    Object.keys(t).forEach(function (k) { t[k] = r2(t[k]); });
    t.roundOff = r2(roundOff || 0);
    t.grand = r2(t.total + t.roundOff);
    return t;
  };

  function stateWithCode(state) {
    var code = PR.GST_STATE_CODES[state];
    return state ? state + (code ? ' (' + code + ')' : '') : '-';
  }

  /* cn: a credit_notes row (or the same shape for a preview, with preview: true) */
  PR.creditNoteHtml = function (cn, company, opts) {
    opts = opts || {};
    company = company || {};
    var cfg = PR.config;
    var esc = PR.esc;
    var intra = cn.intra_state;
    var lines = cn.lines || [];
    var t = PR.creditTotals(lines, cn.round_off);
    var companyAddress = [company.address_line1, company.address_line2, company.city,
                          company.state, company.pincode].filter(Boolean).join(', ');
    var billAddress = [cn.address, cn.city, cn.state, cn.pincode].filter(Boolean).join(', ');
    var taxHeads = intra ? '<th class="num">CGST</th><th class="num">SGST</th>' : '<th class="num">IGST</th>';
    var taxCells = function (row) {
      return intra
        ? '<td class="num">' + amt(row.cgst) + '<small>' + (row.rate / 2) + '%</small></td>' +
          '<td class="num">' + amt(row.sgst) + '<small>' + (row.rate / 2) + '%</small></td>'
        : '<td class="num">' + amt(row.igst) + '<small>' + row.rate + '%</small></td>';
    };

    return '<div class="invoice-sheet gst-invoice">' +
      (opts.preview
        ? '<div class="inv-preview no-print-hide">PREVIEW - ye abhi Credit Note nahi hai. Number "Issue" dabane par lagega.</div>'
        : '') +
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
          '<h1>Credit Note</h1>' +
          '<div class="copy-label">' + esc(opts.copy || 'Original for Recipient') + '</div>' +
          '<table class="inv-meta">' +
            '<tr><td>Credit Note No.</td><td><b>' + esc(cn.cn_number || 'PREVIEW') + '</b></td></tr>' +
            '<tr><td>Date</td><td><b>' + PR.formatDate(cn.cn_date || new Date()) + '</b></td></tr>' +
            '<tr><td>Against Invoice</td><td><b>' + esc(cn.invoice_number) + '</b>' +
              (cn.invoice_date ? ' · ' + PR.formatDate(cn.invoice_date) : '') + '</td></tr>' +
            '<tr><td>Reason</td><td>' + esc(PR.CN_REASONS[cn.reason] || cn.reason) + '</td></tr>' +
            '<tr><td>Place of Supply</td><td>' + esc(stateWithCode(cn.place_of_supply)) + '</td></tr>' +
            '<tr><td>Reverse Charge</td><td>No</td></tr>' +
          '</table>' +
        '</div>' +
      '</div>' +

      '<div class="invoice-parties">' +
        '<div><h3>Issued to</h3><p>' +
          '<b>' + esc(cn.business_name || cn.customer_name) + '</b><br>' +
          (cn.business_name ? 'Attn: ' + esc(cn.customer_name) + '<br>' : '') +
          esc(billAddress) + '<br>' +
          'State: ' + esc(stateWithCode(cn.state)) + '<br>' +
          'GSTIN: <b>' + (cn.gstin ? esc(cn.gstin) : 'Unregistered') + '</b><br>' +
          '☎ ' + esc(cn.mobile || '-') +
        '</p></div>' +
        (cn.note ? '<div><h3>Details</h3><p style="white-space:pre-line">' + esc(cn.note) + '</p></div>' : '<div></div>') +
      '</div>' +

      '<table class="invoice-items inv-lines"><thead><tr>' +
        '<th>#</th><th>Description</th><th>HSN/SAC</th><th class="num">Qty</th>' +
        '<th class="num">Taxable Value</th>' + taxHeads + '<th class="num">Amount</th>' +
      '</tr></thead><tbody>' +
      lines.map(function (l, i) {
        return '<tr><td>' + (i + 1) + '</td>' +
          '<td><b>' + esc(l.name) + '</b>' + (l.qty ? '' : '<small>Value adjustment</small>') + '</td>' +
          '<td>' + esc(l.hsn || '-') + '</td>' +
          '<td class="num">' + (l.qty ? l.qty + (l.key === 'freight' ? '' : ' Nos') : '-') + '</td>' +
          '<td class="num">' + amt(l.taxable) + '</td>' + taxCells(l) +
          '<td class="num"><b>' + amt(l.total) + '</b></td></tr>';
      }).join('') +
      '</tbody><tfoot><tr><td></td><td colspan="3"><b>Total</b></td>' +
        '<td class="num"><b>' + amt(t.taxable) + '</b></td>' +
        (intra ? '<td class="num"><b>' + amt(t.cgst) + '</b></td><td class="num"><b>' + amt(t.sgst) + '</b></td>'
               : '<td class="num"><b>' + amt(t.igst) + '</b></td>') +
        '<td class="num"><b>' + amt(t.total) + '</b></td></tr></tfoot></table>' +

      '<div class="inv-bottom">' +
        '<div><p class="inv-words"><span>Amount in words</span>' + esc(PR.rupeesInWords(t.grand)) + '</p></div>' +
        '<div class="invoice-totals"><table>' +
          '<tr><td>Taxable Value</td><td>' + amt(t.taxable) + '</td></tr>' +
          (intra ? '<tr><td>CGST</td><td>' + amt(t.cgst) + '</td></tr><tr><td>SGST</td><td>' + amt(t.sgst) + '</td></tr>'
                 : '<tr><td>IGST</td><td>' + amt(t.igst) + '</td></tr>') +
          (t.roundOff ? '<tr><td>Round Off</td><td>' + (t.roundOff > 0 ? '+' : '') + amt(t.roundOff) + '</td></tr>' : '') +
          '<tr class="grand"><td>Total Credit</td><td>' + PR.money2(t.grand) + '</td></tr>' +
        '</table></div>' +
      '</div>' +

      '<div class="inv-foot">' +
        '<div><h3>Declaration</h3><p>This credit note reduces the value of the tax invoice shown above. ' +
          'The recipient should reduce the input tax credit claimed on that invoice accordingly.' +
          (company.city ? '<br>Subject to ' + esc(company.city) + ' jurisdiction.' : '') + '</p></div>' +
        '<div class="inv-sign">' +
          '<p>For <b>' + esc(company.legal_name || cfg.COMPANY) + '</b></p>' +
          '<p class="inv-sign-line">' + (company.signatory_name ? esc(company.signatory_name) + '<br>' : '') +
            'Authorised Signatory</p>' +
        '</div>' +
      '</div>' +
      '<p class="invoice-note" style="text-align:center;color:#999">This is a computer-generated credit note.</p>' +
    '</div>';
  };
})();
