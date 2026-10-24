/* Admin - order management */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var ORDER_STATUSES = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];
  var PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];

  var orders = [];
  var contentHost = null;
  var filterStatus = '';

  async function loadAll() {
    orders = await PR.call('load orders', function (sb) {
      return sb.from('orders')
        .select('*, order_items(id,product_id,product_name,product_sku,hsn_code,quantity,unit_price,total_price,mrp,gst_rate,taxable_amount,gst_amount,products(warranty))')
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
            ORDER_STATUSES.concat(['processing']).map(function (s) {
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
      '<td>' + PR.esc(order.customer_name || '-') +
        (order.customer_gstin ? ' <small class="pill" title="GST invoice requested">GST</small>' : '') + '</td>' +
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
    var customerWa = PR.whatsappTo(order.customer_mobile,
      'Hello ' + (order.customer_name || '') + ', this is PowerRun Industries regarding your order ' +
      order.order_number + '.');
    // Only delivered orders can be reviewed (get_review_request enforces it too).
    var reviewWa = order.order_status === 'delivered' && order.review_token
      ? PR.whatsappTo(order.customer_mobile,
          'Namaste ' + (order.customer_name || '').split(' ')[0] + ' ji, PowerRun Industries se order ' +
          order.order_number + ' lene ke liye dhanyavaad! 🙏\n\n' +
          'Product kaisa laga? 1 minute nikaal kar apna review zaroor dein, isse doosre customers ki madad hogi:\n' +
          PR.config.SITE_URL + '/review/?t=' + order.review_token +
          (PR.config.GOOGLE_REVIEWS && PR.config.GOOGLE_REVIEWS.WRITE_URL
            ? '\n\nGoogle par bhi 5 ⭐ dein to bahut madad hogi:\n' + PR.config.GOOGLE_REVIEWS.WRITE_URL
            : '') +
          PRA.referralLine())
      : '';
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
            (order.customer_gstin
              ? '<br><span class="pill" style="background:#e7f6ed;color:#14663a">GST BILL</span> ' +
                '<b>' + PR.esc(order.customer_business_name || '') + '</b><br>GSTIN: <b>' +
                PR.esc(order.customer_gstin) + '</b>'
              : '') +
          '</p></div>' +
        '<div><b style="font-size:12px;color:#6d6d6d">BILLING ADDRESS</b>' +
          '<p style="margin:6px 0 0;line-height:1.7">' +
            PR.esc(order.address || '-') + '<br>' +
            PR.esc([order.city, order.state, order.pincode].filter(Boolean).join(', ')) +
          '</p>' +
          '<b style="font-size:12px;color:#6d6d6d;display:block;margin-top:10px">SHIPPING / DELIVERY ADDRESS</b>' +
          '<p style="margin:6px 0 0;line-height:1.7">' +
            PR.esc(order.shipping_address || order.address || '-') + '<br>' +
            PR.esc([order.shipping_city || order.city, order.shipping_state || order.state,
                    order.shipping_pincode || order.pincode].filter(Boolean).join(', ')) +
          '</p></div>' +
      '</div>' +

      '<div class="table-scroll" style="margin-top:18px"><table class="grid"><thead><tr>' +
        '<th>Product</th><th>SKU</th><th>Qty</th><th>Unit Price</th><th>Total</th>' +
      '</tr></thead><tbody>' +
      items.map(function (item) {
        return '<tr><td><b>' + PR.itemName(item) + '</b></td>' +
          '<td class="nowrap">' + PR.esc(item.product_sku || '-') + '</td>' +
          '<td>' + item.quantity + '</td>' +
          '<td class="nowrap">' + PR.money(item.unit_price) + '</td>' +
          '<td class="nowrap">' + PR.money(item.total_price) + '</td></tr>';
      }).join('') +
      '</tbody></table></div>' +

      '<div id="serialBox"></div>' +

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

      '<div class="page-actions" style="margin-top:16px;padding:12px;border:1px solid #eef0f3;border-radius:10px;align-items:center">' +
        '<b style="font-size:12px;color:#6d6d6d;margin-right:auto">INVOICE' +
          (order.invoice_number
            ? ' · <span style="color:#14663a">' + PR.esc(order.invoice_number) + ' (' + PR.formatDate(order.invoice_date) + ')</span>'
            : ' · not issued yet') + '</b>' +
        '<a class="btn gray small" href="/admin/invoice/?type=proforma&id=' + encodeURIComponent(order.id) +
          '" target="_blank" rel="noopener" title="Advance payment / approval ke liye">Proforma Invoice</a>' +
        (order.order_status === 'cancelled' && !order.invoice_number
          ? ''
          : '<button class="btn small" type="button" id="taxInvoiceBtn">' +
              (order.invoice_number ? 'Print Tax Invoice' : 'Issue Tax Invoice') + '</button>') +
        (order.invoice_number
          ? ' <a class="btn gray small" href="/admin/credit-notes/?type=order&amp;id=' + encodeURIComponent(order.id) +
              '" title="Cancel / return / discount ke baad GST credit note">Credit Note</a>'
          : '') +
      '</div>' +

      '<div class="hint" style="margin-top:12px">' +
        'Placed ' + PR.formatDateTime(order.created_at) +
        ' · Payment method: ' + PR.esc(order.payment_method || '-') +
        (order.razorpay_payment_id ? ' · Razorpay payment ' + PR.esc(order.razorpay_payment_id) : '') +
      '</div>' +

      '<form class="form" id="orderUpdateForm" style="margin-top:20px;border-top:1px solid #eef0f3;padding-top:18px">' +
        '<div class="form-grid">' +
          '<label>Order Status<select id="od_status">' +
            (ORDER_STATUSES.indexOf(order.order_status) < 0 ? [order.order_status] : []).concat(ORDER_STATUSES).map(function (s) {
              return '<option value="' + s + '"' + (order.order_status === s ? ' selected' : '') + '>' +
                s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
            }).join('') +
          '</select>' +
            '<span class="hint">Packed: battery/inverter ke serial pehle save karein. Shipped: courier ka naam zaroori.</span>' +
          '</label>' +
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
        '<label style="display:flex;gap:8px;align-items:center;flex-direction:row;font-weight:400">' +
          '<input type="checkbox" id="od_test" style="width:auto"' + (order.is_test ? ' checked' : '') + '> ' +
          'Test order (Reports mein nahi ginega)</label>' +
        '<label>Internal Notes<textarea id="od_notes" maxlength="1000">' +
          PR.esc(order.notes || '') + '</textarea></label>' +
        '<div class="page-actions" style="justify-content:flex-end">' +
          (customerWa
            ? '<a class="btn gray" href="' + PR.esc(customerWa) + '" target="_blank" rel="noopener">WhatsApp Customer</a>'
            : '') +
          (reviewWa
            ? '<a class="btn gray" href="' + PR.esc(reviewWa) + '" target="_blank" rel="noopener" ' +
                'title="Customer ko review link bhejein">⭐ Review Link Bhejein</a>'
            : '') +
          '<button class="btn" type="submit" id="saveOrderBtn">SAVE ORDER</button>' +
        '</div>' +
      '</form>' +
      '<div id="timelineBox"></div>');

    loadSerials(order);
    loadTimeline(order);
    document.getElementById('orderUpdateForm').addEventListener('submit', function (event) {
      saveOrder(event, order);
    });
    var taxBtn = document.getElementById('taxInvoiceBtn');
    if (taxBtn) taxBtn.addEventListener('click', function () { taxInvoice(order, taxBtn); });
  }

  /* Warranty products need one serial number per unit before the order can be packed. */
  function needsSerial(item) {
    var w = item.products && item.products.warranty;
    return !!(w && String(w).trim() && !/^\s*no\s+warranty/i.test(w));
  }

  async function loadSerials(order) {
    var box = document.getElementById('serialBox');
    var items = (order.order_items || []).filter(needsSerial);
    if (!box || !items.length) return;
    var saved;
    try {
      saved = await PR.call('load serials', function (sb) {
        return sb.from('order_serials').select('order_item_id,serial_number,warranty_id').eq('order_id', order.id).order('created_at');
      }) || [];
    } catch (err) {
      return;   // serials not available (older database) - the rest of the drawer still works
    }
    var locked = order.order_status === 'delivered' || order.order_status === 'cancelled';
    box.innerHTML =
      '<div style="margin-top:16px;padding:12px;border:1px solid #eef0f3;border-radius:10px">' +
        '<b style="font-size:12px;color:#6d6d6d">SERIAL NUMBERS (warranty ke liye)</b>' +
        items.map(function (item) {
          var mine = saved.filter(function (x) { return x.order_item_id === item.id; });
          var inputs = '';
          for (var i = 0; i < item.quantity; i++) {
            inputs += '<input class="od-serial" data-item="' + PR.esc(item.id) + '" maxlength="60" autocapitalize="characters" ' +
              'placeholder="Unit ' + (i + 1) + ' serial" value="' + PR.esc(mine[i] ? mine[i].serial_number : '') + '"' +
              (locked ? ' disabled' : '') + '>';
          }
          return '<div style="margin-top:10px"><div style="font-size:13px;font-weight:700">' + PR.esc(item.product_name) +
            ' <small>(' + mine.length + '/' + item.quantity + ')</small></div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:6px;margin-top:6px">' +
            inputs + '</div></div>';
        }).join('') +
        (locked
          ? (order.order_status === 'delivered' ? '<p class="hint">Delivery par warranty apne aap register ho gayi.</p>' : '')
          : '<div class="page-actions" style="justify-content:flex-end;margin-top:10px">' +
              '<button class="btn small" type="button" id="saveSerialsBtn">SAVE SERIALS</button></div>') +
      '</div>';
    var btn = document.getElementById('saveSerialsBtn');
    if (btn) btn.addEventListener('click', async function () {
      var list = Array.prototype.map.call(box.querySelectorAll('.od-serial'), function (el) {
        return { order_item_id: el.getAttribute('data-item'), serial_number: el.value.trim() };
      }).filter(function (x) { return x.serial_number; });
      PR.setBusy(btn, true, 'SAVING…');
      try {
        var n = await PR.call('save serials', function (sb) {
          return sb.rpc('admin_save_order_serials', { p_order_id: order.id, p_serials: list });
        });
        PR.toast(n + ' serial number saved.', 'success');
        loadSerials(order);
      } catch (err) {
        PR.setBusy(btn, false);
        PR.toast(err.message, 'error');
      }
    });
  }

  async function loadTimeline(order) {
    var box = document.getElementById('timelineBox');
    if (!box) return;
    var rows;
    try {
      rows = await PR.call('load timeline', function (sb) {
        return sb.from('delivery_timeline').select('status,status_date,description').eq('order_id', order.id).order('status_date');
      }) || [];
    } catch (err) {
      return;
    }
    if (!rows.length) return;
    box.innerHTML = '<div style="margin-top:16px"><b style="font-size:12px;color:#6d6d6d">TIMELINE</b>' +
      rows.map(function (r) {
        return '<div style="display:flex;gap:10px;font-size:13px;margin-top:6px"><span class="nowrap" style="color:#6d6d6d">' +
          PR.formatDateTime(r.status_date + (/[zZ+]/.test(String(r.status_date).slice(19)) ? '' : 'Z')) + '</span><span>' +
          PR.esc(r.description || r.status) + '</span></div>';
      }).join('') + '</div>';
  }

  /* The invoice number is permanent: once issued it can't be reused or
     deleted (GST needs a continuous series), so ask before the first issue. */
  async function taxInvoice(order, button) {
    var url = '/admin/invoice/?type=tax&id=' + encodeURIComponent(order.id);
    if (order.invoice_number) { window.open(url, '_blank', 'noopener'); return; }
    if (!confirm('Issue a GST tax invoice for order ' + order.order_number + '?\n\n' +
                 'The next invoice number will be used permanently. Check the customer details, ' +
                 'GSTIN and HSN codes first. Usually issue it when the goods are dispatched.')) return;
    // open the tab now (still inside the click) so pop-up blockers allow it
    var tab = window.open('', '_blank');
    PR.setBusy(button, true, 'ISSUING…');
    try {
      var result = await PR.call('issue tax invoice', function (sb) {
        return sb.rpc('issue_tax_invoice', { p_order_id: order.id });
      });
      order.invoice_number = result.invoice_number;
      order.invoice_date = result.invoice_date;
      PR.toast('Tax invoice ' + result.invoice_number + ' issued.', 'success');
      if (tab) tab.location.href = url; else window.location.href = url;
      await refresh();
      detail(orders.find(function (o) { return o.id === order.id; }) || order);
    } catch (err) {
      if (tab) tab.close();
      PR.setBusy(button, false);
      PR.toast(err.message, 'error');
    }
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
    var testBox = document.getElementById('od_test');
    if (testBox && 'is_test' in order) payload.is_test = testBox.checked;

    PR.setBusy(button, true, 'SAVING…');
    try {
      await PR.call('update order', function (sb) {
        return sb.from('orders').update(payload).eq('id', order.id);
      });
      PRA.closeDrawer();
      PR.toast('Order ' + order.order_number + ' updated.', 'success');
      if (status === 'cancelled' && order.order_status !== 'cancelled' && order.invoice_number &&
          confirm('Is order ka Tax Invoice ' + order.invoice_number + ' ban chuka tha. GST ke liye Credit Note banana zaroori hai. Abhi banayein?')) {
        window.location.href = '/admin/credit-notes/?type=order&id=' + encodeURIComponent(order.id);
        return;
      }
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
