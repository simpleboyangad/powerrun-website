/* Admin - Approval Center: requests from the AI agents that only the owner can approve */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var ACTIONS = {
    stock_adjust: 'Stock change',
    order_cancel: 'Cancel order',
    tax_invoice_cancel: 'Cancel PI / Tax Invoice',
    discount_override: 'Extra discount',
    refund_record: 'Record refund',
    warranty_exception: 'Warranty exception',
    data_export: 'Data export'
  };

  var rows = [];
  var names = { products: {}, orders: {}, pis: {} };
  var view = 'pending';
  var host = null;

  function isOwner() { return PRA.admin && PRA.admin.role === 'owner'; }

  async function load() {
    rows = await PR.call('load approvals', function (sb) {
      var q = sb.from('approvals').select('*').order('created_at', { ascending: false }).limit(100);
      return view === 'pending' ? q.eq('status', 'pending') : q;
    }) || [];

    var pids = [], oids = [], piids = [];
    rows.forEach(function (r) {
      var p = r.payload || {};
      if (p.product_id) pids.push(p.product_id);
      if (p.order_id) oids.push(p.order_id);
      if (p.pi_id) piids.push(p.pi_id);
      if (r.target_table === 'proforma_invoices' && r.target_id) piids.push(r.target_id);
      if (r.target_table === 'orders' && r.target_id) oids.push(r.target_id);
    });
    var lookups = [];
    if (pids.length) lookups.push(PR.call('load products', function (sb) {
      return sb.from('products').select('id,name,stock').in('id', pids);
    }).then(function (d) { (d || []).forEach(function (x) { names.products[x.id] = x; }); }));
    if (oids.length) lookups.push(PR.call('load orders', function (sb) {
      return sb.from('orders').select('id,order_number,customer_name,city,total_amount,order_status,payment_status').in('id', oids);
    }).then(function (d) { (d || []).forEach(function (x) { names.orders[x.id] = x; }); }));
    if (piids.length) lookups.push(PR.call('load PIs', function (sb) {
      return sb.from('proforma_invoices').select('id,pi_number,invoice_number,customer_name,business_name,total_amount').in('id', piids);
    }).then(function (d) { (d || []).forEach(function (x) { names.pis[x.id] = x; }); }));
    await Promise.all(lookups);
  }

  function line(label, value) {
    return value == null || value === '' ? '' :
      '<div class="apr-line"><span>' + PR.esc(label) + '</span><b>' + value + '</b></div>';
  }

  function details(r) {
    var p = r.payload || {};
    var out = '';
    var prod = names.products[p.product_id];
    var order = names.orders[p.order_id || (r.target_table === 'orders' ? r.target_id : '')];
    var pi = names.pis[p.pi_id || (r.target_table === 'proforma_invoices' ? r.target_id : '')];
    if (prod) out += line('Product', PR.esc(prod.name) + ' <small>(abhi stock ' + PR.esc(prod.stock) + ')</small>');
    if (p.change != null) out += line('Stock change', (p.change > 0 ? '+' : '') + PR.esc(p.change));
    if (order) out += line('Order', '<a href="/admin/orders/?order=' + encodeURIComponent(order.order_number) + '">' +
      PR.esc(order.order_number) + '</a> · ' + PR.esc(order.customer_name) + (order.city ? ', ' + PR.esc(order.city) : '') +
      ' · ' + PR.money(order.total_amount) + ' · ' + PR.esc(order.order_status) + '/' + PR.esc(order.payment_status));
    if (pi) out += line(pi.invoice_number ? 'Tax Invoice' : 'PI', PR.esc(pi.invoice_number || pi.pi_number) + ' · ' +
      PR.esc(pi.business_name || pi.customer_name) + ' · ' + PR.money(pi.total_amount));
    if (p.discount_pct != null) out += line('Discount', PR.esc(p.discount_pct) + '% <small>(limit 4%)</small>');
    if (r.amount != null) out += line('Amount', PR.money(r.amount));
    var known = ['product_id', 'change', 'order_id', 'pi_id', 'discount_pct'];
    Object.keys(p).filter(function (k) { return known.indexOf(k) < 0; }).forEach(function (k) {
      out += line(k.replace(/_/g, ' '), PR.esc(typeof p[k] === 'object' ? JSON.stringify(p[k]) : p[k]));
    });
    return out;
  }

  function timeLeft(r) {
    var ms = new Date(r.expires_at) - new Date();
    if (ms <= 0) return 'expired';
    var h = Math.floor(ms / 3600000);
    return h >= 1 ? h + ' ghante baaki' : Math.max(1, Math.round(ms / 60000)) + ' min baaki';
  }

  function card(r) {
    var pending = r.status === 'pending' && new Date(r.expires_at) > new Date();
    return '<div class="apr-card">' +
      '<div class="apr-top"><b>' + PR.esc(ACTIONS[r.action] || r.action) + '</b>' +
        '<span>' + PRA.pill(pending || r.status !== 'pending' ? r.status : 'expired') + '</span></div>' +
      '<div class="apr-meta">' + PR.esc(r.request_no) + ' · ' + PR.esc(r.requested_name || 'Unknown') +
        (r.requested_role ? ' (' + PR.esc(r.requested_role.replace('agent_', '') + ' agent') + ')' : '') +
        ' · ' + PR.formatDateTime(r.created_at) + (pending ? ' · ' + timeLeft(r) : '') + '</div>' +
      '<div class="apr-reason">' + PR.esc(r.reason) + '</div>' +
      details(r) +
      (r.decision_note ? line('Aapka note', PR.esc(r.decision_note)) : '') +
      (r.error ? line('Error', '<span class="apr-error">' + PR.esc(r.error) + '</span>') : '') +
      (r.result && r.result.note ? line('Result', PR.esc(r.result.note)) : '') +
      (pending && isOwner()
        ? '<div class="apr-actions">' +
            '<button class="btn small" type="button" data-approve="' + PR.esc(r.id) + '">Approve</button>' +
            '<button class="btn danger small" type="button" data-reject="' + PR.esc(r.id) + '">Reject</button>' +
          '</div>'
        : '') +
    '</div>';
  }

  function render() {
    host.innerHTML =
      '<div class="tabs-row" style="margin-bottom:12px">' +
        '<button type="button" class="tab-btn' + (view === 'pending' ? ' active' : '') + '" data-view="pending">Pending</button>' +
        '<button type="button" class="tab-btn' + (view === 'all' ? ' active' : '') + '" data-view="all">Sab (last 100)</button>' +
      '</div>' +
      (isOwner() ? '' : '<p class="hint">Sirf owner approve / reject kar sakta hai.</p>') +
      (rows.length
        ? '<div class="apr-list">' + rows.map(card).join('') + '</div>'
        : PRA.empty(view === 'pending' ? 'Koi request pending nahi' : 'Abhi tak koi request nahi',
            'AI agents jab stock, cancel, refund ya 4% se zyada discount maangenge to yahan dikhega.'));
  }

  async function decide(id, approve, button) {
    var r = rows.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    var note = null;
    if (approve) {
      if (!confirm((ACTIONS[r.action] || r.action) + ' approve karein?\n\n' + r.request_no + ': ' + r.reason)) return;
    } else {
      note = prompt('Reject karne ka reason (optional):', '');
      if (note === null) return;
    }
    PR.setBusy(button, true, approve ? 'APPROVING…' : 'REJECTING…');
    try {
      var res = await PR.call('decide approval', function (sb) {
        return sb.rpc('decide_approval', { p_id: id, p_approve: approve, p_hash: r.payload_hash, p_note: note || null });
      });
      var st = res && res.status;
      if (st === 'failed') PR.toast('Approve hua par kaam nahi ho paya: ' + (res.error || ''), 'error');
      else if (st === 'expired') PR.toast('Request expire ho chuki hai.', 'error');
      else PR.toast(st === 'rejected' ? 'Rejected.' : 'Approved.', 'success');
      await load();
      render();
      PRA.loadBadges();
    } catch (err) {
      PR.setBusy(button, false);
      PR.toast(err.message, 'error');
    }
  }

  document.addEventListener('click', async function (event) {
    var t;
    if ((t = event.target.closest('[data-view]'))) {
      view = t.getAttribute('data-view');
      host.innerHTML = PRA.skeleton(4);
      await load();
      render();
    } else if ((t = event.target.closest('[data-approve]'))) {
      decide(t.getAttribute('data-approve'), true, t);
    } else if ((t = event.target.closest('[data-reject]'))) {
      decide(t.getAttribute('data-reject'), false, t);
    }
  });

  PRA.boot('approvals', 'Approval Center', async function (h) {
    host = h;
    host.innerHTML = PRA.skeleton(4);
    await load();
    render();
  });
})();
