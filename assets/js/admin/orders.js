/* Admin - order management */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
  var PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];

  var orders = [];
  var contentHost = null;
  var filterStatus = '';

  async function loadAll() {
    orders = await PR.call('load orders', function (sb) {
      return sb.from('orders')
        .select('*, order_items(id,product_name,product_sku,quantity,unit_price,total_price,mrp,gst_rate,gst_amount)')
        .order('created_at', { ascending: false });
    }) || [];
  }

  function itemCount(order) {
    return (order.order_items || []).reduce(function (sum, item) {
      return sum + Number(item.quantity || 0);
    }, 0);
  }

  function render(host) {
    var visible = filterStatus
      ? orders.filter(function (o) { return o.order_status === filterStatus; })
      : orders;

    host.innerHTML =
      '<div class="panel">' +
        '<div class="panel-head"><h2>Orders</h2>' +
          '<span class="hint">' + orders.length + ' total</span></div>' +
        '<div class="toolbar">' +
          '<input type="search" id="orderSearch" placeholder="Search order ID, name, mobile or email…" aria-label="Search orders">' +
          '<select id="orderStatusFilter"><option value="">All statuses</option>' +
            ORDER_STATUSES.map(function (s) {
              return '<option value="' + s + '"' + (filterStatus === s ? ' selected' : '') + '>' +
                s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
            }).join('') +
          '</select>' +
          '<span class="count" id="orderCount">' + visible.length + ' shown</span>' +
        '</div>' +
        (visible.length
          ? '<div class="table-scroll"><table class="grid" id="orderTable"><thead><tr>' +
              '<th>Order ID</th><th>Customer</th><th>Mobile</th><th>Email</th><th>Date</th>' +
              '<th>Items</th><th>Amount</th><th>Payment</th><th>Status</th><th></th>' +
            '</tr></thead><tbody>' + visible.map(row).join('') + '</tbody></table></div>'
          : PRA.empty(filterStatus ? 'No ' + filterStatus + ' orders' : 'No orders yet',
              filterStatus
                ? 'No orders currently have this status.'
                : 'Orders placed on powerrun.in will appear here as soon as they are created.')) +
      '</div>';

    PRA.bindSearch('orderSearch', 'orderTable', 'orderCount');
    var statusFilter = document.getElementById('orderStatusFilter');
    if (statusFilter) {
      statusFilter.addEventListener('change', function () {
        filterStatus = statusFilter.value;
        var url = filterStatus ? '?status=' + filterStatus : location.pathname;
        history.replaceState(null, '', url);
        render(host);
      });
    }
  }

  function row(order) {
    return '<tr>' +
      '<td class="nowrap"><b>' + PR.esc(order.order_number) + '</b></td>' +
      '<td>' + PR.esc(order.customer_name || '-') + '</td>' +
      '<td class="nowrap">' + PR.esc(order.customer_mobile || '-') + '</td>' +
      '<td>' + PR.esc(order.customer_email || '-') + '</td>' +
      '<td class="nowrap">' + PR.formatDate(order.created_at) + '</td>' +
      '<td>' + itemCount(order) + '</td>' +
      '<td class="nowrap"><b>' + PR.money(order.total_amount) + '</b></td>' +
      '<td>' + PRA.pill(order.payment_status) + '</td>' +
      '<td>' + PRA.pill(order.order_status) + '</td>' +
      '<td class="nowrap"><button class="btn ghost small" type="button" data-view-order="' +
        PR.esc(order.id) + '">Open</button></td>' +
    '</tr>';
  }

  function detail(order) {
    var items = order.order_items || [];
    PRA.openDrawer('Order ' + order.order_number,
      '<div id="orderDetailMessage"></div>' +

      '<div class="form-grid">' +
        '<div><b style="font-size:12px;color:#6d6d6d">CUSTOMER</b>' +
          '<p style="margin:6px 0 0;line-height:1.7">' +
            '<b>' + PR.esc(order.customer_name || '-') + '</b><br>' +
            '☎ <a href="tel:' + PR.esc(order.customer_mobile) + '">' + PR.esc(order.customer_mobile || '-') + '</a><br>' +
            (order.customer_email
              ? '✉ <a href="mailto:' + PR.esc(order.customer_email) + '">' + PR.esc(order.customer_email) + '</a>'
              : '') +
          '</p></div>' +
        '<div><b style="font-size:12px;color:#6d6d6d">DELIVERY ADDRESS</b>' +
          '<p style="margin:6px 0 0;line-height:1.7">' +
            PR.esc(order.address || '-') + '<br>' +
            PR.esc([order.city, order.state, order.pincode].filter(Boolean).join(', ')) +
          '</p></div>' +
      '</div>' +

      '<div class="table-scroll" style="margin-top:18px"><table class="grid"><thead><tr>' +
        '<th>Product</th><th>SKU</th><th>Qty</th><th>Unit Price</th><th>Total</th>' +
      '</tr></thead><tbody>' +
      items.map(function (item) {
        return '<tr><td><b>' + PR.esc(item.product_name) + '</b></td>' +
          '<td class="nowrap">' + PR.esc(item.product_sku || '-') + '</td>' +
          '<td>' + item.quantity + '</td>' +
          '<td class="nowrap">' + PR.money(item.unit_price) + '</td>' +
          '<td class="nowrap">' + PR.money(item.total_price) + '</td></tr>';
      }).join('') +
      '</tbody></table></div>' +

      '<div style="margin-top:14px;display:grid;gap:6px;max-width:340px;margin-left:auto">' +
        (function () {
          var b = PR.orderBreakdown(Object.assign({}, order, { items: items }));
          var line = function (r) {
            var style = 'display:flex;justify-content:space-between' +
              (r.cls === 'total' ? ';border-top:1px solid #eee;padding-top:8px;font-size:17px' : '') +
              (r.cls === 'discount' ? ';color:#14663a' : '') +
              (r.cls === 'mrp' ? ';color:#888' : '') +
              (r.cls === 'sub' ? ';font-size:12px;color:#666;padding-left:12px' : '');
            return '<div style="' + style + '"><span>' + PR.esc(r.label) + '</span><b>' + r.value + '</b></div>';
          };
          return b.rows.map(line).join('') +
            (b.gstRows.length
              ? '<div style="margin-top:6px;padding-top:6px;border-top:1px dashed #ddd;display:grid;gap:4px">' +
                b.gstRows.map(line).join('') + '</div>'
              : '');
        })() +
      '</div>' +

      '<div class="hint" style="margin-top:12px">' +
        'Placed ' + PR.formatDateTime(order.created_at) +
        ' · Payment method: ' + PR.esc(order.payment_method || '-') +
        (order.razorpay_payment_id ? ' · Razorpay payment ' + PR.esc(order.razorpay_payment_id) : '') +
      '</div>' +

      '<form class="form" id="orderUpdateForm" style="margin-top:20px;border-top:1px solid #eef0f3;padding-top:18px">' +
        '<div class="form-grid">' +
          '<label>Order Status<select id="od_status">' +
            ORDER_STATUSES.map(function (s) {
              return '<option value="' + s + '"' + (order.order_status === s ? ' selected' : '') + '>' +
                s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
            }).join('') +
          '</select></label>' +
          '<label>Payment Status<select id="od_payment">' +
            PAYMENT_STATUSES.map(function (s) {
              return '<option value="' + s + '"' + (order.payment_status === s ? ' selected' : '') + '>' +
                s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
            }).join('') +
            '</select>' +
            '<span class="hint">Only mark as paid once you have confirmed the money was received.</span>' +
          '</label>' +
        '</div>' +
        '<div class="form-grid">' +
          '<label>Courier Partner<input id="od_courier" maxlength="80" value="' +
            PR.esc(order.courier_partner || '') + '"></label>' +
          '<label>Tracking Number<input id="od_tracking" maxlength="80" value="' +
            PR.esc(order.tracking_number || '') + '"></label>' +
        '</div>' +
        '<label>Internal Notes<textarea id="od_notes" maxlength="1000">' +
          PR.esc(order.notes || '') + '</textarea></label>' +
        '<div class="page-actions" style="justify-content:flex-end">' +
          '<a class="btn gray" href="' + PR.esc(PR.whatsapp(
              'Hello ' + (order.customer_name || '') + ', this is PowerRun Industries regarding your order ' +
              order.order_number + '.')) + '" target="_blank" rel="noopener">WhatsApp Customer</a>' +
          '<button class="btn" type="submit" id="saveOrderBtn">SAVE ORDER</button>' +
        '</div>' +
      '</form>');

    document.getElementById('orderUpdateForm').addEventListener('submit', function (event) {
      saveOrder(event, order);
    });
  }

  async function saveOrder(event, order) {
    event.preventDefault();
    var button = document.getElementById('saveOrderBtn');
    var messageHost = document.getElementById('orderDetailMessage');
    messageHost.innerHTML = '';

    var status = document.getElementById('od_status').value;
    if (status === 'cancelled' && order.order_status !== 'cancelled') {
      if (!confirm('Cancel order ' + order.order_number + '?\n\n' +
                   'The stock reserved by this order will be returned to inventory.')) return;
    }

    var payload = {
      order_status: status,
      payment_status: document.getElementById('od_payment').value,
      courier_partner: document.getElementById('od_courier').value.trim() || null,
      tracking_number: document.getElementById('od_tracking').value.trim() || null,
      notes: document.getElementById('od_notes').value.trim() || null
    };

    PR.setBusy(button, true, 'SAVING…');
    try {
      await PR.call('update order', function (sb) {
        return sb.from('orders').update(payload).eq('id', order.id);
      });
      PRA.closeDrawer();
      PR.toast('Order ' + order.order_number + ' updated.', 'success');
      await refresh();
      PRA.loadBadges();
    } catch (err) {
      PR.setBusy(button, false);
      messageHost.innerHTML = '<div class="form-message error" role="alert">' + PR.esc(err.message) + '</div>';
      PR.toast(err.message, 'error');
    }
  }

  async function refresh() {
    await loadAll();
    render(contentHost);
  }

  document.addEventListener('click', function (event) {
    var open = event.target.closest('[data-view-order]');
    if (!open) return;
    var order = orders.find(function (o) { return String(o.id) === String(open.getAttribute('data-view-order')); });
    if (order) detail(order);
  });

  PRA.boot('orders', 'Orders', async function (host) {
    contentHost = host;
    filterStatus = PR.param('status') || '';
    host.innerHTML = '<div class="panel">' + PRA.skeleton(8) + '</div>';
    await loadAll();
    render(host);

    // Deep link from the dashboard: /admin/orders/?order=PR-2026-00001
    var target = PR.param('order');
    if (target) {
      var order = orders.find(function (o) { return o.order_number === target; });
      if (order) detail(order);
    }
  });
})();
