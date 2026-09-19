/* Order tracking page */
(function () {
  'use strict';
  var PR = window.PR;

  var STEPS = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

  function timeline(status) {
    if (status === 'cancelled') {
      return '<p class="form-message error" style="margin-top:14px">This order was cancelled. ' +
             'Please contact us if this is unexpected.</p>';
    }
    var reached = STEPS.indexOf(status);
    return '<div class="table-scroll"><table class="data-table"><tbody>' +
      STEPS.map(function (step, index) {
        var done = index <= reached;
        return '<tr><td style="width:40px">' + (done ? '✅' : '⬜') + '</td>' +
               '<td style="text-transform:capitalize;font-weight:' + (done ? '800' : '400') + '">' +
               step + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function render(order) {
    document.getElementById('trackResult').innerHTML =
      '<div class="panel" style="margin-top:18px">' +
        '<h2>Order ' + PR.esc(order.order_number) + '</h2>' +
        '<div class="summary-row"><span>Customer</span><b>' + PR.esc(order.customer_name) + '</b></div>' +
        '<div class="summary-row"><span>Placed On</span><b>' + PR.formatDateTime(order.created_at) + '</b></div>' +
        '<div class="summary-row"><span>Order Status</span>' +
          '<span class="pill ' + PR.esc(order.order_status) + '">' + PR.esc(order.order_status) + '</span></div>' +
        '<div class="summary-row"><span>Payment Status</span>' +
          '<span class="pill ' + PR.esc(order.payment_status) + '">' + PR.esc(order.payment_status) + '</span></div>' +
        (order.tracking_number
          ? '<div class="summary-row"><span>Tracking</span><b>' + PR.esc(order.courier_partner || '') +
            ' ' + PR.esc(order.tracking_number) + '</b></div>'
          : '') +
        PR.orderBreakdownHtml(order) +
        '<h2 style="margin:22px 0 8px;font-size:17px">Progress</h2>' + timeline(order.order_status) +
        '<h2 style="margin:22px 0 8px;font-size:17px">Items</h2>' +
        '<div class="table-scroll"><table class="data-table"><thead><tr>' +
          '<th>Product</th><th>Qty</th><th>Total</th></tr></thead><tbody>' +
          (order.items || []).map(function (item) {
            return '<tr><td>' + PR.esc(item.product_name) + '</td><td>' + item.quantity +
                   '</td><td>' + PR.money(item.total_price) + '</td></tr>';
          }).join('') +
        '</tbody></table></div>' +
      '</div>';
  }

  async function submit(event) {
    event.preventDefault();
    var form = event.target;
    var button = document.getElementById('trackBtn');
    PR.clearFormError(form);

    var values = PR.validateForm(form, [
      { el: 'tr_order', name: 'order', label: 'Order ID', required: true },
      { el: 'tr_mobile', name: 'mobile', label: 'Mobile number', required: true, type: 'mobile' }
    ]);
    if (!values) return;

    PR.setBusy(button, true, 'SEARCHING…');
    document.getElementById('trackResult').innerHTML = '';
    try {
      var order = await PR.call('track order', function (sb) {
        return sb.rpc('get_order_public', { p_order_number: values.order, p_mobile: values.mobile });
      });
      PR.setBusy(button, false);
      render(order);
    } catch (err) {
      PR.setBusy(button, false);
      PR.showFormError(form, err.message);
      PR.toast(err.message, 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    PR.mountLayout('home');
    var preset = PR.param('order');
    if (preset) document.getElementById('tr_order').value = preset;
    document.getElementById('trackForm').addEventListener('submit', submit);
  });
})();
