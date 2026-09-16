/* Customer account - a single order in full */
(function () {
  'use strict';
  var PR = window.PR;

  var STEPS = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

  function timeline(status) {
    if (status === 'cancelled') {
      return '<div class="form-message error" style="margin-top:12px">This order was cancelled. ' +
             'Please contact us if that is unexpected.</div>';
    }
    var reached = STEPS.indexOf(status);
    return '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px">' +
      STEPS.map(function (step, index) {
        var done = index <= reached;
        return '<div style="flex:1;min-width:92px;text-align:center;padding:10px 6px;border-radius:8px;' +
               'background:' + (done ? '#e7f6ed' : '#f4f4f4') + ';color:' + (done ? '#14663a' : '#999') + ';' +
               'font-size:12px;font-weight:800;text-transform:capitalize">' +
               (done ? '✓ ' : '') + step + '</div>';
      }).join('') + '</div>';
  }

  function render(order) {
    var items = order.order_items || [];
    document.getElementById('orderContent').innerHTML =
      '<nav class="breadcrumb" aria-label="Breadcrumb">' +
        '<a href="/">Home</a> / <a href="/account/orders/">My Orders</a> / ' +
        '<span aria-current="page">' + PR.esc(order.order_number) + '</span></nav>' +

      '<div class="cart-layout">' +
        '<div>' +
          '<div class="panel">' +
            '<div class="section-head" style="margin-bottom:6px">' +
              '<div><h1 style="margin:0;font-size:24px">' + PR.esc(order.order_number) + '</h1>' +
                '<p class="small-note" style="margin:4px 0 0">Placed ' + PR.formatDateTime(order.created_at) + '</p></div>' +
              '<div style="text-align:right">' +
                '<span class="pill ' + PR.esc(order.order_status) + '">' + PR.esc(order.order_status) + '</span> ' +
                '<span class="pill ' + PR.esc(order.payment_status) + '">' + PR.esc(order.payment_status) + '</span>' +
              '</div>' +
            '</div>' +
            timeline(order.order_status) +
            (order.tracking_number
              ? '<div class="order-summary" style="margin-top:16px"><b>Shipment</b>' +
                '<div class="summary-row"><span>Courier</span><b>' + PR.esc(order.courier_partner || '-') + '</b></div>' +
                '<div class="summary-row"><span>Tracking number</span><b>' + PR.esc(order.tracking_number) + '</b></div>' +
                '</div>'
              : '') +
          '</div>' +

          '<div class="panel">' +
            '<h2>Items</h2>' +
            '<div class="table-scroll"><table class="data-table"><thead><tr>' +
              '<th>Product</th><th>SKU</th><th>Qty</th><th>Unit Price</th><th>Total</th>' +
            '</tr></thead><tbody>' +
            items.map(function (item) {
              return '<tr><td>' + PR.esc(item.product_name) + '</td>' +
                '<td>' + PR.esc(item.product_sku || '-') + '</td>' +
                '<td>' + item.quantity + '</td>' +
                '<td>' + PR.money(item.unit_price) + '</td>' +
                '<td>' + PR.money(item.total_price) + '</td></tr>';
            }).join('') +
            '</tbody></table></div>' +
          '</div>' +
        '</div>' +

        '<aside>' +
          '<div class="panel">' +
            '<h2>Summary</h2>' +
            '<div class="summary-row"><span>Subtotal</span><b>' + PR.money(order.subtotal) + '</b></div>' +
            '<div class="summary-row"><span>Shipping</span><b>' +
              (Number(order.shipping_cost) > 0 ? PR.money(order.shipping_cost) : 'Free') + '</b></div>' +
            '<div class="summary-row total"><span>Total</span><span>' + PR.money(order.total_amount) + '</span></div>' +
            '<a class="btn orange block" href="/account/invoice/?id=' +
              encodeURIComponent(order.order_number) + '" style="margin-top:12px">VIEW INVOICE</a>' +
            '<a class="outline block" href="/account/orders/" style="margin-top:8px">BACK TO MY ORDERS</a>' +
          '</div>' +
          '<div class="panel">' +
            '<h2>Delivery Address</h2>' +
            '<p class="small-note" style="margin:0;line-height:1.8">' +
              '<b>' + PR.esc(order.customer_name) + '</b><br>' +
              PR.esc(order.address || '') + '<br>' +
              PR.esc([order.city, order.state, order.pincode].filter(Boolean).join(', ')) + '<br>' +
              '☎ ' + PR.esc(order.customer_mobile) +
            '</p>' +
          '</div>' +
          '<div class="panel">' +
            '<h2>Need help?</h2>' +
            '<a class="outline block" href="' + PR.esc(PR.whatsapp(
                'Hello PowerRun Industries, I have a question about order ' + order.order_number + '.')) +
              '" target="_blank" rel="noopener">WHATSAPP US</a>' +
            '<a class="outline block" href="/service/" style="margin-top:8px">RAISE A SERVICE REQUEST</a>' +
          '</div>' +
        '</aside>' +
      '</div>';
  }

  document.addEventListener('DOMContentLoaded', async function () {
    PR.mountLayout('');
    var session = await PR.account.requireSignIn();
    if (!session) return;

    var host = document.getElementById('orderContent');
    var orderNumber = PR.param('id');
    if (!orderNumber) {
      host.innerHTML = '<div class="empty-state"><h3>No order selected</h3>' +
        '<a class="btn orange" href="/account/orders/">My Orders</a></div>';
      return;
    }

    try {
      var order = await PR.account.loadOrder(orderNumber);
      if (!order) {
        // RLS returns nothing rather than an error when the order is not theirs.
        host.innerHTML = '<div class="empty-state"><h3>Order not found in your account</h3>' +
          '<p>If you placed it as a guest, add it to your account first.</p>' +
          '<a class="btn orange" href="/account/">ADD A GUEST ORDER</a></div>';
        return;
      }
      document.title = 'Order ' + order.order_number + ' | PowerRun Industries';
      render(order);
    } catch (err) {
      host.innerHTML = '<div class="empty-state"><h3>This order could not be loaded</h3>' +
        '<p>' + PR.esc(err.message) + '</p></div>';
      PR.toast(err.message, 'error');
    }
  });
})();
