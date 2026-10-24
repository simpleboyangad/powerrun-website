/* Admin - Reports: sales, money to collect, dispatch, leads, stock, margin, health.
 * Every figure comes from the report_* functions (sql/40); test orders are left out. */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var TABS = [
    { key: 'sales', label: 'Sale' },
    { key: 'money', label: 'Baaki Paisa' },
    { key: 'dispatch', label: 'Dispatch' },
    { key: 'leads', label: 'Leads' },
    { key: 'stock', label: 'Stock' },
    { key: 'margin', label: 'Margin' },
    { key: 'health', label: 'System Health' }
  ];
  var DATED = { sales: 1, leads: 1, stock: 1, margin: 1 };

  var host = null;
  var tab = 'sales';
  var range = null;

  function ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function preset(key) {
    var now = new Date();
    var y = now.getFullYear(), m = now.getMonth();
    switch (key) {
      case 'today': return { from: ymd(now), to: ymd(now) };
      case '7d': return { from: ymd(new Date(y, m, now.getDate() - 6)), to: ymd(now) };
      case 'month': return { from: ymd(new Date(y, m, 1)), to: ymd(now) };
      case 'last': return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
      case 'fy': return { from: ymd(new Date(m >= 3 ? y : y - 1, 3, 1)), to: ymd(now) };
    }
    return null;
  }

  function stat(label, value, cls, hint) {
    return '<div class="stat ' + (cls || '') + '"><small>' + PR.esc(label) + '</small><strong>' + value + '</strong>' +
      (hint ? '<span class="hint">' + PR.esc(hint) + '</span>' : '') + '</div>';
  }

  function table(heads, rows, empty) {
    if (!rows.length) return PRA.empty(empty || 'Kuch nahi', '');
    return '<div class="table-scroll"><table class="grid"><thead><tr>' +
      heads.map(function (h) { return '<th' + (h.num ? ' class="num"' : '') + '>' + PR.esc(h.t || h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr>' + r.map(function (c, i) {
          return '<td' + (heads[i].num ? ' class="num nowrap"' : '') + '>' + c + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  function section(title, body) {
    return '<div class="panel" style="margin-top:16px"><div class="panel-head"><h2>' + PR.esc(title) + '</h2></div>' + body + '</div>';
  }

  var money = function (v) { return PR.money(Number(v) || 0); };
  var when = function (v) { return v ? PR.formatDate(v) : '-'; };

  /* one series: sale value per day; the hover title gives the exact figures */
  function dailyChart(days, from, to) {
    var map = {};
    days.forEach(function (d) { map[d.d] = d; });
    var list = [];
    for (var d = new Date(from + 'T00:00:00'), end = new Date(to + 'T00:00:00'); d <= end && list.length < 120; d.setDate(d.getDate() + 1)) {
      var k = ymd(d);
      list.push({ d: k, value: map[k] ? Number(map[k].value) : 0, orders: map[k] ? map[k].orders : 0 });
    }
    if (list.length < 2) return '';
    var max = Math.max.apply(null, list.map(function (x) { return x.value; })) || 1;
    var w = 100 / list.length;
    return '<div class="rep-chart" role="img" aria-label="Daily sale value">' +
      '<div class="rep-chart-max">' + money(max) + '</div>' +
      '<svg viewBox="0 0 100 40" preserveAspectRatio="none">' +
      '<line x1="0" y1="40" x2="100" y2="40" class="rep-axis"/>' +
      list.map(function (x, i) {
        var h = x.value ? Math.max(0.8, 38 * x.value / max) : 0;
        return '<g><rect class="rep-hit" x="' + (i * w) + '" y="0" width="' + w + '" height="40"/>' +
          (h ? '<rect class="rep-bar" x="' + (i * w + w * 0.15) + '" y="' + (40 - h) + '" width="' + (w * 0.7) + '" height="' + h + '" rx="0.4"/>' : '') +
          '<title>' + PR.formatDate(x.d) + ': ' + money(x.value) + ' (' + x.orders + ' order)</title></g>';
      }).join('') + '</svg>' +
      '<div class="rep-chart-axis"><span>' + PR.formatDate(list[0].d) + '</span><span>' + PR.formatDate(list[list.length - 1].d) + '</span></div>' +
    '</div>';
  }

  function rpc(name, args) {
    return PR.call(name, function (sb) { return sb.rpc(name, args || {}); });
  }

  var renderers = {
    sales: async function () {
      var r = await rpc('report_sales', { p_from: range.from, p_to: range.to });
      return '<div class="stats">' +
          stat('Net Sale', money(r.net_sales), 'accent', 'Orders + PI invoices − credit notes') +
          stat('Website Orders', r.orders.count, '', money(r.orders.value) + ' · ' + r.units + ' units') +
          stat('Paid', money(r.orders.paid_value), 'good', 'Avg order ' + money(r.orders.avg)) +
          stat('PI Tax Invoices', r.pi_invoices.count, '', money(r.pi_invoices.value)) +
          stat('Credit Notes', r.credit_notes.count, r.credit_notes.count ? 'warn' : '', money(r.credit_notes.value)) +
          stat('Cancelled', r.cancelled.count, r.cancelled.count ? 'bad' : '', money(r.cancelled.value)) +
          stat('GST (orders)', money(r.orders.gst), '', 'Included in the order value') +
        '</div>' +
        section('Roz ki sale', dailyChart(r.daily, range.from, range.to) ||
          '<p class="hint">Chart ke liye 2 ya zyada din chunein.</p>') +
        section('Product-wise (top 30)', table(['Product', { t: 'Units', num: 1 }, { t: 'Value', num: 1 }],
          r.by_product.map(function (x) { return [PR.esc(x.name), x.units, money(x.value)]; }), 'Is samay koi sale nahi')) +
        section('Category-wise', table(['Category', { t: 'Units', num: 1 }, { t: 'Value', num: 1 }],
          r.by_category.map(function (x) { return [PR.esc(x.name), x.units, money(x.value)]; }))) +
        section('Payment method', table(['Method', { t: 'Orders', num: 1 }, { t: 'Value', num: 1 }],
          r.by_payment.map(function (x) { return [PR.esc(x.method === 'razorpay' ? 'Online (Razorpay)' : x.method.toUpperCase()), x.count, money(x.value)]; }))) +
        section('State-wise', table(['State', { t: 'Orders', num: 1 }, { t: 'Value', num: 1 }],
          r.by_state.map(function (x) { return [PR.esc(x.state), x.count, money(x.value)]; })));
    },

    money: async function () {
      var r = await rpc('report_receivables');
      return '<div class="stats">' +
          stat('Kul baaki', money(r.total), 'accent', 'Orders + PI jinka paisa nahi aaya') +
          stat('COD - deliver, paisa nahi', r.cod_delivered_unpaid.length, r.cod_delivered_unpaid.length ? 'bad' : 'good') +
          stat('COD - raste mein', r.cod_open.count, '', money(r.cod_open.value)) +
          stat('Online adhoore', r.online_unpaid.length, r.online_unpaid.length ? 'warn' : '') +
        '</div>' +
        section('Deliver ho gaya, paisa nahi aaya', table(['Order', 'Customer', 'City', { t: 'Amount', num: 1 }, 'Delivered'],
          r.cod_delivered_unpaid.map(function (x) {
            return ['<a href="/admin/orders/?order=' + encodeURIComponent(x.order_number) + '">' + PR.esc(x.order_number) + '</a>',
                    PR.esc(x.customer) + '<small>' + PR.esc(x.mobile || '') + '</small>', PR.esc(x.city || ''), money(x.amount), when(x.delivered_at)];
          }), 'Sab paisa aa gaya 👍')) +
        section('PI / dealer - paisa baaki', table(['PI', 'Party', { t: 'Amount', num: 1 }, 'Date'],
          r.pi_unpaid.map(function (x) {
            return [PR.esc(x.pi_number) + (x.invoice_number ? '<small>' + PR.esc(x.invoice_number) + '</small>' : ''),
                    PR.esc(x.party) + '<small>' + PR.esc(x.mobile || '') + '</small>', money(x.amount), when(x.date)];
          }), 'Koi PI baaki nahi')) +
        section('Online payment adhoora (2 ghante se zyada)', table(['Order', 'Customer', { t: 'Amount', num: 1 }, 'Placed'],
          r.online_unpaid.map(function (x) {
            return ['<a href="/admin/orders/?order=' + encodeURIComponent(x.order_number) + '">' + PR.esc(x.order_number) + '</a>',
                    PR.esc(x.customer), money(x.amount), when(x.created_at)];
          }), 'Koi nahi'));
    },

    dispatch: async function () {
      var r = await rpc('report_dispatch');
      var s = r.open_by_status || {};
      return '<div class="stats">' +
          stat('Pending', s.pending || 0) + stat('Confirmed', (s.confirmed || 0) + (s.processing || 0)) +
          stat('Packed', s.packed || 0) + stat('Shipped (raste mein)', s.shipped || 0) +
          stat('Late to ship', r.late_to_ship.length, r.late_to_ship.length ? 'bad' : 'good', '2 din se zyada') +
          stat('Late in transit', r.late_in_transit.length, r.late_in_transit.length ? 'warn' : 'good', '9 din se zyada') +
          stat('Ship hone mein', r.avg_days_to_ship == null ? '-' : r.avg_days_to_ship + ' din', '', 'Average, last 90 days') +
          stat('Raste mein', r.avg_days_in_transit == null ? '-' : r.avg_days_in_transit + ' din', '', 'Average, last 90 days') +
        '</div>' +
        (r.shipped_without_invoice.length
          ? '<div class="form-message error" style="margin-top:16px">GST: ' + r.shipped_without_invoice.length +
            ' order ship / deliver ho gaye par Tax Invoice nahi bana: ' + r.shipped_without_invoice.map(PR.esc).join(', ') + '</div>'
          : '') +
        section('Ship hona baaki (2 din se zyada)', table(['Order', 'Customer', 'Status', 'Since'],
          r.late_to_ship.map(function (x) {
            return ['<a href="/admin/orders/?order=' + encodeURIComponent(x.order_number) + '">' + PR.esc(x.order_number) + '</a>',
                    PR.esc(x.customer), PRA.pill(x.status), when(x.since)];
          }), 'Sab time par 👍')) +
        section('Raste mein der (9 din se zyada)', table(['Order', 'Customer', 'Courier', 'Shipped'],
          r.late_in_transit.map(function (x) {
            return ['<a href="/admin/orders/?order=' + encodeURIComponent(x.order_number) + '">' + PR.esc(x.order_number) + '</a>',
                    PR.esc(x.customer), PR.esc((x.courier || '-') + ' ' + (x.tracking || '')), when(x.shipped_at)];
          }), 'Koi nahi'));
    },

    leads: async function () {
      var r = await rpc('report_leads', { p_from: range.from, p_to: range.to });
      var total = r.by_source.reduce(function (s, x) { return s + x.leads; }, 0);
      var conv = r.by_source.reduce(function (s, x) { return s + x.converted; }, 0);
      var q = r.quotations || {};
      return '<div class="stats">' +
          stat('Leads', total, 'accent') +
          stat('Converted', conv, conv ? 'good' : '', total ? Math.round(100 * conv / total) + '% conversion' : '') +
          stat('Website orders', r.website_orders) +
          stat('Dealer enquiries', r.dealer_enquiries) +
        '</div>' +
        section('Source-wise', table(['Source', { t: 'Leads', num: 1 }, { t: 'Converted', num: 1 }, { t: 'Conversion', num: 1 }],
          r.by_source.map(function (x) { return [PR.esc(x.source), x.leads, x.converted, (x.conversion_pct || 0) + '%']; }), 'Koi lead nahi')) +
        section('Lead status', table(['Status', { t: 'Leads', num: 1 }],
          Object.keys(r.by_status || {}).map(function (k) { return [PRA.pill(k), r.by_status[k]]; }))) +
        section('Quotations', table(['Status', { t: 'Count', num: 1 }, { t: 'Value', num: 1 }],
          Object.keys(q).map(function (k) { return [PRA.pill(k), q[k].count, money(q[k].value)]; }), 'Koi quotation nahi'));
    },

    stock: async function () {
      var r = await rpc('report_stock', { p_from: range.from, p_to: range.to });
      return section('Stock ka aana-jaana', table(['Product', 'SKU', { t: 'Opening', num: 1 }, { t: 'In', num: 1 }, { t: 'Out', num: 1 }, { t: 'Closing', num: 1 }],
          r.movements.map(function (x) {
            return [PR.esc(x.name), PR.esc(x.sku || ''), x.opening, x.stock_in ? '+' + x.stock_in : '0', x.stock_out ? '−' + x.stock_out : '0', '<b>' + x.closing + '</b>'];
          }), 'Is samay stock mein koi badlav nahi')) +
        section('Kam stock (5 ya kam)', table(['Product', 'SKU', { t: 'Stock', num: 1 }],
          r.low_stock.map(function (x) { return [PR.esc(x.name), PR.esc(x.sku || ''), x.stock]; }), 'Sab theek'));
    },

    margin: async function () {
      var r = await rpc('report_margin', { p_from: range.from, p_to: range.to });
      return '<p class="hint">⚠ Ye <b>andaza</b> hai: bina GST ki sale − (purchase cost + freight + packing + other). ' +
          'Sirf un products ka jinka purchase cost Products → Costing mein bhara hai.' +
          (r.products_without_cost ? ' <b>' + r.products_without_cost + '</b> bike hue products ka cost nahi bhara.' : '') + '</p>' +
        '<div class="stats">' +
          stat('Sale (bina GST)', money(r.total.sale_value), 'accent') +
          stat('Cost', money(r.total.cost)) +
          stat('Margin', money(r.total.margin), r.total.margin >= 0 ? 'good' : 'bad',
               r.total.sale_value ? Math.round(100 * r.total.margin / r.total.sale_value) + '%' : '') +
        '</div>' +
        section('Product-wise margin', table(['Product', { t: 'Units', num: 1 }, { t: 'Sale', num: 1 }, { t: 'Cost', num: 1 }, { t: 'Margin', num: 1 }, { t: '%', num: 1 }],
          r.products.map(function (x) {
            return [PR.esc(x.name), x.units, money(x.sale_value), money(x.cost),
                    '<b' + (x.margin < 0 ? ' style="color:#8c1d18"' : '') + '>' + money(x.margin) + '</b>', (x.margin_pct == null ? '-' : x.margin_pct + '%')];
          }), 'Cost wale products ki koi sale nahi'));
    },

    health: async function () {
      var r = await rpc('report_health');
      var pay = r.payments_7d || {};
      var a = r.approvals || {};
      var agents = r.agent_actions_7d || {};
      var problems = [];
      if (r.payment_problems) problems.push(r.payment_problems + ' payment problem (amount galat / cancel ke baad paisa) - Orders dekhein');
      if (r.cancelled_invoice_without_credit_note) problems.push(r.cancelled_invoice_without_credit_note + ' cancelled invoice ka Credit Note baaki');
      if (r.shipped_without_invoice) problems.push(r.shipped_without_invoice + ' order ship ho gaye par Tax Invoice nahi bana');
      if (a.failed_30d) problems.push(a.failed_30d + ' approval chal nahi paye (Approval Center → Sab)');
      if (r.followups_overdue) problems.push(r.followups_overdue + ' follow-up overdue');
      return (problems.length
          ? '<div class="form-message error">' + problems.map(function (p) { return '⚠ ' + PR.esc(p); }).join('<br>') + '</div>'
          : '<div class="form-message success">✓ Sab theek chal raha hai</div>') +
        '<div class="stats" style="margin-top:16px">' +
          stat('Online payment events (7 din)', Object.keys(pay).reduce(function (s, k) { return s + pay[k]; }, 0), '',
               r.last_payment_event ? 'Last: ' + PR.formatDateTime(r.last_payment_event) : 'Abhi tak koi nahi') +
          stat('Approvals pending', a.pending || 0, a.pending ? 'warn' : '') +
          stat('Approvals expired (30 din)', a.expired_30d || 0) +
          stat('Last order', r.last_order ? PR.formatDate(r.last_order) : '-') +
        '</div>' +
        section('Payment webhook (7 din)', table(['Result', { t: 'Events', num: 1 }],
          Object.keys(pay).map(function (k) { return [PR.esc(k), pay[k]]; }), 'Pichhle 7 din mein koi online payment event nahi')) +
        section('AI agents ka kaam (7 din)', table(['Agent', { t: 'Database changes', num: 1 }],
          Object.keys(agents).map(function (k) { return [PR.esc(k.replace('agent_', '') + ' agent'), agents[k]]; }), 'Agents ne kuch nahi badla')) +
        '<p class="hint" style="margin-top:12px">Backup roz raat 23:30 par Google Drive (PowerRun Backups) mein jata hai - ' +
          'uski report roz subah ki sales report mein aati hai.</p>';
    }
  };

  async function draw() {
    var isOwner = PRA.admin && PRA.admin.role === 'owner';
    var visible = TABS.filter(function (t) { return t.key !== 'margin' || isOwner; });
    host.innerHTML =
      '<div class="tabs-row">' + visible.map(function (t) {
        return '<button type="button" class="tab-btn' + (t.key === tab ? ' active' : '') + '" data-tab="' + t.key + '">' + t.label + '</button>';
      }).join('') + '</div>' +
      (DATED[tab]
        ? '<div class="toolbar">' +
            [['today', 'Aaj'], ['7d', '7 din'], ['month', 'Is mahine'], ['last', 'Pichhla mahina'], ['fy', 'Is saal (FY)']].map(function (p) {
              var pr = preset(p[0]);
              var on = pr.from === range.from && pr.to === range.to;
              return '<button type="button" class="btn small ' + (on ? '' : 'ghost') + '" data-preset="' + p[0] + '">' + p[1] + '</button>';
            }).join(' ') +
            ' <input type="date" id="repFrom" value="' + range.from + '" aria-label="From"> – ' +
            '<input type="date" id="repTo" value="' + range.to + '" aria-label="To">' +
          '</div>'
        : '') +
      '<div id="repBody">' + PRA.skeleton(6) + '</div>';
    var body = document.getElementById('repBody');
    try {
      body.innerHTML = await renderers[tab]();
    } catch (err) {
      body.innerHTML = PRA.errorPanel(err.message);
    }
  }

  document.addEventListener('click', function (e) {
    var t;
    if ((t = e.target.closest('[data-tab]'))) { tab = t.getAttribute('data-tab'); history.replaceState(null, '', '?tab=' + tab); draw(); }
    else if ((t = e.target.closest('[data-preset]'))) { range = preset(t.getAttribute('data-preset')); draw(); }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'repFrom' || e.target.id === 'repTo') {
      var f = document.getElementById('repFrom').value, to = document.getElementById('repTo').value;
      if (f && to && f <= to) { range = { from: f, to: to }; draw(); }
    }
  });

  PRA.boot('reports', 'Reports', async function (h) {
    host = h;
    range = preset('month');
    var want = PR.param('tab');
    if (want && renderers[want]) tab = want;
    await draw();
  });
})();
