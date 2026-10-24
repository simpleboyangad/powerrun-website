/* Admin - GST credit notes.
 *
 *   /admin/credit-notes/                         list by month + CSV for the GST return
 *   /admin/credit-notes/?type=order&id=<uuid>    new credit note against an order's tax invoice
 *   /admin/credit-notes/?type=pi&id=<uuid>       ... against a manual PI's tax invoice
 */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var r2 = function (n) { return Math.round((Number(n) || 0) * 100) / 100; };
  var host = null;
  var company = {};

  async function loadCompany() {
    var settings = await PR.getSettings();
    company = Object.assign({}, settings.company || {}, settings.company_private || {});
  }

  /* ------------------------------------------------------------------ list */
  var ym = function (y, m) { return y + '-' + (m < 10 ? '0' : '') + m; };
  var month = ym(new Date().getFullYear(), new Date().getMonth() + 1);
  var notes = [];

  async function loadList() {
    var from = month + '-01';
    var y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
    var to = (m === 12 ? ym(y + 1, 1) : ym(y, m + 1)) + '-01';
    notes = await PR.call('load credit notes', function (sb) {
      return sb.from('credit_notes').select('*').gte('cn_date', from).lt('cn_date', to).order('cn_number');
    }) || [];
  }

  function renderList() {
    var total = notes.reduce(function (s, n) { return s + Number(n.total_amount); }, 0);
    host.innerHTML =
      '<div class="panel">' +
        '<div class="panel-head"><h2>Credit Notes</h2><span class="hint">' + notes.length + ' · ' + PR.money2(total) + '</span></div>' +
        '<div class="toolbar">' +
          '<label style="display:flex;gap:6px;align-items:center">Month <input type="month" id="cnMonth" value="' + month + '"></label>' +
          '<button class="btn gray small" type="button" id="cnCsv"' + (notes.length ? '' : ' disabled') + '>CSV for GST return</button>' +
        '</div>' +
        '<p class="hint">Naya credit note: Orders ya Proforma (PI) page par us order / PI ko kholein jiska Tax Invoice ban chuka hai, ' +
          'aur <b>Credit Note</b> dabayein. Credit note ek baar banne ke baad badla ya delete nahi ho sakta.</p>' +
        (notes.length
          ? '<div class="table-scroll"><table class="grid"><thead><tr><th>Credit Note</th><th>Date</th><th>Invoice</th>' +
              '<th>Customer</th><th>Reason</th><th>Amount</th><th></th></tr></thead><tbody>' +
              notes.map(function (n) {
                return '<tr><td class="nowrap"><b>' + PR.esc(n.cn_number) + '</b></td>' +
                  '<td class="nowrap">' + PR.formatDate(n.cn_date) + '</td>' +
                  '<td class="nowrap">' + PR.esc(n.invoice_number) + '</td>' +
                  '<td>' + PR.esc(n.business_name || n.customer_name) + (n.gstin ? '<small>' + PR.esc(n.gstin) + '</small>' : '') + '</td>' +
                  '<td>' + PR.esc(PR.CN_REASONS[n.reason] || n.reason) + '</td>' +
                  '<td class="nowrap"><b>' + PR.money2(n.total_amount) + '</b></td>' +
                  '<td><a class="btn ghost small" target="_blank" rel="noopener" href="/admin/credit-notes/print/?id=' +
                    encodeURIComponent(n.id) + '">Print</a></td></tr>';
              }).join('') + '</tbody></table></div>'
          : PRA.empty('Is mahine koi credit note nahi', '')) +
      '</div>';
    document.getElementById('cnMonth').addEventListener('change', async function (e) {
      month = e.target.value || month;
      await loadList();
      renderList();
    });
    var csv = document.getElementById('cnCsv');
    if (csv) csv.addEventListener('click', downloadCsv);
  }

  /* one row per note and GST rate, the way GSTR-1 (CDNR / CDNUR) asks for it */
  function downloadCsv() {
    var rows = [['Note Number', 'Note Date', 'Note Type', 'Original Invoice', 'Original Invoice Date', 'Recipient GSTIN',
                 'Recipient Name', 'Place of Supply', 'Reason', 'Note Value', 'Rate', 'Taxable Value', 'IGST', 'CGST', 'SGST']];
    notes.forEach(function (n) {
      var byRate = {};
      (n.lines || []).forEach(function (l) {
        var b = byRate[l.rate] || (byRate[l.rate] = { taxable: 0, igst: 0, cgst: 0, sgst: 0 });
        b.taxable += l.taxable; b.igst += l.igst; b.cgst += l.cgst; b.sgst += l.sgst;
      });
      Object.keys(byRate).forEach(function (rate) {
        var b = byRate[rate];
        var code = PR.GST_STATE_CODES[n.place_of_supply] || '';
        rows.push([n.cn_number, n.cn_date, 'C', n.invoice_number, n.invoice_date || '', n.gstin || '',
                   n.business_name || n.customer_name, (code ? code + '-' : '') + (n.place_of_supply || ''),
                   PR.CN_REASONS[n.reason] || n.reason, n.total_amount, rate,
                   r2(b.taxable), r2(b.igst), r2(b.cgst), r2(b.sgst)]);
      });
    });
    var text = rows.map(function (r) {
      return r.map(function (v) { var s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',');
    }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' }));
    a.download = 'credit-notes-' + month + '.csv';
    a.click();
  }

  /* --------------------------------------------------------------- builder */
  var src = null;          // { type, id, doc (order-shaped), invoice_number, invoice_date, cancelled, isOrder }
  var fig = null;          // PR.invoiceFigures of the original invoice
  var prevQty = {};        // key -> qty already credited
  var credited = 0;        // amount already credited on this invoice

  async function loadSource(type, id) {
    var doc, row;
    if (type === 'order') {
      var rows = await PR.call('load order', function (sb) {
        return sb.from('orders').select('*, order_items(id,product_id,product_name,product_sku,hsn_code,quantity,unit_price,mrp,gst_rate,taxable_amount,gst_amount,total_price)')
          .eq('id', id).limit(1);
      });
      row = rows && rows[0];
      if (!row) throw new Error('Order not found');
      doc = row;
    } else {
      var pis = await PR.call('load PI', function (sb) { return sb.from('proforma_invoices').select('*').eq('id', id).limit(1); });
      row = pis && pis[0];
      if (!row) throw new Error('PI not found');
      doc = PR.proformaOrder(row);
    }
    if (!row.invoice_number) throw new Error('Is ' + (type === 'order' ? 'order' : 'PI') + ' ka Tax Invoice nahi bana - credit note ki zarurat nahi.');
    src = { type: type, id: id, doc: doc, invoice_number: row.invoice_number, invoice_date: row.invoice_date,
            cancelled: (row.order_status || row.status) === 'cancelled', isOrder: type === 'order',
            label: type === 'order' ? 'Order ' + row.order_number : 'PI ' + row.pi_number };
    fig = PR.invoiceFigures(doc, company);
    var prev = await PR.call('load earlier credit notes', function (sb) {
      return sb.from('credit_notes').select('cn_number,total_amount,lines').eq('invoice_number', row.invoice_number);
    }) || [];
    prevQty = {}; credited = 0;
    prev.forEach(function (n) {
      credited += Number(n.total_amount);
      (n.lines || []).forEach(function (l) { prevQty[l.key] = (prevQty[l.key] || 0) + Number(l.qty || 0); });
    });
    src.prev = prev;
  }

  function mode() { var el = document.querySelector('input[name="cnMode"]:checked'); return el ? el.value : 'qty'; }

  function chosenLines() {
    var m = mode();
    if (m === 'full') return fig.lines.map(function (l) { return PR.creditLine(l, { qty: l.qty }, fig.intra); });
    var out = [];
    fig.lines.forEach(function (l, i) {
      var el = document.getElementById('cnIn' + i);
      var v = el ? Number(el.value) : 0;
      if (!(v > 0)) return;
      out.push(PR.creditLine(l, m === 'amount' ? { amount: v } : { qty: v }, fig.intra));
    });
    return out;
  }

  function previewObj() {
    var d = src.doc;
    return {
      cn_number: null, cn_date: null, invoice_number: src.invoice_number, invoice_date: src.invoice_date,
      reason: document.getElementById('cnReason').value, note: document.getElementById('cnNote').value.trim(),
      customer_name: d.customer_name, business_name: d.customer_business_name, gstin: d.customer_gstin,
      mobile: d.customer_mobile, address: d.address, city: d.city, state: d.state, pincode: d.pincode,
      place_of_supply: fig.placeOfSupply, intra_state: fig.intra, lines: chosenLines(),
      round_off: mode() === 'full' ? fig.roundOff : 0
    };
  }

  function lineInputs(m) {
    m = m || mode();
    return fig.lines.map(function (l, i) {
      var left = l.qty - (prevQty[l.key] || 0);
      var input = m === 'full' ? '<b>' + l.qty + '</b>'
        : m === 'amount'
          ? '<input id="cnIn' + i + '" type="number" min="0" step="0.01" inputmode="decimal" placeholder="₹ incl. GST" style="width:120px">'
          : (left > 0
              ? '<input id="cnIn' + i + '" type="number" min="0" max="' + left + '" step="1" inputmode="numeric" placeholder="0" style="width:80px">'
              : '<span class="hint">poora ho chuka</span>');
      return '<tr><td><b>' + PR.esc(l.name) + '</b></td><td>' + l.qty + '</td><td>' + (prevQty[l.key] || 0) + '</td>' +
        '<td class="nowrap">' + PR.money2(l.total) + '</td><td>' + input + '</td></tr>';
    }).join('');
  }

  function refreshPreview() {
    var p = previewObj();
    var t = PR.creditTotals(p.lines, p.round_off);
    var over = t.grand > r2(fig.grand - credited) + 0.01;
    document.getElementById('cnTotal').innerHTML = 'Credit: <b>' + PR.money2(t.grand) + '</b>' +
      (over ? ' <span style="color:#8c1d18">- baaki sirf ' + PR.money2(fig.grand - credited) + ' hai</span>' : '');
    document.getElementById('cnIssue').disabled = !p.lines.length || t.grand <= 0 || over;
    document.getElementById('cnPreview').innerHTML = p.lines.length ? PR.creditNoteHtml(p, company, { preview: true }) : '';
  }

  function renderBuilder() {
    var nothingYet = credited === 0;
    var canRestock = !(src.isOrder && src.cancelled);
    host.innerHTML =
      '<div class="panel" style="max-width:900px">' +
        '<div class="panel-head"><h2>Credit Note - ' + PR.esc(src.invoice_number) + '</h2>' +
          '<span class="hint">' + PR.esc(src.label) + '</span></div>' +
        '<p>' + PR.esc(src.doc.customer_business_name || src.doc.customer_name) + ' · Invoice ' + PR.money2(fig.grand) +
          (credited ? ' · pehle credit: <b>' + PR.money2(credited) + '</b> (' + src.prev.map(function (n) { return PR.esc(n.cn_number); }).join(', ') + ')' : '') +
          ' · baaki: <b>' + PR.money2(fig.grand - credited) + '</b></p>' +
        '<div class="form">' +
          '<div class="form-grid">' +
            '<label>Reason<select id="cnReason">' + Object.keys(PR.CN_REASONS).map(function (k) {
              var def = src.cancelled ? 'order_cancelled' : 'goods_returned';
              return '<option value="' + k + '"' + (k === def ? ' selected' : '') + '>' + PR.esc(PR.CN_REASONS[k]) + '</option>';
            }).join('') + '</select></label>' +
            '<div><b style="font-size:12px;color:#6d6d6d">KITNA CREDIT</b><div style="display:grid;gap:4px;margin-top:6px">' +
              '<label style="font-weight:400;display:flex;gap:8px;align-items:center;flex-direction:row"><input style="width:auto" type="radio" name="cnMode" value="full"' + (nothingYet ? ' checked' : ' disabled') + '> Poora invoice (cancel / sab wapas)</label>' +
              '<label style="font-weight:400;display:flex;gap:8px;align-items:center;flex-direction:row"><input style="width:auto" type="radio" name="cnMode" value="qty"' + (nothingYet ? '' : ' checked') + '> Kuch items wapas (quantity)</label>' +
              '<label style="font-weight:400;display:flex;gap:8px;align-items:center;flex-direction:row"><input style="width:auto" type="radio" name="cnMode" value="amount"> Sirf amount kam karna (discount / compensation)</label>' +
            '</div></div>' +
          '</div>' +
          '<div class="table-scroll"><table class="grid"><thead><tr><th>Item</th><th>Invoice qty</th><th>Pehle credit</th><th>Line amount</th><th>Credit</th></tr></thead>' +
            '<tbody id="cnLines">' + lineInputs(nothingYet ? 'full' : 'qty') + '</tbody></table></div>' +
          '<label style="font-weight:400;margin-top:8px;display:flex;gap:8px;align-items:center;flex-direction:row"><input style="width:auto" type="checkbox" id="cnRestock"' + (canRestock ? '' : ' disabled') + '> ' +
            'Maal wapas aaya - stock mein jodo' + (canRestock ? '' : ' <span class="hint">(cancel par stock pehle hi wapas aa chuka)</span>') + '</label>' +
          '<label>Note (credit note par chhapega)<textarea id="cnNote" maxlength="500" placeholder="e.g. Customer ne order cancel kiya, payment refund kiya"></textarea></label>' +
          '<div class="page-actions" style="align-items:center">' +
            '<span id="cnTotal" style="margin-right:auto"></span>' +
            '<a class="btn gray" href="/admin/credit-notes/">Cancel</a>' +
            '<button class="btn" type="button" id="cnIssue" disabled>ISSUE CREDIT NOTE</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div id="cnPreview" style="margin-top:16px"></div>';

    host.addEventListener('input', refreshPreview);
    host.addEventListener('change', function (e) {
      if (e.target.name === 'cnMode') document.getElementById('cnLines').innerHTML = lineInputs();
      if (e.target.name === 'cnMode' || e.target.id === 'cnReason') {
        var r = document.getElementById('cnRestock');
        if (r && mode() === 'amount') r.checked = false;
      }
      refreshPreview();
    });
    document.getElementById('cnIssue').addEventListener('click', issue);
    refreshPreview();
  }

  async function issue() {
    var btn = document.getElementById('cnIssue');
    var p = previewObj();
    var t = PR.creditTotals(p.lines, p.round_off);
    var restock = document.getElementById('cnRestock').checked && mode() !== 'amount';
    if (!confirm('Credit Note ' + PR.money2(t.grand) + ' issue karein (invoice ' + src.invoice_number + ')?\n\n' +
                 'Number pakka lag jayega aur ye credit note baad mein badla ya delete nahi ho sakta.' +
                 (restock ? '\nStock wapas joda jayega.' : ''))) return;
    PR.setBusy(btn, true, 'ISSUING…');
    try {
      var res = await PR.call('issue credit note', function (sb) {
        return sb.rpc('admin_issue_credit_note', {
          p_source_type: src.type, p_source_id: src.id, p_reason: p.reason, p_note: p.note || null,
          p_lines: p.lines, p_round_off: p.round_off, p_restock: restock
        });
      });
      PR.toast('Credit note ' + res.cn_number + ' issued.', 'success');
      window.location.href = '/admin/credit-notes/print/?id=' + encodeURIComponent(res.id);
    } catch (err) {
      PR.setBusy(btn, false);
      PR.toast(err.message, 'error');
    }
  }

  PRA.boot('credit-notes', 'Credit Notes', async function (h) {
    host = h;
    host.innerHTML = PRA.skeleton(5);
    await loadCompany();
    var type = PR.param('type');
    var id = PR.param('id');
    if ((type === 'order' || type === 'pi') && id) {
      await loadSource(type, id);
      renderBuilder();
    } else {
      await loadList();
      renderList();
    }
  });
})();
