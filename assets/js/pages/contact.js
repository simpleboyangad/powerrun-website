/* Contact / enquiry page */
(function () {
  'use strict';
  var PR = window.PR;

  async function fillProducts() {
    var select = document.getElementById('ct_product');
    try {
      var products = await PR.loadProducts();
      select.innerHTML = '<option value="">General enquiry</option>' +
        products.map(function (p) {
          return '<option value="' + PR.esc(p.id) + '">' + PR.esc(p.name) + '</option>';
        }).join('');
      var preset = PR.param('product');
      if (preset) select.value = preset;
    } catch (err) {
      console.warn('[PowerRun] product list unavailable on contact page:', err.message);
    }
  }

  async function submit(event) {
    event.preventDefault();
    var form = event.target;
    var button = document.getElementById('contactBtn');
    PR.clearFormError(form);

    var values = PR.validateForm(form, [
      { el: 'ct_name', name: 'name', label: 'Full name', required: true },
      { el: 'ct_mobile', name: 'mobile', label: 'Mobile number', required: true, type: 'mobile' },
      { el: 'ct_email', name: 'email', label: 'Email address', type: 'email' },
      { el: 'ct_city', name: 'city', label: 'City' },
      { el: 'ct_product', name: 'product_id', label: 'Product' },
      { el: 'ct_message', name: 'message', label: 'Message' }
    ]);
    if (!values) return;
    values.source = 'contact-page';

    PR.setBusy(button, true, 'SENDING…');
    try {
      await PR.call('submit enquiry', function (sb) {
        return sb.rpc('submit_contact_lead', { p_data: values });
      });
      PR.setBusy(button, false);
      form.reset();
      PR.toast('Thank you. Your enquiry has been sent.', 'success');
      var box = document.createElement('div');
      box.className = 'form-message success';
      box.setAttribute('role', 'status');
      box.textContent = 'Thank you. Our team will contact you on ' + values.mobile + ' shortly.';
      form.prepend(box);
    } catch (err) {
      PR.setBusy(button, false);
      PR.showFormError(form, err.message);
      PR.toast(err.message, 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    PR.mountLayout('contact');
    fillProducts();
    document.getElementById('contactForm').addEventListener('submit', submit);
  });
})();
