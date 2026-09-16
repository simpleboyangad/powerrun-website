/* Warranty registration page */
(function () {
  'use strict';
  var PR = window.PR;

  async function fillProducts() {
    var select = document.getElementById('wr_product');
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
        '<h1 style="margin:0 0 6px">Warranty Registered</h1>' +
        '<p class="small-note">Your PowerRun warranty registration has been received.</p>' +
        '<div class="order-id-box"><small>WARRANTY ID</small>' +
          '<div class="value">' + PR.esc(result.warranty_number) + '</div></div>' +
        '<p class="small-note">Keep this ID for your records. Our team will verify the details and ' +
        'contact you if anything further is needed.</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:16px">' +
          '<a class="btn orange" href="/products/">CONTINUE SHOPPING</a>' +
          '<a class="outline" href="/service/">RAISE A SERVICE REQUEST</a>' +
        '</div>' +
      '</div></div></section>';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit(event) {
    event.preventDefault();
    var form = event.target;
    var button = document.getElementById('warrantyBtn');
    PR.clearFormError(form);

    var values = PR.validateForm(form, [
      { el: 'wr_name', name: 'name', label: 'Full name', required: true },
      { el: 'wr_mobile', name: 'mobile', label: 'Mobile number', required: true, type: 'mobile' },
      { el: 'wr_email', name: 'email', label: 'Email address', type: 'email' },
      { el: 'wr_product', name: 'product', label: 'Product', required: true },
      { el: 'wr_serial', name: 'serial_number', label: 'Serial number', required: true },
      { el: 'wr_purchase_date', name: 'purchase_date', label: 'Purchase date' },
      { el: 'wr_invoice', name: 'invoice_number', label: 'Invoice number' },
      { el: 'wr_dealer', name: 'dealer_name', label: 'Dealer name' },
      { el: 'wr_address', name: 'address', label: 'Address' },
      { el: 'wr_city', name: 'city', label: 'City' },
      { el: 'wr_state', name: 'state', label: 'State' },
      { el: 'wr_pincode', name: 'pincode', label: 'Pincode', type: 'pincode' }
    ]);
    if (!values) return;

    var select = document.getElementById('wr_product');
    var option = select.options[select.selectedIndex];
    values.product_name = option ? option.getAttribute('data-name') : null;
    values.product_id = values.product === 'other' ? null : values.product;
    delete values.product;

    PR.setBusy(button, true, 'SUBMITTING…');
    try {
      var result = await PR.call('submit warranty registration', function (sb) {
        return sb.rpc('submit_warranty_registration', { p_data: values });
      });
      PR.toast('Warranty registered: ' + result.warranty_number, 'success');
      success(result);
    } catch (err) {
      PR.setBusy(button, false);
      PR.showFormError(form, err.message);
      PR.toast(err.message, 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    PR.mountLayout('warranty');
    PR.fillStates(document.getElementById('wr_state'));
    fillProducts();
    document.getElementById('warrantyForm').addEventListener('submit', submit);
  });
})();
