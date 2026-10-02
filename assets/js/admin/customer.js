/* Admin - CRM customer profile */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var customerId = null;
  var customer = null;
  var host = null;
  var state = { tab: 'overview' };
  var cache = {};

  var TABS = [
    ['overview', 'Overview'], ['orders', 'Orders'], ['quotations', 'Quotations'], ['warranty', 'Warranty'],
    ['service', 'Service'], ['leads', 'Leads'], ['followups', 'Follow-ups']
  ];

  async function loadCustomer() {
    var rows = await PR.call('load customer', function (sb) {
      return sb.from('customers').select('*').eq('id', customerId).limit(1);
    });
    return rows && rows.length ? rows[0] : null;
  }

  async function overviewTab() {
    if (!cache.overview) {
      var counts = await Promise.all([
        PR.call('count open service', function (sb) {
          return sb.from('service_tickets').select('id')
            .eq('customer_id', customerId).in('status', ['open', 'in_progress']);
        }),
        PR.call('count active warranty', function (sb) {
          return sb.from('warranties').select('id')
            .eq('customer_id', customerId).eq('status', 'approved');
        }),
        PR.call('count pending followups', function (sb) {
          return sb.from('follow_ups').select('id')
            .eq('customer_id', customerId).eq('status', 'pending');
        })
      ]);
      cache.overview = {
        openService: (counts[0] || []).length,
        activeWarranty: (counts[1] || []).length,
        pendingFollowups: (counts[2] || []).length
      };
    }
    var c = customer;
    var o = cache.overview;
    return '<div class="form-grid">' +
      '<div><b style="font-size:12px;color:#6d6d6d">CONTACT</b>' +
        '<p style="margin:6px 0 0;line-height:1.8">' +
          '<b>' + PR.esc(c.name || '-') + '</b><br>' +
          '☎ <a href="tel:' + PR.esc(c.mobile) + '">' + PR.esc(c.mobile || '-') + '</a><br>' +
          (c.email ? '✉ <a href="mailto:' + PR.esc(c.email) + '">' + PR.esc(c.email) + '</a><br>' : '') +
          PR.esc([c.address, c.city, c.state, c.pincode].filter(Boolean).join(', ') || '-') +
        '</p></div>' +
      '<div><b style="font-size:12px;color:#6d6d6d">ACCOUNT</b>' +
        '<p style="margin:6px 0 0;line-height:1.8">' +
          'Customer since ' + PR.formatDate(c.created_at) + '<br>' +
          'Total Orders: <b>' + (c.total_orders || 0) + '</b><br>' +
          'Total Spent: <b>' + PR.money(c.total_spent || 0) + '</b><br>' +
          'Loyalty Points: ' + (c.loyalty_points || 0) +
        '</p></div>' +
    '</div>' +
    '<div class="stats" style="margin-top:18px">' +
      '<div class="stat ' + (o.openService > 0 ? 'warn' : '') + '"><small>Open Service</small><strong>' + o.openService + '</strong></div>' +
      '<div class="stat good"><small>Active Warranty</small><strong>' + o.activeWarranty + '</strong></div>' +
      '<div class="stat ' + (o.pendingFollowups > 0 ? 'warn' : '') + '"><small>Pending Follow-ups</small><strong>' + o.pendingFollowups + '</strong></div>' +
    '</div>';
  }

  async function ordersTab() {
    if (!cache.orders) {
      cache.orders = await PR.call('load customer orders', function (sb) {
        return sb.from('orders')
          .select('id,order_number,total_amount,order_status,payment_status,created_at,' +
                  'order_items(id,product_name,product_sku,quantity,unit_price,total_price)')
          .eq('customer_id', customerId).order('created_at', { ascending: false });
      });
    }
    var rows = cache.orders;
    if (!rows.length) return PRA.empty('No orders yet', 'Orders placed by this customer will appear here.');
    return rows.map(function (order) {
      var items = order.order_items || [];
      return '<div class="panel" style="margin-bottom:12px">' +
        '<div class="panel-head" style="margin-bottom:8px">' +
          '<div><b>' + PR.esc(order.order_number) + '</b>' +
            '<div class="hint">' + PR.formatDate(order.created_at) + ' · ' + PR.money(order.total_amount) + '</div></div>' +
          '<div>' + PRA.pill(order.order_status) + ' ' + PRA.pill(order.payment_status) + '</div>' +
        '</div>' +
        (items.length
          ? '<div class="table-scroll"><table class="grid"><thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Amount</th></tr></thead><tbody>' +
            items.map(function (it) {
              return '<tr><td>' + PR.esc(it.product_name) + '</td><td class="nowrap">' + PR.esc(it.product_sku || '-') +
                '</td><td>' + it.quantity + '</td><td class="nowrap">' + PR.money(it.total_price) + '</td></tr>';
            }).join('') + '</tbody></table></div>'
          : '') +
        '<div class="page-actions" style="justify-content:flex-end;margin-top:8px">' +
          '<a class="btn ghost small" href="/admin/orders/?order=' + encodeURIComponent(order.order_number) + '">Open Order</a>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  async function quotationsTab() {
    if (!cache.quotations) {
      cache.quotations = await PR.call('load customer quotations', function (sb) {
        return sb.from('quotations').select('id,quote_number,status,total_amount,created_at,converted_order_id')
          .eq('customer_id', customerId).order('created_at', { ascending: false });
      });
    }
    var rows = cache.quotations;
    if (!rows.length) return PRA.empty('No quotations yet', '');
    return '<div class="table-scroll"><table class="grid"><thead><tr>' +
      '<th>Quote #</th><th>Date</th><th>Total</th><th>Status</th><th></th>' +
    '</tr></thead><tbody>' + rows.map(function (q) {
      return '<tr><td class="nowrap">' + PR.esc(q.quote_number || '-') + '</td>' +
        '<td class="nowrap">' + PR.formatDate(q.created_at) + '</td>' +
        '<td class="nowrap">' + PR.money(q.total_amount) + '</td>' +
        '<td>' + PRA.pill(q.status) + (q.converted_order_id ? ' <small>Converted</small>' : '') + '</td>' +
        '<td class="nowrap"><a class="btn ghost small" href="/admin/quotations/?id=' + encodeURIComponent(q.id) + '">Open</a></td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  async function warrantyTab() {
    if (!cache.warranty) {
      cache.warranty = await PR.call('load customer warranties', function (sb) {
        return sb.from('warranties').select('*').eq('customer_id', customerId).order('created_at', { ascending: false });
      });
    }
    var rows = cache.warranty;
    if (!rows.length) return PRA.empty('No warranty registrations', '');
    return '<div class="table-scroll"><table class="grid"><thead><tr>' +
      '<th>Warranty ID</th><th>Product</th><th>Serial</th><th>Valid Until</th><th>Status</th>' +
    '</tr></thead><tbody>' + rows.map(function (w) {
      return '<tr><td class="nowrap">' + PR.esc(w.warranty_number || '-') + '</td>' +
        '<td>' + PR.esc(w.product_name || '-') + '</td>' +
        '<td>' + PR.esc(w.serial_number || '-') + '</td>' +
        '<td class="nowrap">' + PR.formatDate(w.warranty_end_date) + '</td>' +
        '<td>' + PRA.pill(w.status) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  async function serviceTab() {
    if (!cache.service) {
      cache.service = await PR.call('load customer service tickets', function (sb) {
        return sb.from('service_tickets').select('*').eq('customer_id', customerId).order('created_at', { ascending: false });
      });
    }
    var rows = cache.service;
    if (!rows.length) return PRA.empty('No service requests', '');
    return '<div class="table-scroll"><table class="grid"><thead><tr>' +
      '<th>Ticket ID</th><th>Product</th><th>Issue</th><th>Received</th><th>Status</th>' +
    '</tr></thead><tbody>' + rows.map(function (t) {
      return '<tr><td class="nowrap">' + PR.esc(t.ticket_number || '-') + '</td>' +
        '<td>' + PR.esc(t.product_name || '-') + '</td>' +
        '<td>' + PR.esc((t.issue_description || '').slice(0, 60)) + '</td>' +
        '<td class="nowrap">' + PR.formatDate(t.created_at) + '</td>' +
        '<td>' + PRA.pill(t.status) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  async function leadsTab() {
    if (!cache.leads) {
      cache.leads = await PR.call('load customer leads', function (sb) {
        return sb.from('leads').select('*').eq('customer_id', customerId).order('created_at', { ascending: false });
      });
    }
    var rows = cache.leads;
    if (!rows.length) return PRA.empty('No leads', 'Enquiries linked to this customer appear here.');
    return '<div class="table-scroll"><table class="grid"><thead><tr>' +
      '<th>Source</th><th>Message</th><th>Received</th><th>Status</th>' +
    '</tr></thead><tbody>' + rows.map(function (l) {
      return '<tr><td>' + PR.esc(l.source) + '</td>' +
        '<td>' + PR.esc((l.message || '-').slice(0, 60)) + '</td>' +
        '<td class="nowrap">' + PR.formatDate(l.created_at) + '</td>' +
        '<td>' + PRA.pill(l.status) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  async function followupsTab() {
    if (!cache.followups) {
      var leadIds = (cache.leads || await PR.call('load customer leads for followups', function (sb) {
        return sb.from('leads').select('id').eq('customer_id', customerId);
      })).map(function (l) { return l.id; });

      var queries = [
        PR.call('load customer followups', function (sb) {
          return sb.from('follow_ups').select('*').eq('customer_id', customerId);
        })
      ];
      if (leadIds.length) {
        queries.push(PR.call('load lead followups', function (sb) {
          return sb.from('follow_ups').select('*').in('lead_id', leadIds);
        }));
      }
      var results = await Promise.all(queries);
      cache.followups = results[0].concat(results[1] || [])
        .sort(function (a, b) { return new Date(b.due_at) - new Date(a.due_at); });
    }
    var rows = cache.followups;
    if (!rows.length) return PRA.empty('No follow-ups', '') +
      '<p style="margin-top:10px"><a class="btn ghost small" href="/admin/followups/?customer=' + encodeURIComponent(customerId) + '">+ Schedule one</a></p>';
    return '<p style="margin-bottom:10px"><a class="btn ghost small" href="/admin/followups/?customer=' + encodeURIComponent(customerId) + '">+ Schedule one</a></p>' +
      '<div class="table-scroll"><table class="grid"><thead><tr>' +
      '<th>Title</th><th>Due</th><th>Status</th>' +
    '</tr></thead><tbody>' + rows.map(function (f) {
      return '<tr><td>' + PR.esc(f.title) + '</td>' +
        '<td class="nowrap">' + PR.formatDateTime(f.due_at) + '</td>' +
        '<td>' + PRA.pill(f.status) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  var TAB_FN = {
    overview: overviewTab, orders: ordersTab, quotations: quotationsTab, warranty: warrantyTab,
    service: serviceTab, leads: leadsTab, followups: followupsTab
  };

  async function render() {
    host.innerHTML =
      '<div class="panel" style="margin-bottom:16px"><div class="panel-head">' +
        '<h2>' + PR.esc(customer.name || 'Customer') + '</h2>' +
        '<a class="btn ghost small" href="/admin/customers/">Back to Customers</a></div></div>' +
      '<div class="tabs-row">' + TABS.map(function (t) {
        return '<button class="tab-btn' + (state.tab === t[0] ? ' active' : '') + '" type="button" data-tab="' +
          t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="panel" id="customerTabBody">' + PRA.skeleton(4) + '</div>';

    host.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () { state.tab = btn.getAttribute('data-tab'); render(); });
    });

    var body = document.getElementById('customerTabBody');
    try {
      body.innerHTML = await TAB_FN[state.tab]();
    } catch (err) {
      body.innerHTML = PRA.errorPanel(err.message);
    }
  }

  PRA.boot('customers', 'Customer Profile', async function (contentHost) {
    host = contentHost;
    customerId = PR.param('id');
    if (!customerId) {
      host.innerHTML = PRA.errorPanel('No customer selected.');
      return;
    }
    host.innerHTML = '<div class="panel">' + PRA.skeleton(6) + '</div>';
    customer = await loadCustomer();
    if (!customer) {
      host.innerHTML = PRA.errorPanel('Customer not found.');
      return;
    }
    await render();
  });
})();
