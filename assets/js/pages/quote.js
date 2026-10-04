/* Customer quotation view: quote number + mobile */
(function () {
  'use strict';
  var PR = window.PR;

  function render(q) {
    var items = q.items || [];
    var showGst = Number(q.gst_amount) > 0;
    document.getElementById('quoteViewResult').innerHTML =
      '<div class="panel" style="margin-top:18px">' +
        '<h2>Quotation ' + PR.esc(q.quote_number) + '</h2>' +
        '<div class="summary-row"><span>Customer</span><b>' + PR.esc(q.customer_name) + '</b></div>' +
        '<div class="summary-row"><span>Date</span><b>' + PR.formatDate(q.created_at) + '</b></div>' +
        '<div class="summary-row"><span>Valid Until</span><b>' + PR.formatDate(q.valid_until) + '</b></div>' +
        '<div class="table-scroll"><table class="data-table"><thead><tr>' +
          '<th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>' +
          items.map(function (it) {
            return '<tr><td>' + PR.esc(it.product_name) + (it.sku ? '<br><small>' + PR.esc(it.sku) + '</small>' : '') +
              '</td><td>' + it.quantity + '</td><td>' + PR.money(it.unit_price) + '</td><td>' + PR.money(it.total_price) + '</td></tr>';
          }).join('') +
        '</tbody></table></div>' +
        '<div style="margin-top:14px;display:grid;gap:6px;max-width:360px;margin-left:auto">' +
          (Number(q.discount_amount) > 0
            ? '<div class="summary-row"><span>MRP</span><b>' + PR.money(q.mrp_total) + '</b></div>' +
              '<div class="summary-row" style="color:#14663a"><span>Discount</span><b>- ' + PR.money(q.discount_amount) + '</b></div>'
            : '') +
          (showGst
            ? '<div class="summary-row"><span>Taxable Value</span><b>' + PR.money(q.taxable_amount) + '</b></div>' +
              (Number(q.cgst_amount) > 0
                ? '<div class="summary-row"><span>CGST + SGST</span><b>' + PR.money(Number(q.cgst_amount) + Number(q.sgst_amount)) + '</b></div>'
                : '<div class="summary-row"><span>IGST</span><b>' + PR.money(q.igst_amount) + '</b></div>')
            : '') +
          '<div class="summary-row" style="font-size:17px"><span>Total</span><b>' + PR.money(q.total_amount) + '</b></div>' +
        '</div>' +
        (q.warranty_terms ? '<h2 style="margin:22px 0 8px;font-size:17px">Warranty</h2><p class="prose">' + PR.esc(q.warranty_terms) + '</p>' : '') +
        (q.terms ? '<h2 style="margin:22px 0 8px;font-size:17px">Terms &amp; Conditions</h2><p class="prose" style="white-space:pre-line">' + PR.esc(q.terms) + '</p>' : '') +
        '<div class="detail-actions no-print" style="margin-top:18px">' +
          '<a class="btn orange" href="' + PR.esc(PR.whatsapp('Quote No: ' + q.quote_number + ' ke baare me baat karni hai.')) + '" target="_blank" rel="noopener">WHATSAPP PAR BAAT KAREIN</a>' +
          '<button class="outline" type="button" id="quotePdfBtn">PDF DOWNLOAD</button>' +
        '</div>' +
      '</div>';
    document.getElementById('quotePdfBtn').addEventListener('click', function () { downloadPdf(q); });
  }

  function money(n) {
    return 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function downloadPdf(q) {
    if (!window.jspdf) { PR.toast('PDF tool load nahi hua, page refresh karke dobara try karein.', 'error'); return; }
    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    var y = 15;
    function line(text, size, gap) {
      doc.setFontSize(size || 10);
      var parts = doc.splitTextToSize(String(text), 180);
      parts.forEach(function (p) {
        if (y > 280) { doc.addPage(); y = 15; }
        doc.text(p, 15, y);
        y += (size || 10) * 0.45 + 1;
      });
      y += gap || 0;
    }
    line('PowerRun Industries', 16, 1);
    line('Plot-23, Gadi Road, Dholna, Nagla Bhood, Kasganj, Uttar Pradesh 207124', 9);
    line('GSTIN: 09GTVPS7660P1ZZ | +91 87003 07676 | service@powerrun.in | powerrun.in', 9, 6);
    line('QUOTATION ' + q.quote_number, 13, 2);
    line('Customer: ' + q.customer_name, 10);
    line('Date: ' + PR.formatDate(q.created_at) + '    Valid until: ' + PR.formatDate(q.valid_until), 10, 5);

    doc.setFontSize(9);
    doc.text('Product', 15, y); doc.text('Qty', 120, y); doc.text('Price', 140, y); doc.text('Total', 175, y);
    y += 2; doc.line(15, y, 195, y); y += 4;
    (q.items || []).forEach(function (it) {
      if (y > 275) { doc.addPage(); y = 15; }
      doc.setFontSize(9);
      doc.text(String(it.product_name).slice(0, 60), 15, y);
      if (it.sku) { doc.setFontSize(7); doc.text(String(it.sku), 15, y + 3.5); doc.setFontSize(9); }
      doc.text(String(it.quantity), 120, y);
      doc.text(money(it.unit_price), 140, y);
      doc.text(money(it.total_price), 175, y);
      y += it.sku ? 9 : 6;
    });
    y += 2; doc.line(15, y, 195, y); y += 6;

    function row(label, value, bold) {
      if (y > 275) { doc.addPage(); y = 15; }
      doc.setFontSize(10);
      doc.setFont(undefined, bold ? 'bold' : 'normal');
      doc.text(label, 120, y);
      doc.text(value, 195, y, { align: 'right' });
      doc.setFont(undefined, 'normal');
      y += 6;
    }
    if (Number(q.discount_amount) > 0) { row('MRP', money(q.mrp_total)); row('Discount', '- ' + money(q.discount_amount)); }
    row('Taxable value', money(q.taxable_amount));
    if (Number(q.cgst_amount) > 0) { row('CGST', money(q.cgst_amount)); row('SGST', money(q.sgst_amount)); }
    else if (Number(q.igst_amount) > 0) { row('IGST', money(q.igst_amount)); }
    row('Grand total', money(q.total_amount), true);
    y += 4;

    if (q.warranty_terms) { line('Warranty: ' + q.warranty_terms, 9, 3); }
    if (q.terms) { line('Terms & Conditions:', 10, 1); line(q.terms, 9, 3); }
    line('This is a computer-generated quotation.', 8);

    doc.save(q.quote_number.replace(/\//g, '-') + '.pdf');
  }

  async function submit(event) {
    event.preventDefault();
    var button = document.getElementById('quoteViewBtn');
    var no = document.getElementById('qv_no').value.trim();
    var mobile = document.getElementById('qv_mobile').value.replace(/\D/g, '');
    if (!no) { PR.toast('Quote number daalein.', 'error'); return; }
    if (!/^[6-9]\d{9}$/.test(mobile)) { PR.toast('Sahi 10-digit mobile number daalein.', 'error'); return; }

    PR.setBusy(button, true, 'SEARCHING…');
    document.getElementById('quoteViewResult').innerHTML = '';
    try {
      var q = await PR.call('load quote', function (sb) {
        return sb.rpc('get_product_quote_public', { p_quote_number: no, p_mobile: mobile });
      });
      PR.setBusy(button, false);
      render(q);
    } catch (err) {
      PR.setBusy(button, false);
      PR.toast(err.message, 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    PR.mountLayout('home');
    var preset = PR.param('no');
    if (preset) document.getElementById('qv_no').value = preset;
    var presetMobile = PR.param('mobile');
    if (presetMobile) document.getElementById('qv_mobile').value = presetMobile;
    document.getElementById('quoteViewForm').addEventListener('submit', submit);
    if (preset && presetMobile) document.getElementById('quoteViewForm').requestSubmit();
  });
})();
