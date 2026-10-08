/* Admin dashboard */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  function stat(label, value, cls, hint, href) {
    var inner = '<small>' + PR.esc(label) + '</small><strong>' + PR.esc(String(value)) + '</strong>' +
      (hint ? '<span class="hint">' + PR.esc(hint) + '</span>' : '');
    return href
      ? '<a class="stat ' + (cls || '') + '" href="' + href + '">' + inner + '</a>'
      : '<div class="stat ' + (cls || '') + '">' + inner + '</div>';
  }

  function renderStats(s) {
    return '' +
      '<div class="stat-group-title">Catalogue</div>' +
      '<div class="stats">' +
        stat('Total Products', s.total_products, 'accent', null, '/admin/products/') +
        stat('Active Products', s.active_products, 'good', null, '/admin/products/') +
        stat('Low Stock', s.low_stock, s.low_stock > 0 ? 'warn' : '', '5 units or fewer', '/admin/products/') +
        stat('Total Customers', s.total_customers, '', null, '/admin/customers/') +
      '</div>' +

      '<div class="stat-group-title">Orders</div>' +
      '<div class="stats">' +
        stat('Total Orders', s.total_orders, 'accent', null, '/admin/orders/') +
        stat('Pending', s.pending_orders, s.pending_orders > 0 ? 'warn' : '', 'Awaiting confirmation', '/admin/orders/?status=pending') +
        stat('Processing', s.processing_orders, '', null, '/admin/orders/?status=processing') +
        stat('Completed', s.completed_orders, 'good', 'Delivered', '/admin/orders/?status=delivered') +
      '</div>' +
      '<div class="stats" style="margin-top:14px">' +
        stat('Confirmed', s.confirmed_orders, '', null, '/admin/orders/?status=confirmed') +
        stat('Shipped', s.shipped_orders, '', null, '/admin/orders/?status=shipped') +
        stat('Cancelled', s.cancelled_orders, s.cancelled_orders > 0 ? 'bad' : '', null, '/admin/orders/?status=cancelled') +
        stat('Revenue (paid)', PR.money(s.revenue_paid), 'good', 'Verified payments only') +
      '</div>' +

      '<div class="stat-group-title">Support &amp; Channel</div>' +
      '<div class="stats">' +
        stat('Warranty Requests', s.warranty_requests, '', s.warranty_pending + ' pending', '/admin/warranty/') +
        stat('Service Requests', s.service_requests, '', s.service_open + ' open', '/admin/service/') +
        stat('Dealer Enquiries', s.dealer_enquiries, '', s.dealer_new + ' new', '/admin/dealers/') +
        stat('Contact Enquiries', s.leads, '', null, '/admin/customers/') +
      '</div>';
  }

  async function recentOrders() {
    var rows = await PR.call('load recent orders', function (sb) {
      return sb.from('orders')
        .select('id,order_number,customer_name,customer_mobile,total_amount,order_status,payment_status,created_at')
        .order('created_at', { ascending: false }).limit(8);
    });

    if (!rows || !rows.length) {
      return '<div class="panel"><h2>Recent Orders</h2>' +
        PRA.empty('No orders yet', 'Orders placed on powerrun.in will appear here immediately.') + '</div>';
    }

    return '<div class="panel">' +
      '<div class="panel-head"><h2>Recent Orders</h2>' +
        '<a class="btn ghost small" href="/admin/orders/">View all orders</a></div>' +
      '<div class="table-scroll"><table class="grid"><thead><tr>' +
        '<th>Order ID</th><th>Customer</th><th>Date</th><th>Amount</th><th>Payment</th><th>Status</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (order) {
        return '<tr>' +
          '<td class="nowrap"><b><a href="/admin/orders/?order=' + encodeURIComponent(order.order_number) + '">' +
            PR.esc(order.order_number) + '</a></b></td>' +
          '<td>' + PR.esc(order.customer_name) + '<small>' + PR.esc(order.customer_mobile) + '</small></td>' +
          '<td class="nowrap">' + PR.formatDate(order.created_at) + '</td>' +
          '<td class="nowrap">' + PR.money(order.total_amount) + '</td>' +
          '<td>' + PRA.pill(order.payment_status) + '</td>' +
          '<td>' + PRA.pill(order.order_status) + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div></div>';
  }

  /* Review Maango: most sales are offline (shop, phone), so there is no
   * website order to send a review link from. This box writes a WhatsApp
   * message with the Google review link for any customer's mobile. */
  function askReviewPanel() {
    var g = PR.config.GOOGLE_REVIEWS || {};
    if (!g.WRITE_URL) return '';
    return '<div class="panel">' +
      '<div class="panel-head"><h2>⭐ Review Maango</h2></div>' +
      '<p class="hint" style="margin:0 0 12px">Kisi bhi customer (dukaan, phone ya website) ko ' +
        'WhatsApp par Google review link aur referral offer bhejein.</p>' +
      '<form class="form" id="askReviewForm" novalidate>' +
        '<div class="form-grid three">' +
          '<label>Customer Name<input id="ar_name" maxlength="60" placeholder="Ramesh"></label>' +
          '<label>Mobile <span class="req">*</span><input id="ar_mobile" inputmode="numeric" maxlength="14" placeholder="98xxxxxxxx"></label>' +
          '<label>Product (optional)<input id="ar_product" maxlength="80" placeholder="E-rickshaw battery"></label>' +
        '</div>' +
        '<div class="page-actions" style="justify-content:flex-start">' +
          '<button class="btn" type="submit">WHATSAPP PAR BHEJEIN</button>' +
          '<span class="hint" id="ar_msg"></span>' +
        '</div>' +
      '</form></div>';
  }

  function askReviewText(name, product) {
    var first = (name || '').trim().split(' ')[0];
    return 'Namaste' + (first ? ' ' + first + ' ji' : '') + ', PowerRun Industries se ' +
      (product ? product : 'khareedari') + ' ke liye dhanyavaad! 🙏\n\n' +
      'Aapka anubhav kaisa raha? 1 minute nikaal kar Google par review zaroor dein, ' +
      'isse doosre logon ko sahi product chunne mein madad milti hai:\n' +
      PR.config.GOOGLE_REVIEWS.WRITE_URL + PRA.referralLine();
  }

  function bindAskReview() {
    var form = document.getElementById('askReviewForm');
    if (!form) return;
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var mobile = document.getElementById('ar_mobile');
      var msg = document.getElementById('ar_msg');
      var link = PR.whatsappTo(mobile.value, askReviewText(
        document.getElementById('ar_name').value, document.getElementById('ar_product').value.trim()));
      if (!link) {
        mobile.setAttribute('aria-invalid', 'true');
        msg.textContent = '10 digit mobile number daalein.';
        return;
      }
      mobile.removeAttribute('aria-invalid');
      msg.textContent = '';
      window.open(link, '_blank', 'noopener');
      form.reset();
    });
  }

  async function lowStock() {
    var rows = await PR.call('load low stock', function (sb) {
      return sb.from('products').select('id,name,sku,stock,price,availability')
        .eq('is_active', true).lte('stock', 5)
        .order('stock', { ascending: true }).limit(8);
    });
    if (!rows || !rows.length) return '';

    return '<div class="panel">' +
      '<div class="panel-head"><h2>Low Stock</h2>' +
        '<a class="btn ghost small" href="/admin/products/">Manage products</a></div>' +
      '<div class="table-scroll"><table class="grid"><thead><tr>' +
        '<th>Product</th><th>SKU</th><th>Stock</th><th>Availability</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (p) {
        return '<tr><td><b>' + PR.esc(p.name) + '</b></td>' +
          '<td class="nowrap">' + PR.esc(p.sku || '-') + '</td>' +
          '<td><b style="color:' + (p.stock > 0 ? '#96590a' : '#b3261e') + '">' + (p.stock || 0) + '</b></td>' +
          '<td>' + PRA.pill(p.availability) + '</td></tr>';
      }).join('') +
      '</tbody></table></div></div>';
  }

  PRA.boot('dashboard', 'Dashboard', async function (host) {
    host.innerHTML = '<div class="panel">' + PRA.skeleton(4) + '</div>';

    var stats = await PR.call('load dashboard stats', function (sb) {
      return sb.rpc('admin_dashboard_stats');
    });

    var parts = await Promise.all([recentOrders(), lowStock()]);
    host.innerHTML = renderStats(stats) + '<div style="margin-top:22px"></div>' +
      askReviewPanel() + parts.join('');
    bindAskReview();
  });
})();
