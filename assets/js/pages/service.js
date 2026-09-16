/* Service request page */
(function () {
  'use strict';
  var PR = window.PR;

  async function fillProducts() {
    var select = document.getElementById('sv_product');
    try {
      var products = await PR.loadProducts();
      select.innerHTML = '<option value="">Select your product…</option>' +
        products.map(function (p) {
          return '<option value="' + PR.esc(p.id) + '" data-name="' + PR.esc(p.name) + '">' +
                 PR.esc(p.name) + (p.sku ? ' (' + PR.esc(p.sku) + ')' : '') + '</option>';
        }).join('') +
        '<option value="other" data-name="Other PowerRun product">Other PowerRun product</option>';
    } catch (err) {
      select.innerHTML = '<option value="other" data-name="Other PowerRun product">Other PowerRun product</option>';
      PR.toast('The product list could not be loaded. You can still submit with "Other".', 'error');
    }
  }

  function success(result) {
    document.getElementById('main').innerHTML =
      '<section class="section section-narrow"><div class="panel"><div class="success-box">' +
        '<div class="success-icon">✓</div>' +
        '<h1 style="margin:0 0 6px">Service Request Received</h1>' +
        '<p class="small-note">Our service team will contact you shortly.</p>' +
        '<div class="order-id-box"><small>SERVICE REQUEST ID</small>' +
          '<div class="value">' + PR.esc(result.ticket_number) + '</div></div>' +
        '<p class="small-note">Please quote this ID in any follow-up. For urgent issues you can also ' +
        'reach us on WhatsApp.</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:16px">' +
          '<a class="btn orange" href="' + PR.esc(PR.whatsapp('Hello PowerRun Industries, I raised service request ' + result.ticket_number + '.')) + '" target="_blank" rel="noopener">WHATSAPP OUR TEAM</a>' +
          '<a class="outline" href="/">BACK TO HOME</a>' +
        '</div>' +
      '</div></div></section>';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit(event) {
    event.preventDefault();
    var form = event.target;
    var button = document.getElementById('serviceBtn');
    PR.clearFormError(form);

    var values = PR.validateForm(form, [
      { el: 'sv_name', name: 'name', label: 'Full name', required: true },
      { el: 'sv_mobile', name: 'mobile', label: 'Mobile number', required: true, type: 'mobile' },
      { el: 'sv_email', name: 'email', label: 'Email address', type: 'email' },
      { el: 'sv_product', name: 'product', label: 'Product', required: true },
      { el: 'sv_serial', name: 'serial_number', label: 'Serial number' },
      { el: 'sv_purchase_date', name: 'purchase_date', label: 'Purchase date' },
      { el: 'sv_issue_type', name: 'issue_type', label: 'Issue type', required: true },
      { el: 'sv_description', name: 'issue_description', label: 'Issue description', required: true },
      { el: 'sv_address', name: 'address', label: 'Address' },
      { el: 'sv_city', name: 'city', label: 'City' },
      { el: 'sv_state', name: 'state', label: 'State' },
      { el: 'sv_pincode', name: 'pincode', label: 'Pincode', type: 'pincode' }
    ]);
    if (!values) return;

    var select = document.getElementById('sv_product');
    var option = select.options[select.selectedIndex];
    values.product_name = option ? option.getAttribute('data-name') : null;
    values.product_id = values.product === 'other' ? null : values.product;
    delete values.product;

    PR.setBusy(button, true, 'SUBMITTING…');
    try {
      var result = await PR.call('submit service request', function (sb) {
        return sb.rpc('submit_service_request', { p_data: values });
      });
      PR.toast('Service request created: ' + result.ticket_number, 'success');
      success(result);
    } catch (err) {
      PR.setBusy(button, false);
      PR.showFormError(form, err.message);
      PR.toast(err.message, 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    PR.mountLayout('service');
    PR.fillStates(document.getElementById('sv_state'));
    fillProducts();
    document.getElementById('serviceForm').addEventListener('submit', submit);
  });
})();
