/* Customer Proforma Invoice:  https://powerrun.in/pi/?t=<orders.pi_token>
 *
 * Shows the order as a proforma (same document as the invoices, assets/js/invoice-doc.js),
 * the amount still due, the bank details and a UPI button / QR code with the amount filled
 * in. The data comes from get_order_pi_public() (sql/45), which only answers for the
 * order whose token is in the link. */
(function () {
  'use strict';
  var PR = window.PR;

  function upiLink(bank, due, orderNumber) {
    return 'upi://pay?pa=' + encodeURIComponent(bank.upi_id).replace('%40', '@') +   // UPI apps expect a plain @
      '&pn=' + encodeURIComponent(PR.config.COMPANY) +
      '&am=' + encodeURIComponent(Number(due).toFixed(2)) + '&cu=INR' +
      '&tn=' + encodeURIComponent('Order ' + orderNumber);
  }

  /* Razorpay on the PI (sql/49): only while nothing is received yet. The advance is the
     ask already on the order, else advance_percent of the total (same rule as checkout). */
  function onlineOptions(data, payments) {
    var o = data.order, total = Number(o.total_amount);
    if (!PR.config.RAZORPAY_KEY_ID || payments.razorpay_enabled === false || Number(data.advance) > 0 ||
        o.payment_status === 'paid' || o.order_status === 'delivered') return null;
    var need = Number(data.advance_required);
    var pct = Math.min(Math.max(Number(payments.advance_percent) || 50, 1), 100);
    var advance = need > 0 && need < total ? need : Math.min(Math.ceil(total * pct / 100), total);
    var canAdvance = payments.advance_enabled !== false && total >= (Number(payments.full_online_below) || 0) && advance < total;
    return { advance: canAdvance ? advance : 0, total: total };
  }

  function payBox(data, payments) {
    var o = data.order;
    var due = Number(data.pay_now != null ? data.pay_now : data.due) || 0;
    var online = onlineOptions(data, payments);
    var advanceAsk = online ? online.advance > 0
      : Number(data.advance_required) > Number(data.advance) && Number(data.advance_required) < Number(o.total_amount);
    if (online && online.advance) due = online.advance;
    data.shown_due = due;   // the UPI QR asks the same amount
    var bank = data.bank || {};
    var hasBank = bank.bank_account_number || bank.upi_id;
    var shot = PR.whatsapp('Namaste PowerRun, maine order ' + o.order_number + ' ka payment ' + PR.money(due) +
      ' kar diya hai. Screenshot bhej raha/rahi hoon.');
    if (due <= 0) {
      return '<div class="pi-pay"><h2>✓ Payment mil gaya</h2><p>Order ' + PR.esc(o.order_number) +
        ' ka poora payment mil chuka hai. Dhanyavaad! 🙏</p></div>';
    }
    return '<div class="pi-pay">' +
      '<h2>' + (advanceAsk ? 'Advance' : 'Payment') + ': ' + PR.money2(due) + '</h2>' +
      (advanceAsk ? '<p class="pi-small">Order confirm karne ke liye ye advance bhejein. Baaki ' +
        PR.money2(Number(data.due) - due) + ' saman milne par dena hai.</p>' : '') +
      (!advanceAsk && Number(data.advance) > 0 ? '<p class="pi-small">Advance ' + PR.money2(data.advance) + ' mil chuka hai - ye baaki rakam hai.</p>' : '') +
      (online
        ? (online.advance
            ? '<button class="btn orange block" type="button" data-pi-pay="advance">' + PR.money(online.advance) +
                ' ADVANCE ONLINE PAY KAREIN (UPI / CARD)</button>'
            : '') +
          '<button class="btn block' + (online.advance ? ' outline' : ' orange') + '" type="button" data-pi-pay="full">POORA ' +
            PR.money(online.total) + ' ONLINE PAY KAREIN</button>' +
          '<div id="piPayMsg" role="status"></div>' +
          (hasBank ? '<p class="pi-small">Ya UPI / bank transfer se bhejein:</p>' : '')
        : '') +
      (bank.upi_id
        ? '<a class="btn orange block pi-upi" href="' + PR.esc(upiLink(bank, due, o.order_number)) + '">UPI app se pay karein (GPay / PhonePe / Paytm)</a>' +
          '<div class="pi-qr-wrap"><div id="piQr" aria-label="UPI QR code"></div>' +
            '<p class="pi-small">Doosre phone se scan karein · UPI ID: <b>' + PR.esc(bank.upi_id) + '</b></p></div>'
        : '') +
      (bank.bank_account_number
        ? '<div class="pi-bank"><b>Bank transfer (NEFT / IMPS)</b>' +
            (bank.bank_account_name ? '<span>Name: <b>' + PR.esc(bank.bank_account_name) + '</b></span>' : '') +
            '<span>A/c No: <b>' + PR.esc(bank.bank_account_number) + '</b></span>' +
            (bank.bank_ifsc ? '<span>IFSC: <b>' + PR.esc(bank.bank_ifsc) + '</b></span>' : '') +
            (bank.bank_name ? '<span>' + PR.esc(bank.bank_name) + (bank.bank_branch ? ', ' + PR.esc(bank.bank_branch) : '') + '</span>' : '') +
          '</div>'
        : '') +
      (hasBank || online ? '' : '<p class="pi-small">Payment details ke liye hamein WhatsApp karein.</p>') +
      (hasBank
        ? '<a class="btn block pi-wa" href="' + PR.esc(shot) + '" target="_blank" rel="noopener">Payment kar diya? Screenshot WhatsApp karein</a>'
        : '') +
      '<p class="pi-small">Payment milte hi order dispatch kar diya jata hai.</p>' +
    '</div>';
  }

  function loadRazorpay() {
    if (window.Razorpay) return Promise.resolve(true);
    return new Promise(function (resolve) {
      var script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = function () { resolve(!!window.Razorpay); };
      script.onerror = function () { resolve(false); };
      document.head.appendChild(script);
    });
  }

  /* same server-side flow as checkout: create the Razorpay order from the DB row, verify the
     signature and amount on the server; the browser callback is never proof of payment */
  async function payOnline(token, data, full, button) {
    var msg = document.getElementById('piPayMsg');
    msg.innerHTML = '';
    PR.setBusy(button, true, 'PAYMENT WINDOW KHUL RAHI HAI…');
    try {
      if (!(await loadRazorpay())) throw new Error('Payment page load nahi hua (internet slow hai). Dobara try karein.');
      var start = await PR.call('start payment', function (sb) {
        return sb.rpc('pi_start_online_payment', { p_token: token, p_full: full });
      });
      if (start.status === 'already_paid') { location.reload(); return; }
      var created = await PR.call('create payment order', function (sb) {
        return sb.functions.invoke('razorpay-create-order', { body: { order_id: start.order_id } });
      });
      if (!created || !created.razorpay_order_id) throw new Error('Payment shuru nahi ho paya. Dobara try karein ya WhatsApp karein.');
      var o = data.order;
      var rzp = new window.Razorpay({
        key: PR.config.RAZORPAY_KEY_ID,
        order_id: created.razorpay_order_id,
        amount: created.amount,
        currency: created.currency || 'INR',
        name: PR.config.COMPANY,
        description: (full ? 'Order ' : 'Advance for order ') + o.order_number,
        image: '/assets/powerrun-logo.png',
        prefill: { name: o.customer_name || '', contact: o.customer_mobile || '', email: o.customer_email || '' },
        theme: { color: '#ff5a00' },
        modal: { ondismiss: function () { PR.setBusy(button, false); } },
        handler: async function (response) {
          msg.innerHTML = '<p class="pi-small">Payment check ho raha hai…</p>';
          try {
            var verified = await PR.call('verify payment', function (sb) {
              return sb.functions.invoke('razorpay-verify-payment', {
                body: {
                  order_id: start.order_id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature
                }
              });
            });
            if (!verified || (verified.status !== 'paid' && verified.status !== 'advance_paid')) throw new Error('verify');
            location.reload();
          } catch (err) {
            PR.setBusy(button, false);
            msg.innerHTML = '<div class="form-message error">Payment check nahi ho paya. Paise kat gaye hon to order ' +
              PR.esc(o.order_number) + ' ke saath WhatsApp karein, hum turant dekh lenge.</div>';
          }
        }
      });
      rzp.on('payment.failed', function (response) {
        PR.setBusy(button, false);
        msg.innerHTML = '<div class="form-message error">Payment nahi hua: ' +
          PR.esc((response.error && response.error.description) || 'dobara try karein') + '</div>';
      });
      rzp.open();
    } catch (err) {
      PR.setBusy(button, false);
      msg.innerHTML = '<div class="form-message error">' + PR.esc(err.message) + '</div>';
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    var host = document.getElementById('invoiceContent');
    document.getElementById('printBtn').addEventListener('click', function () { window.print(); });
    var token = PR.param('t') || '';
    if (!/^[0-9a-f-]{36}$/i.test(token)) {
      host.innerHTML = '<div class="invoice-sheet"><h2>Link adhoora hai</h2><p>WhatsApp par mila poora link kholiye.</p></div>';
      return;
    }
    try {
      var data = await PR.call('load proforma', function (sb) { return sb.rpc('get_order_pi_public', { p_token: token }); });
      if (data.cancelled) {
        host.innerHTML = '<div class="invoice-sheet"><h2>Order ' + PR.esc(data.order_number) + ' cancel ho chuka hai</h2>' +
          '<p>Koi sawal ho to <a href="' + PR.esc(PR.whatsapp('Order ' + data.order_number + ' ke baare mein')) + '">WhatsApp karein</a>.</p></div>';
        return;
      }
      var company = Object.assign({}, data.company || {}, data.bank || {});
      var payments = (await PR.getSettings()).payments || {};
      var box = document.getElementById('payBox');
      box.innerHTML = payBox(data, payments);
      box.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-pi-pay]');
        if (btn) payOnline(token, data, btn.getAttribute('data-pi-pay') === 'full', btn);
      });
      host.innerHTML = PR.invoiceHtml(data.order, company, {
        type: 'proforma', bank: true, proformaNo: 'PI-' + data.order.order_number, proformaDate: new Date(),
        paymentTerms: Number(data.advance) > 0
          ? 'Advance received: ' + PR.money2(data.advance) + '. Balance due: ' + PR.money2(data.due) + '.'
          : Number(data.advance_required) > 0 && Number(data.advance_required) < Number(data.order.total_amount)
            ? 'Advance ' + PR.money2(data.advance_required) + ' by UPI / bank transfer to confirm the order; balance ' +
              PR.money2(Number(data.order.total_amount) - Number(data.advance_required)) + ' on delivery.'
            : 'Full payment in advance by UPI / bank transfer.',
        notes: 'Order No. ' + data.order.order_number + ' · ' + PR.formatDate(data.order.created_at)
      });
      document.title = 'Proforma Invoice PI-' + data.order.order_number + ' | PowerRun Industries';
      var qr = document.getElementById('piQr');
      if (qr && window.QRCode && data.bank && data.bank.upi_id) {
        new window.QRCode(qr, { text: upiLink(data.bank, data.shown_due, data.order.order_number), width: 180, height: 180 });
      }
    } catch (err) {
      host.innerHTML = '<div class="invoice-sheet"><h2>PI nahi khul paya</h2><p>' + PR.esc(err.message) +
        '</p><p><a href="' + PR.esc(PR.whatsapp('PI link nahi khul raha')) + '">WhatsApp karein</a></p></div>';
    }
  });
})();
