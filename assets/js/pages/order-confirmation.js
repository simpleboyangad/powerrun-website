/* Order confirmation page.
 * The order is re-read from the database, so this page can never show a
 * "success" message for an order that does not actually exist.
 */
(function () {
  'use strict';
  var PR = window.PR;

  function stored() {
    try {
      return JSON.parse(sessionStorage.getItem('pr_last_order') || 'null');
    } catch (err) { return null; }
  }

  function renderOrder(order) {
    var host = document.getElementById('confirmContent');
    var paid = order.payment_status === 'paid';

    var waText = ['Hello PowerRun Industries, I have placed an order.',
      'Order ID: ' + order.order_number,
      'Name: ' + order.customer_name,
      'Mobile: ' + order.customer_mobile]
      .concat((order.items || []).map(function (item) {
        return item.product_name + ' x ' + item.quantity;
      })).join('\n');

    host.innerHTML =
      '<div class="success-box">' +
        '<div class="success-icon">✓</div>' +
        '<h1 style="margin:0 0 6px">Order Placed Successfully!</h1>' +
        '<p class="small-note">Thank you for your order. We have received it and will contact you shortly.</p>' +
        '<div class="order-id-box"><small>ORDER ID</small>' +
          '<div class="value">' + PR.esc(order.order_number) + '</div></div>' +
      '</div>' +

      '<div class="summary-row"><span>Customer Name</span><b>' + PR.esc(order.customer_name) + '</b></div>' +
      '<div class="summary-row"><span>Mobile</span><b>' + PR.esc(order.customer_mobile) + '</b></div>' +
      (order.customer_email ? '<div class="summary-row"><span>Email</span><b>' + PR.esc(order.customer_email) + '</b></div>' : '') +
      '<div class="summary-row"><span>Delivery Address</span><b style="text-align:right;max-width:60%">' +
        PR.esc([order.address, order.city, order.state, order.pincode].filter(Boolean).join(', ')) + '</b></div>' +
      '<div class="summary-row"><span>Order Status</span>' +
        '<span class="pill ' + PR.esc(order.order_status) + '">' + PR.esc(order.order_status) + '</span></div>' +
      '<div class="summary-row"><span>Payment Status</span>' +
        '<span class="pill ' + PR.esc(order.payment_status) + '">' + PR.esc(order.payment_status) + '</span></div>' +
      '<div class="summary-row"><span>Placed On</span><b>' + PR.formatDateTime(order.created_at) + '</b></div>' +

      '<h2 style="margin:24px 0 8px;font-size:18px">Items</h2>' +
      '<div class="table-scroll"><table class="data-table"><thead><tr>' +
        '<th>Product</th><th>SKU</th><th>Qty</th><th>Unit Price</th><th>Total</th>' +
      '</tr></thead><tbody>' +
      (order.items || []).map(function (item) {
        return '<tr><td>' + PR.esc(item.product_name) + '</td>' +
               '<td>' + PR.esc(item.product_sku || '-') + '</td>' +
               '<td>' + item.quantity + '</td>' +
               '<td>' + PR.money(item.unit_price) + '</td>' +
               '<td>' + PR.money(item.total_price) + '</td></tr>';
      }).join('') +
      '</tbody></table></div>' +

      '<div class="summary-row" style="margin-top:12px"><span>Subtotal</span><b>' + PR.money(order.subtotal) + '</b></div>' +
      '<div class="summary-row"><span>Shipping</span><b>' +
        (Number(order.shipping_cost) > 0 ? PR.money(order.shipping_cost) : 'Free') + '</b></div>' +
      '<div class="summary-row total"><span>Total Amount</span><span>' + PR.money(order.total_amount) + '</span></div>' +

      '<p class="small-note" style="margin-top:18px"><b>What happens next?</b> ' +
        (paid
          ? 'Your payment is confirmed. We will pack and dispatch your order and share tracking details.'
          : 'Our team will call you within 24 hours to confirm payment and delivery.') +
        ' Please keep your Order ID for reference.</p>' +

      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">' +
        '<a class="btn orange" href="/products/">CONTINUE SHOPPING</a>' +
        '<a class="outline" href="/track-order/?order=' + encodeURIComponent(order.order_number) + '">VIEW ORDER</a>' +
        '<a class="outline" href="' + PR.esc(PR.whatsapp(waText)) + '" target="_blank" rel="noopener">SEND ON WHATSAPP</a>' +
      '</div>';
  }

  function askForMobile(orderNumber) {
    var host = document.getElementById('confirmContent');
    host.innerHTML =
      '<h1 style="margin-top:0">Your order</h1>' +
      '<p class="small-note">Enter the mobile number used for order <b>' + PR.esc(orderNumber) +
      '</b> to view its details.</p>' +
      '<form class="form" id="lookupForm" novalidate>' +
        '<label>Mobile Number <span class="req">*</span>' +
          '<input id="oc_mobile" required inputmode="numeric" maxlength="10" style="max-width:260px"></label>' +
        '<button class="btn orange" id="lookupBtn" type="submit" style="max-width:260px">VIEW ORDER</button>' +
      '</form>';

    document.getElementById('lookupForm').addEventListener('submit', async function (event) {
      event.preventDefault();
      var button = document.getElementById('lookupBtn');
      var values = PR.validateForm(event.target, [
        { el: 'oc_mobile', name: 'mobile', label: 'Mobile number', required: true, type: 'mobile' }
      ]);
      if (!values) return;
      PR.setBusy(button, true, 'LOADING…');
      try {
        await show(orderNumber, values.mobile);
      } catch (err) {
        PR.setBusy(button, false);
        PR.showFormError(event.target, err.message);
      }
    });
  }

  async function show(orderNumber, mobile) {
    var order = await PR.call('load order', function (sb) {
      return sb.rpc('get_order_public', { p_order_number: orderNumber, p_mobile: mobile });
    });
    renderOrder(order);
  }

  async function init() {
    PR.mountLayout('products');
    var host = document.getElementById('confirmContent');
    var orderNumber = PR.param('order');
    var saved = stored();

    if (!orderNumber && saved) orderNumber = saved.order;

    if (!orderNumber) {
      host.innerHTML = '<div class="empty-state"><h3>No order to show</h3>' +
        '<p>If you have an order ID you can look it up on the tracking page.</p>' +
        '<a class="btn orange" href="/track-order/">Track an order</a></div>';
      return;
    }

    var mobile = saved && saved.order === orderNumber ? saved.mobile : null;
    if (!mobile) { askForMobile(orderNumber); return; }

    try {
      await show(orderNumber, mobile);
    } catch (err) {
      console.error('[PowerRun] order confirmation failed:', err);
      askForMobile(orderNumber);
      PR.toast(err.message, 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
