/* Admin - COD Hisaab: has the cash the courier collected reached the bank?
 *
 * Every shipment with a COD balance (orders.cod_to_collect > 0, set by Ship karo /
 * Shiprocket se AWB lao). Shiprocket pays COD in batches a few days after delivery;
 * mark an order received by hand, or upload Shiprocket's remittance report (CSV) and
 * the rows are matched on the AWB (sql/52: cod_remitted_at / _amount / cod_remit_ref). */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var host = null;
  var rows = [];
  var view = 'due';
  var preview = null;   // matched CSV rows waiting for "Save"

  var VIEWS = [
    { key: 'due', label: 'Delivered - paisa baaki' },
    { key: 'transit', label: 'Raste mein' },
    { key: 'done', label: 'Bank mein aa gaya' },
    { key: 'rto', label: 'RTO' },
    { key: 'all', label: 'Sab' }
  ];

  var r2 = function (v) { return Math.round((Number(v) || 0) * 100) / 100; };
  function bucket(o) {
    if (o.cod_remitted_at) return 'done';
    if (o.rto) return 'rto';
    if (o.order_status === 'delivered') return 'due';
    return 'transit';
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  async function load() {
    rows = await PR.call('load COD shipments', function (sb) {
      return sb.from('orders')
        .select('id,order_number,customer_name,customer_mobile,courier_partner,awb_code,cod_to_collect,order_status,rto,' +
                'delivered_at,ship_booked_at,ship_status,cod_remitted_at,cod_remitted_amount,cod_remit_ref,invoice_number')
        .gt('cod_to_collect', 0).not('awb_code', 'is', null).neq('order_status', 'cancelled')
        .order('ship_booked_at', { ascending: false });
    }) || [];
  }

  function sum(list, f) { return r2(list.reduce(function (s, o) { return s + Number(f(o) || 0); }, 0)); }

  function render() {
    var by = { due: [], transit: [], done: [], rto: [] };
    rows.forEach(function (o) { by[bucket(o)].push(o); });
    var month = today().slice(0, 7);
    var doneMonth = by.done.filter(function (o) { return String(o.cod_remitted_at).slice(0, 7) === month; });
    var list = view === 'all' ? rows : by[view];
    var stat = function (label, value, hint, cls) {
      return '<div class="stat ' + (cls || '') + '"><small>' + label + '</small><strong style="font-size:20px">' + value + '</strong>' +
        (hint ? '<span class="hint">' + hint + '</span>' : '') + '</div>';
    };
    host.innerHTML =
      '<div class="panel">' +
        '<div class="panel-head"><h2>COD Hisaab</h2><span class="hint">Courier ne jo cash liya, wo bank mein aaya ya nahi</span></div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:4px 0 14px">' +
          stat('Delivered - bank mein baaki', PR.money(sum(by.due, function (o) { return o.cod_to_collect; })), by.due.length + ' order', 'accent') +
          stat('Raste mein (COD)', PR.money(sum(by.transit, function (o) { return o.cod_to_collect; })), by.transit.length + ' parcel') +
          stat('Is mahine bank mein aaya', PR.money(sum(doneMonth, function (o) { return o.cod_remitted_amount || o.cod_to_collect; })), doneMonth.length + ' order') +
          stat('RTO (COD nahi milega)', by.rto.length, by.rto.length ? PR.money(sum(by.rto, function (o) { return o.cod_to_collect; })) : '') +
        '</div>' +

        '<div style="padding:12px;border:1px dashed #d8dbe0;border-radius:10px;margin-bottom:14px">' +
          '<b style="font-size:13px">Shiprocket remittance report upload karein</b>' +
          '<p class="hint" style="margin:4px 0 8px">Shiprocket → Billing → <b>COD Remittance</b> → report <b>Download (CSV)</b>, phir yahan chunein. ' +
            'AWB se order milenge, aap dekh kar Save karein.</p>' +
          '<input type="file" id="codCsv" accept=".csv,text/csv">' +
          '<div id="codPreview"></div>' +
        '</div>' +

        '<div class="tabs-row" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">' + VIEWS.map(function (v) {
          var n = v.key === 'all' ? rows.length : by[v.key].length;
          return '<button class="btn small ' + (view === v.key ? '' : 'gray') + '" type="button" data-view="' + v.key + '">' +
            v.label + ' (' + n + ')</button>';
        }).join('') + '</div>' +
        (list.length
          ? '<div class="table-scroll"><table class="grid"><thead><tr><th>Order</th><th>Customer</th><th>Courier / AWB</th>' +
              '<th>COD</th><th>Status</th><th>Bank mein</th><th></th></tr></thead><tbody>' + list.map(row).join('') + '</tbody></table></div>'
          : PRA.empty('Kuch nahi', view === 'due' ? 'Delivered COD orders ka saara paisa aa chuka hai. 👍' : 'Is list mein abhi koi order nahi.')) +
      '</div>';

    host.querySelectorAll('[data-view]').forEach(function (b) {
      b.addEventListener('click', function () { view = b.getAttribute('data-view'); render(); });
    });
    host.querySelectorAll('[data-mark]').forEach(function (b) {
      b.addEventListener('click', function () { markForm(rows.find(function (o) { return o.id === b.getAttribute('data-mark'); }), b); });
    });
    host.querySelectorAll('[data-unmark]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!confirm('Is order ka "bank mein aaya" hata dein?')) return;
        await save([{ id: b.getAttribute('data-unmark'), cod_remitted_at: null, cod_remitted_amount: null, cod_remit_ref: null }]);
      });
    });
    document.getElementById('codCsv').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (file) readCsv(file);
    });
    if (preview) drawPreview();
  }

  function row(o) {
    var b = bucket(o);
    return '<tr>' +
      '<td class="nowrap"><a href="/admin/orders/?order=' + encodeURIComponent(o.order_number) + '"><b>' + PR.esc(o.order_number) + '</b></a>' +
        (o.invoice_number ? '<br><small>' + PR.esc(o.invoice_number) + '</small>' : '') + '</td>' +
      '<td>' + PR.esc(o.customer_name || '-') + '</td>' +
      '<td>' + PR.esc(o.courier_partner || '-') + '<br><small>' + PR.esc(o.awb_code) + '</small></td>' +
      '<td class="nowrap"><b>' + PR.money(o.cod_to_collect) + '</b></td>' +
      '<td>' + (o.rto ? '<span class="pill cancelled">RTO</span>' : PRA.pill(o.order_status)) +
        (o.delivered_at ? '<br><small>' + PR.formatDate(o.delivered_at) + '</small>' : '') + '</td>' +
      '<td class="nowrap">' + (o.cod_remitted_at
        ? '✓ ' + PR.formatDate(o.cod_remitted_at) + '<br><small>' + PR.money(o.cod_remitted_amount || o.cod_to_collect) +
          (o.cod_remit_ref ? ' · ' + PR.esc(o.cod_remit_ref) : '') + '</small>'
        : '-') + '</td>' +
      '<td class="nowrap">' + (o.cod_remitted_at
        ? '<button class="btn gray small" type="button" data-unmark="' + PR.esc(o.id) + '">Hatao</button>'
        : b === 'rto' ? '' : '<button class="btn small" type="button" data-mark="' + PR.esc(o.id) + '">Bank mein aaya</button>') + '</td>' +
    '</tr>';
  }

  function markForm(o, button) {
    var cell = button.parentNode;
    cell.innerHTML = '<div style="display:grid;gap:4px;min-width:170px">' +
      '<input type="date" class="cm-date" value="' + today() + '">' +
      '<input type="number" class="cm-amt" min="0" step="1" value="' + PR.esc(o.cod_to_collect) + '" placeholder="Amount">' +
      '<input class="cm-ref" maxlength="80" placeholder="UTR / CRF (optional)">' +
      '<button class="btn small" type="button">Save</button></div>';
    cell.querySelector('button').addEventListener('click', async function () {
      var date = cell.querySelector('.cm-date').value;
      if (!date) { PR.toast('Tareekh chuniye.', 'error'); return; }
      await save([{ id: o.id, cod_remitted_at: date, cod_remitted_amount: Number(cell.querySelector('.cm-amt').value) || o.cod_to_collect,
        cod_remit_ref: cell.querySelector('.cm-ref').value.trim() || null }]);
    });
  }

  async function save(updates) {
    try {
      for (var i = 0; i < updates.length; i++) {
        var u = Object.assign({}, updates[i]);
        var id = u.id; delete u.id;
        await PR.call('save COD remittance', function (sb) { return sb.from('orders').update(u).eq('id', id); });
      }
      PR.toast(updates.length + ' order update ho gaye.', 'success');
      preview = null;
      await load();
      render();
    } catch (err) {
      PR.toast(err.message, 'error');
    }
  }

  /* ------------------------------------------------------------ CSV upload */
  function parseCsv(text) {
    var out = [], cur = [], field = '', q = false;
    text = text.replace(/^﻿/, '');
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') q = false;
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        cur.push(field); field = '';
        if (cur.some(function (x) { return x.trim(); })) out.push(cur);
        cur = [];
      } else field += c;
    }
    cur.push(field);
    if (cur.some(function (x) { return x.trim(); })) out.push(cur);
    return out;
  }

  /* Shiprocket's column names vary a little; find them by keywords */
  function columnOf(head, tests) {
    for (var t = 0; t < tests.length; t++) {
      for (var i = 0; i < head.length; i++) if (tests[t].test(head[i])) return i;
    }
    return -1;
  }

  function toIsoDate(v) {
    var s = String(v || '').trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[0];
    m = s.match(/^(\d{1,2})[\/\-. ](\d{1,2}|[A-Za-z]{3})[\/\-. ](\d{2,4})/);
    if (!m) return '';
    var months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    var mon = isNaN(m[2]) ? months[m[2].toLowerCase()] : Number(m[2]);
    var y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    if (!mon) return '';
    return y + '-' + String(mon).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  }

  function readCsv(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var table = parseCsv(String(reader.result || ''));
      if (table.length < 2) { PR.toast('File mein data nahi mila.', 'error'); return; }
      var head = table[0].map(function (h) { return h.trim().toLowerCase(); });
      var cAwb = columnOf(head, [/^awb/, /awb/, /tracking/]);
      var cAmt = columnOf(head, [/cod.*(amount|value)/, /remit.*amount/, /^amount/, /amount/]);
      var cDate = columnOf(head, [/remit.*date/, /(credit|paid|payment).*date/, /^date/, /date/]);
      var cRef = columnOf(head, [/utr/, /crf/, /remittance.*id/, /reference/, /batch/]);
      if (cAwb < 0) { PR.toast('File mein AWB column nahi mila - Shiprocket ka COD remittance report chuniye.', 'error'); return; }
      var byAwb = {};
      rows.forEach(function (o) { byAwb[String(o.awb_code).trim().toUpperCase()] = o; });
      var matched = [], unmatched = 0;
      table.slice(1).forEach(function (r) {
        var awb = String(r[cAwb] || '').trim().toUpperCase().replace(/^'/, '');
        if (!awb) return;
        var o = byAwb[awb];
        if (!o) { unmatched++; return; }
        var amount = cAmt >= 0 ? Number(String(r[cAmt]).replace(/[^\d.]/g, '')) : NaN;
        matched.push({
          order: o, amount: isFinite(amount) && amount > 0 ? amount : Number(o.cod_to_collect),
          date: (cDate >= 0 && toIsoDate(r[cDate])) || today(),
          ref: cRef >= 0 ? String(r[cRef] || '').trim().slice(0, 80) : ''
        });
      });
      preview = { matched: matched, unmatched: unmatched };
      drawPreview();
    };
    reader.readAsText(file);
  }

  function drawPreview() {
    var box = document.getElementById('codPreview');
    var fresh = preview.matched.filter(function (m) { return !m.order.cod_remitted_at; });
    box.innerHTML = '<p style="margin:10px 0 6px"><b>' + preview.matched.length + '</b> order mile' +
        (preview.unmatched ? ', ' + preview.unmatched + ' line ka AWB hamare orders mein nahi (purane / doosre)' : '') +
        (preview.matched.length - fresh.length ? ', ' + (preview.matched.length - fresh.length) + ' pehle se mark' : '') + '.</p>' +
      (fresh.length
        ? '<div class="table-scroll"><table class="grid"><thead><tr><th>Order</th><th>AWB</th><th>COD hona tha</th><th>Report mein</th><th>Tareekh</th><th>UTR / Ref</th></tr></thead><tbody>' +
            fresh.map(function (m) {
              var diff = Math.abs(m.amount - Number(m.order.cod_to_collect)) > 1;
              return '<tr' + (diff ? ' style="background:#fff4ec"' : '') + '><td>' + PR.esc(m.order.order_number) + '</td><td>' + PR.esc(m.order.awb_code) + '</td>' +
                '<td>' + PR.money(m.order.cod_to_collect) + '</td><td>' + PR.money(m.amount) + (diff ? ' ⚠️' : '') + '</td>' +
                '<td>' + PR.formatDate(m.date) + '</td><td>' + PR.esc(m.ref || '-') + '</td></tr>';
            }).join('') + '</tbody></table></div>' +
          '<div class="page-actions" style="margin-top:8px"><button class="btn" type="button" id="codSaveCsv">' + fresh.length +
            ' order "Bank mein aaya" mark karo</button>' +
            (fresh.some(function (m) { return Math.abs(m.amount - Number(m.order.cod_to_collect)) > 1; })
              ? '<span class="hint">⚠️ wali line mein amount alag hai - Shiprocket se check kar lein.</span>' : '') + '</div>'
        : '');
    var btn = document.getElementById('codSaveCsv');
    if (btn) btn.addEventListener('click', function () {
      PR.setBusy(btn, true, 'SAVING…');
      save(fresh.map(function (m) {
        return { id: m.order.id, cod_remitted_at: m.date, cod_remitted_amount: m.amount, cod_remit_ref: m.ref || null };
      }));
    });
  }

  PRA.boot('cod', 'COD Hisaab', async function (h) {
    host = h;
    await load();
    render();
  });
})();
