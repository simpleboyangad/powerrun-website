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

  function payBox(data) {
    var o = data.order;
    var due = Number(data.due) || 0;
    var bank = data.bank || {};
    var hasBank = bank.bank_account_number || bank.upi_id;
    var shot = PR.whatsapp('Namaste PowerRun, maine order ' + o.order_number + ' ka payment ' + PR.money(due) +
      ' kar diya hai. Screenshot bhej raha/rahi hoon.');
    if (due <= 0) {
      return '<div class="pi-pay"><h2>✓ Payment mil gaya</h2><p>Order ' + PR.esc(o.order_number) +
        ' ka poora payment mil chuka hai. Dhanyavaad! 🙏</p></div>';
    }
    return '<div class="pi-pay">' +
      '<h2>Payment: ' + PR.money2(due) + '</h2>' +
      (Number(data.advance) > 0 ? '<p class="pi-small">Advance ' + PR.money2(data.advance) + ' mil chuka hai - ye baaki rakam hai.</p>' : '') +
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
      (hasBank ? '' : '<p class="pi-small">Payment details ke liye hamein WhatsApp karein.</p>') +
      '<a class="btn block pi-wa" href="' + PR.esc(shot) + '" target="_blank" rel="noopener">Payment kar diya? Screenshot WhatsApp karein</a>' +
      (o.payment_method !== 'razorpay'
        ? '<p class="pi-small">Advance dene par order turant dispatch hota hai. Cash on Delivery bhi available hai.</p>'
        : '') +
    '</div>';
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
      document.getElementById('payBox').innerHTML = payBox(data);
      host.innerHTML = PR.invoiceHtml(data.order, company, {
        type: 'proforma', bank: true, proformaNo: 'PI-' + data.order.order_number, proformaDate: new Date(),
        paymentTerms: Number(data.advance) > 0
          ? 'Advance received: ' + PR.money2(data.advance) + '. Balance due: ' + PR.money2(data.due) + '.'
          : 'Payment in advance by UPI / bank transfer, or Cash on Delivery.',
        notes: 'Order No. ' + data.order.order_number + ' · ' + PR.formatDate(data.order.created_at)
      });
      document.title = 'Proforma Invoice PI-' + data.order.order_number + ' | PowerRun Industries';
      var qr = document.getElementById('piQr');
      if (qr && window.QRCode && data.bank && data.bank.upi_id) {
        new window.QRCode(qr, { text: upiLink(data.bank, data.due, data.order.order_number), width: 180, height: 180 });
      }
    } catch (err) {
      host.innerHTML = '<div class="invoice-sheet"><h2>PI nahi khul paya</h2><p>' + PR.esc(err.message) +
        '</p><p><a href="' + PR.esc(PR.whatsapp('PI link nahi khul raha')) + '">WhatsApp karein</a></p></div>';
    }
  });
})();
