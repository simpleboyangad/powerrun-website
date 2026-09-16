/* Customer account - my orders */
(function () {
  'use strict';
  var PR = window.PR;

  function nav(active) {
    return '<div class="tabs" style="margin-bottom:22px">' +
      '<a class="tab' + (active === 'orders' ? ' active' : '') + '" href="/account/orders/">MY ORDERS</a>' +
      '<a class="tab' + (active === 'profile' ? ' active' : '') + '" href="/account/profile/">MY DETAILS</a>' +
      '<a class="tab" href="/account/">ACCOUNT</a>' +
    '</div>';
  }
  PR.accountNav = nav;

  function itemCount(order) {
    return (order.order_items || []).reduce(function (sum, item) {
      return sum + Number(item.quantity || 0);
    }, 0);
  }

  function card(order) {
    var items = order.order_items || [];
    return '<div class="panel" style="margin-bottom:16px">' +
      '<div class="section-head" style="margin-bottom:12px">' +
        '<div>' +
          '<b style="font-size:17px">' + PR.esc(order.order_number) + '</b>' +
          '<div class="small-note">Placed ' + PR.formatDate(order.created_at) +
            ' · ' + itemCount(order) + ' item' + (itemCount(order) === 1 ? '' : 's') + '</div>' +
        '</div>' +
        '<div style="text-align:right">' +
          '<div style="font-size:19px;font-weight:900">' + PR.money(order.total_amount) + '</div>' +
          '<span class="pill ' + PR.esc(order.order_status) + '">' + PR.esc(order.order_status) + '</span> ' +
          '<span class="pill ' + PR.esc(order.payment_status) + '">' + PR.esc(order.payment_status) + '</span>' +
        '</div>' +
      '</div>' +

      '<div class="small-note" style="margin-bottom:12px">' +
        items.slice(0, 3).map(function (item) {
          return PR.esc(item.product_name) + ' × ' + item.quantity;
        }).join('<br>') +
        (items.length > 3 ? '<br>and ' + (items.length - 3) + ' more…' : '') +
      '</div>' +

      (order.tracking_number
        ? '<div class="small-note" style="margin-bottom:12px">🚚 ' +
          PR.esc(order.courier_partner || 'Courier') + ' · ' + PR.esc(order.tracking_number) + '</div>'
        : '') +

      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<a class="outline" href="/account/order/?id=' + encodeURIComponent(order.order_number) + '">VIEW DETAILS</a>' +
        '<a class="outline" href="/account/invoice/?id=' + encodeURIComponent(order.order_number) + '">INVOICE</a>' +
        '<a class="outline" href="' + PR.esc(PR.whatsapp(
            'Hello PowerRun Industries, I have a question about my order ' + order.order_number + '.')) +
          '" target="_blank" rel="noopener">ASK ABOUT THIS ORDER</a>' +
      '</div>' +
    '</div>';
  }

  document.addEventListener('DOMContentLoaded', async function () {
    PR.mountLayout('');
    document.getElementById('accountNav').innerHTML = nav('orders');

    var session = await PR.account.requireSignIn();
    if (!session) return;

    var host = document.getElementById('ordersContent');
    try {
      var orders = await PR.account.loadOrders();
      if (!orders.length) {
        host.innerHTML = '<div class="empty-state">' +
          '<h3>No orders in this account yet</h3>' +
          '<p>If you ordered as a guest, you can add that order from the account page using its ' +
          'Order ID and mobile number.</p>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:8px">' +
            '<a class="btn orange" href="/products/">START SHOPPING</a>' +
            '<a class="outline" href="/account/">ADD A GUEST ORDER</a>' +
          '</div></div>';
        return;
      }
      host.innerHTML = orders.map(card).join('');
    } catch (err) {
      host.innerHTML = '<div class="empty-state"><h3>Your orders could not be loaded</h3>' +
        '<p>' + PR.esc(err.message) + '</p>' +
        '<button class="btn orange" type="button" onclick="location.reload()">Try again</button></div>';
      PR.toast(err.message, 'error');
    }
  });
})();
