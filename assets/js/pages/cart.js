/* Cart page */
(function () {
  'use strict';
  var PR = window.PR;
  var current = { lines: [] };

  function lineRow(line) {
    var p = line.product;
    return '<div class="cart-row" data-line="' + PR.esc(p.id) + '">' +
      '<a class="cart-img" href="' + PR.productUrl(p) + '">' + PR.productImage(p, 'small') + '</a>' +
      '<div class="cart-main">' +
        '<b><a href="' + PR.productUrl(p) + '">' + PR.esc(p.name) + '</a></b>' +
        '<small>' + PR.esc(p.category || '') + (p.sku ? ' · ' + PR.esc(p.sku) : '') +
          ' · ' + PR.money(p.price) + ' each</small>' +
        '<small>' + (p.stock <= 5 ? 'Only ' + p.stock + ' left in stock' : 'In stock') + '</small>' +
        '<div class="cart-line">' + PR.money(line.lineTotal) + '</div>' +
      '</div>' +
      '<div class="qty">' +
        '<button type="button" data-qty="-1" data-id="' + PR.esc(p.id) + '" aria-label="Decrease quantity"' +
          (line.qty <= 1 ? '' : '') + '>−</button>' +
        '<b>' + line.qty + '</b>' +
        '<button type="button" data-qty="1" data-id="' + PR.esc(p.id) + '" aria-label="Increase quantity"' +
          (line.qty >= p.stock ? ' disabled' : '') + '>+</button>' +
        '<button class="remove" type="button" data-remove="' + PR.esc(p.id) + '" aria-label="Remove ' + PR.esc(p.name) + '">×</button>' +
      '</div>' +
    '</div>';
  }

  async function render() {
    var host = document.getElementById('cartContent');
    var summaryHost = document.getElementById('cartSummary');
    host.innerHTML = '<p class="small-note">Loading your cart…</p>';
    summaryHost.innerHTML = '';

    var resolved;
    try {
      resolved = await PR.cart.resolve();
    } catch (err) {
      PR.toast(err.message, 'error');
      host.innerHTML = '<div class="empty-state"><h3>Your cart could not be loaded</h3>' +
        '<p>' + PR.esc(err.message) + '</p>' +
        '<button class="btn orange" type="button" onclick="location.reload()">Try again</button></div>';
      return;
    }

    current = resolved;
    resolved.issues.forEach(function (issue) { PR.toast(issue, 'error'); });

    if (!resolved.lines.length) {
      host.innerHTML = '<div class="empty-state"><h3>Your cart is empty</h3>' +
        '<p>Add products to continue to checkout.</p>' +
        '<a class="btn orange" href="/products/">Browse products</a></div>';
      return;
    }

    host.innerHTML =
      '<h2>' + resolved.lines.length + ' item' + (resolved.lines.length === 1 ? '' : 's') + ' in your cart</h2>' +
      resolved.lines.map(lineRow).join('') +
      '<div style="margin-top:18px;display:flex;gap:8px;flex-wrap:wrap">' +
        '<a class="outline" href="/products/">CONTINUE SHOPPING</a>' +
        '<button class="outline" type="button" id="clearCartBtn">CLEAR CART</button>' +
      '</div>';

    var settings = await PR.getSettings();
    var shipping = PR.shippingFor(resolved.subtotal, settings.shipping);
    var total = resolved.subtotal + shipping;

    summaryHost.innerHTML =
      '<div class="panel">' +
        '<h2>Order Summary</h2>' +
        '<div class="summary-row"><span>Subtotal</span><b>' + PR.money(resolved.subtotal) + '</b></div>' +
        '<div class="summary-row"><span>Shipping</span><b>' +
          (shipping > 0 ? PR.money(shipping) : 'Free') + '</b></div>' +
        '<div class="summary-row total"><span>Total</span><span>' + PR.money(total) + '</span></div>' +
        '<a class="btn orange block" href="/checkout/" style="margin-top:12px">PROCEED TO CHECKOUT</a>' +
        '<p class="small-note" style="margin-top:10px">Taxes, if applicable, are confirmed on your invoice. ' +
        'Prices and stock are re-checked when you place the order.</p>' +
      '</div>';

    var clear = document.getElementById('clearCartBtn');
    if (clear) {
      clear.addEventListener('click', function () {
        if (!confirm('Remove all items from your cart?')) return;
        PR.cart.clear();
        render();
      });
    }
  }

  function bind() {
    document.addEventListener('click', function (event) {
      var qtyBtn = event.target.closest('[data-qty]');
      if (qtyBtn) {
        var id = qtyBtn.getAttribute('data-id');
        var delta = Number(qtyBtn.getAttribute('data-qty'));
        var item = PR.cart.find(id);
        if (!item) return;
        var line = current.lines.find(function (l) { return String(l.product.id) === String(id); });
        var product = line ? line.product : null;
        var next = item.qty + delta;
        if (next <= 0) PR.cart.remove(id);
        else PR.cart.setQty(id, next, product ? product.stock : undefined);
        render();
        return;
      }
      var removeBtn = event.target.closest('[data-remove]');
      if (removeBtn) {
        PR.cart.remove(removeBtn.getAttribute('data-remove'));
        PR.toast('Item removed from cart.', 'success');
        render();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    PR.mountLayout('products');
    bind();
    render();
  });
})();
