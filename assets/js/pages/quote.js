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
        '<div class="summary-row"><span>Billing Address</span><b style="text-align:right">' +
          PR.esc([q.address, q.city, q.state, q.pincode].filter(Boolean).join(', ')) + '</b></div>' +
        '<div class="summary-row"><span>Shipping Address</span><b style="text-align:right">' +
          PR.esc([q.shipping_address || q.address, q.shipping_city || q.city, q.shipping_state || q.state,
                  q.shipping_pincode || q.pincode].filter(Boolean).join(', ')) + '</b></div>' +
        (q.gstin ? '<div class="summary-row"><span>GSTIN</span><b>' + PR.esc(q.gstin) + '</b></div>' : '') +
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

  var ORANGE = [255, 90, 0], DARK = [20, 20, 20], GREY = [110, 110, 110], LIGHT = [247, 247, 249], WHITE = [255, 255, 255];

  function downloadPdf(q) {
    if (!window.jspdf) { PR.toast('PDF tool load nahi hua, page refresh karke dobara try karein.', 'error'); return; }
    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    var L = 15, R = 195, y = 0;

    function color(c) { doc.setTextColor(c[0], c[1], c[2]); }
    function fill(c) { doc.setFillColor(c[0], c[1], c[2]); }
    function text(t, x, yy, size, c, style, align) {
      doc.setFont('helvetica', style || 'normal');
      doc.setFontSize(size || 10);
      color(c || DARK);
      doc.text(String(t), x, yy, align ? { align: align } : undefined);
    }
    function ensure(space) {
      if (y + space > 262) { doc.addPage(); y = 20; }
    }

    fill(ORANGE); doc.rect(0, 0, 210, 36, 'F');
    text('PowerRun Industries', L, 15, 18, WHITE, 'bold');
    text('Plot-23, Gadi Road, Dholna, Nagla Bhood, Kasganj, Uttar Pradesh 207124', L, 22, 8, WHITE);
    text('GSTIN 09GTVPS7660P1ZZ  |  +91 86075 65520  |  service@powerrun.in  |  powerrun.in', L, 28, 8, WHITE);
    text('QUOTATION', R, 15, 14, WHITE, 'bold', 'right');
    text(q.quote_number, R, 22, 10, WHITE, 'bold', 'right');
    text('Date: ' + PR.formatDate(q.created_at), R, 28, 8, WHITE, 'normal', 'right');

    y = 44;
    text('Valid until: ' + PR.formatDate(q.valid_until), L, y, 8, ORANGE, 'bold');
    text('Ye quotation 7 din ke liye valid hai.', R, y, 8, GREY, 'normal', 'right');
    y += 4;

    function addressBox(x, title, lines) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
      var wrapped = [];
      lines.filter(Boolean).forEach(function (ln) { wrapped = wrapped.concat(doc.splitTextToSize(String(ln), 80)); });
      return { x: x, title: title, lines: wrapped };
    }
    var bill = addressBox(L, 'BILL TO', [
      q.address, [q.city, q.state, q.pincode].filter(Boolean).join(', '),
      'Mobile: ' + (q.customer_mobile || ''), q.customer_email ? 'Email: ' + q.customer_email : '',
      q.gstin ? 'GSTIN: ' + q.gstin : ''
    ]);
    var ship = addressBox(105, 'SHIP TO', [
      q.shipping_address || q.address,
      [q.shipping_city || q.city, q.shipping_state || q.state, q.shipping_pincode || q.pincode].filter(Boolean).join(', ')
    ]);
    var boxH = 16 + Math.max(bill.lines.length, ship.lines.length) * 4.2;
    [bill, ship].forEach(function (b) {
      fill(LIGHT); doc.rect(b.x, y, b === bill ? 85 : 90, boxH, 'F');
      text(b.title, b.x + 4, y + 6, 8, ORANGE, 'bold');
      text(q.customer_name, b.x + 4, y + 11.5, 10, DARK, 'bold');
      var ly = y + 16;
      b.lines.forEach(function (ln) { text(ln, b.x + 4, ly, 8.5, DARK); ly += 4.2; });
    });
    y += boxH + 8;

    fill(DARK); doc.rect(L, y, 180, 8, 'F');
    text('PRODUCT', L + 3, y + 5.5, 8, WHITE, 'bold');
    text('QTY', 128, y + 5.5, 8, WHITE, 'bold', 'right');
    text('PRICE', 160, y + 5.5, 8, WHITE, 'bold', 'right');
    text('TOTAL', R - 2, y + 5.5, 8, WHITE, 'bold', 'right');
    y += 8;

    (q.items || []).forEach(function (it, i) {
      ensure(14);
      if (i % 2 === 0) { fill(LIGHT); doc.rect(L, y, 180, 12, 'F'); }
      var name = doc.splitTextToSize(String(it.product_name), 100)[0];
      text(name, L + 3, y + 5.5, 9, DARK, 'bold');
      if (it.sku) text('SKU: ' + it.sku + '   GST ' + Number(it.gst_rate || 0) + '%', L + 3, y + 9.5, 7, GREY);
      text(it.quantity, 128, y + 7, 9, DARK, 'normal', 'right');
      text(money(it.unit_price), 160, y + 7, 9, DARK, 'normal', 'right');
      text(money(it.total_price), R - 2, y + 7, 9, DARK, 'bold', 'right');
      y += 12;
    });
    doc.setDrawColor(220, 220, 220); doc.line(L, y, R, y);
    y += 8;

    var rows = [];
    if (Number(q.discount_amount) > 0) { rows.push(['MRP', money(q.mrp_total)]); rows.push(['Discount', '- ' + money(q.discount_amount)]); }
    rows.push(['Taxable value', money(q.taxable_amount)]);
    if (Number(q.cgst_amount) > 0) { rows.push(['CGST', money(q.cgst_amount)]); rows.push(['SGST', money(q.sgst_amount)]); }
    else if (Number(q.igst_amount) > 0) { rows.push(['IGST', money(q.igst_amount)]); }
    rows.push(['Shipping', Number(q.shipping_cost) > 0 ? money(q.shipping_cost) : 'Free']);
    var boxH = rows.length * 6.5 + 12;
    ensure(boxH + 10);
    fill(LIGHT); doc.rect(118, y, 77, boxH, 'F');
    var ry = y + 7;
    rows.forEach(function (r) {
      text(r[0], 122, ry, 9, GREY);
      text(r[1], R - 4, ry, 9, DARK, 'normal', 'right');
      ry += 6.5;
    });
    fill(ORANGE); doc.rect(118, y + boxH - 0.5, 77, 11, 'F');
    text('GRAND TOTAL', 122, y + boxH + 6.5, 10, WHITE, 'bold');
    text(money(q.total_amount), R - 4, y + boxH + 6.5, 10, WHITE, 'bold', 'right');
    y += boxH + 16;

    function block(title, body) {
      if (!body) return;
      var lines = doc.splitTextToSize(String(body), 180);
      ensure(10 + lines.length * 4.5);
      text(title, L, y, 10, ORANGE, 'bold');
      y += 5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); color(DARK);
      lines.forEach(function (ln) { doc.text(ln, L, y); y += 4.5; });
      y += 5;
    }
    block('TERMS & CONDITIONS', q.terms);

    var pages = doc.getNumberOfPages();
    for (var i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor(255, 90, 0); doc.setLineWidth(0.6); doc.line(L, 282, R, 282);
      text('PowerRun Industries  |  service@powerrun.in  |  +91 86075 65520  |  powerrun.in', L, 288, 7, GREY);
      text('Page ' + i + ' of ' + pages, R, 288, 7, GREY, 'normal', 'right');
    }
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
