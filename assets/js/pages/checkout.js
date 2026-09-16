/* Checkout page - order placement.
 *
 * The browser sends only product ids, quantities and the customer's details.
 * create_website_order() re-reads every price from the database, re-checks
 * stock, recomputes the total and writes the order. Nothing about the amount
 * is trusted from this page.
 */
(function () {
  'use strict';
  var PR = window.PR;

  var current = { lines: [], subtotal: 0 };
  var settings = null;
  var paymentMethod = 'cod';

  function renderSummary() {
    var host = document.getElementById('checkoutSummary');
    var shipping = PR.shippingFor(current.subtotal, settings.shipping);
    var total = current.subtotal + shipping;

    host.innerHTML =
      '<div class="panel">' +
        '<h2>Order Summary</h2>' +
        current.lines.map(function (line) {
          return '<div class="summary-row"><span>' + PR.esc(line.product.name) +
                 ' × ' + line.qty + '</span><b>' + PR.money(line.lineTotal) + '</b></div>';
        }).join('') +
        '<div class="summary-row" style="border-top:1px solid #eee;margin-top:6px;padding-top:12px">' +
          '<span>Subtotal</span><b>' + PR.money(current.subtotal) + '</b></div>' +
        '<div class="summary-row"><span>Shipping</span><b>' +
          (shipping > 0 ? PR.money(shipping) : 'Free') + '</b></div>' +
        '<div class="summary-row total"><span>Grand Total</span><span>' + PR.money(total) + '</span></div>' +
        '<a class="outline block" href="/cart/" style="margin-top:12px">EDIT CART</a>' +
      '</div>';
  }

  function renderPaymentMethods() {
    var host = document.getElementById('paymentMethods');
    var payments = settings.payments || {};
    var razorpayReady = !!payments.razorpay_enabled && !!PR.config.RAZORPAY_KEY_ID;
    var options = [];

    if (razorpayReady) {
      options.push({
        value: 'razorpay',
        title: 'Pay Online',
        note: 'UPI, cards, net banking and wallets via Razorpay. Secure payment.'
      });
    }
    if (payments.cod_enabled !== false || !razorpayReady) {
      options.push({
        value: 'cod',
        title: 'Pay on Confirmation',
        note: 'Place the order now. Our team calls you within 24 hours to confirm payment and delivery.'
      });
    }

    paymentMethod = options[0].value;
    host.innerHTML = options.map(function (option, index) {
      return '<label class="radio-card' + (index === 0 ? ' selected' : '') + '">' +
        '<input type="radio" name="payment_method" value="' + option.value + '"' +
          (index === 0 ? ' checked' : '') + '>' +
        '<span><b>' + PR.esc(option.title) + '</b><small>' + PR.esc(option.note) + '</small></span>' +
      '</label>';
    }).join('');

    host.addEventListener('change', function (event) {
      if (event.target.name !== 'payment_method') return;
      paymentMethod = event.target.value;
      host.querySelectorAll('.radio-card').forEach(function (card) {
        card.classList.toggle('selected', card.contains(event.target) && event.target.checked);
      });
    });
  }

  function collect() {
    return PR.validateForm(document.getElementById('checkoutForm'), [
      { el: 'ck_name', name: 'name', label: 'Full name', required: true },
      { el: 'ck_mobile', name: 'mobile', label: 'Mobile number', required: true, type: 'mobile' },
      { el: 'ck_email', name: 'email', label: 'Email address', type: 'email' },
      { el: 'ck_address', name: 'address', label: 'Address', required: true },
      { el: 'ck_city', name: 'city', label: 'City', required: true },
      { el: 'ck_state', name: 'state', label: 'State', required: true },
      { el: 'ck_pincode', name: 'pincode', label: 'Pincode', required: true, type: 'pincode' }
    ]);
  }

  function goToConfirmation(orderNumber, mobile) {
    try {
      sessionStorage.setItem('pr_last_order', JSON.stringify({ order: orderNumber, mobile: mobile }));
    } catch (err) {
      console.warn('[PowerRun] could not store the order reference:', err);
    }
    PR.cart.clear();
    window.location.href = '/order-confirmation/?order=' + encodeURIComponent(orderNumber);
  }

  async function payWithRazorpay(order, customer, button) {
    if (!window.Razorpay) {
      throw new Error('The payment library did not load. Please refresh and try again.');
    }

    // The Edge Function creates the Razorpay order server-side using the key
    // secret. The secret is never present in this page.
    var created = await PR.call('create payment order', function (sb) {
      return sb.functions.invoke('razorpay-create-order', {
        body: { order_id: order.order_id, order_number: order.order_number }
      });
    });

    if (!created || !created.razorpay_order_id) {
      throw new Error('The payment could not be started. Your order is saved as ' +
                      order.order_number + ' and our team will contact you.');
    }

    return new Promise(function (resolve, reject) {
      var rzp = new window.Razorpay({
        key: PR.config.RAZORPAY_KEY_ID,
        order_id: created.razorpay_order_id,
        amount: created.amount,
        currency: created.currency || 'INR',
        name: PR.config.COMPANY,
        description: 'Order ' + order.order_number,
        image: '/assets/powerrun-logo.png',
        prefill: { name: customer.name, contact: customer.mobile, email: customer.email || '' },
        theme: { color: '#ff5a00' },
        modal: {
          ondismiss: function () {
            PR.setBusy(button, false);
            PR.toast('Payment cancelled. Your order ' + order.order_number +
                     ' is saved and awaiting payment.', 'error');
            resolve(false);
          }
        },
        handler: async function (response) {
          try {
            // Signature verification happens server-side. A browser callback is
            // never treated as proof of payment.
            var verified = await PR.call('verify payment', function (sb) {
              return sb.functions.invoke('razorpay-verify-payment', {
                body: {
                  order_id: order.order_id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature
                }
              });
            });
            if (!verified || verified.status !== 'paid') {
              throw new Error('Payment could not be verified. Please contact us with order ' +
                              order.order_number + '.');
            }
            resolve(true);
          } catch (err) {
            reject(err);
          }
        }
      });
      rzp.on('payment.failed', function (response) {
        console.error('[PowerRun] Razorpay payment failed:', response.error);
        PR.setBusy(button, false);
        PR.toast('Payment failed: ' + (response.error && response.error.description) +
                 '. Order ' + order.order_number + ' is saved as unpaid.', 'error');
        resolve(false);
      });
      rzp.open();
    });
  }

  async function submit(event) {
    event.preventDefault();
    var form = document.getElementById('checkoutForm');
    var button = document.getElementById('placeOrderBtn');
    PR.clearFormError(form);

    var customer = collect();
    if (!customer) return;

    PR.setBusy(button, true, 'PLACING ORDER…');

    try {
      // Re-resolve the cart immediately before ordering so that a price or
      // stock change made in the admin panel is picked up.
      var resolved = await PR.cart.resolve();
      if (!resolved.lines.length) {
        throw new Error('Your cart is empty. Please add a product before placing an order.');
      }
      resolved.issues.forEach(function (issue) { PR.toast(issue, 'error'); });
      current = resolved;
      renderSummary();

      var order = await PR.call('place order', function (sb) {
        return sb.rpc('create_website_order', {
          p_customer: customer,
          p_items: resolved.lines.map(function (line) {
            return { product_id: line.product.id, quantity: line.qty };
          }),
          p_payment_method: paymentMethod
        });
      });

      if (!order || !order.order_number) {
        throw new Error('The order was not saved correctly. Please contact us before trying again.');
      }

      if (paymentMethod === 'razorpay') {
        var paid = await payWithRazorpay(order, customer, button);
        if (!paid) return;   // order exists, payment pending - message already shown
      }

      goToConfirmation(order.order_number, customer.mobile);
    } catch (err) {
      PR.setBusy(button, false);
      PR.showFormError(form, err.message);
      PR.toast(err.message, 'error');
    }
  }

  async function init() {
    PR.mountLayout('products');
    PR.fillStates(document.getElementById('ck_state'));

    try {
      settings = await PR.getSettings();
      var resolved = await PR.cart.resolve();
      resolved.issues.forEach(function (issue) { PR.toast(issue, 'error'); });
      current = resolved;

      if (!resolved.lines.length) {
        document.getElementById('main').innerHTML =
          '<section class="section section-narrow"><div class="empty-state">' +
          '<h3>Your cart is empty</h3><p>Add a product before checking out.</p>' +
          '<a class="btn orange" href="/products/">Browse products</a></div></section>';
        return;
      }

      renderSummary();
      renderPaymentMethods();

      if (settings.payments && settings.payments.razorpay_enabled && PR.config.RAZORPAY_KEY_ID) {
        var script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        document.head.appendChild(script);
      }

      document.getElementById('checkoutForm').addEventListener('submit', submit);
    } catch (err) {
      PR.toast(err.message, 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
