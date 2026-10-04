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
        '<div class="detail-actions" style="margin-top:18px">' +
          '<a class="btn orange" href="' + PR.esc(PR.whatsapp('Quote No: ' + q.quote_number + ' ke baare me baat karni hai.')) + '" target="_blank" rel="noopener">WHATSAPP PAR BAAT KAREIN</a>' +
          '<button class="outline" type="button" onclick="window.print()">PRINT / PDF</button>' +
        '</div>' +
      '</div>';
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
