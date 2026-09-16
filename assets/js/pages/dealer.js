/* Dealer enquiry page */
(function () {
  'use strict';
  var PR = window.PR;

  function success(result) {
    document.getElementById('main').innerHTML =
      '<section class="section section-narrow"><div class="panel"><div class="success-box">' +
        '<div class="success-icon">✓</div>' +
        '<h1 style="margin:0 0 6px">Dealer Enquiry Received</h1>' +
        '<p class="small-note">Thank you for your interest in partnering with PowerRun Industries.</p>' +
        '<div class="order-id-box"><small>ENQUIRY ID</small>' +
          '<div class="value">' + PR.esc(result.enquiry_number) + '</div></div>' +
        '<p class="small-note">Our channel team will review your application and contact you with ' +
        'pricing, margins and territory details.</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:16px">' +
          '<a class="btn orange" href="/products/">EXPLORE THE RANGE</a>' +
          '<a class="outline" href="/">BACK TO HOME</a>' +
        '</div>' +
      '</div></div></section>';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit(event) {
    event.preventDefault();
    var form = event.target;
    var button = document.getElementById('dealerBtn');
    PR.clearFormError(form);

    var values = PR.validateForm(form, [
      { el: 'dl_name', name: 'name', label: 'Contact name', required: true },
      { el: 'dl_company', name: 'company_name', label: 'Company name' },
      { el: 'dl_mobile', name: 'mobile', label: 'Mobile number', required: true, type: 'mobile' },
      { el: 'dl_email', name: 'email', label: 'Email address', type: 'email' },
      { el: 'dl_city', name: 'city', label: 'City' },
      { el: 'dl_state', name: 'state', label: 'State' },
      { el: 'dl_business_type', name: 'business_type', label: 'Business type' },
      { el: 'dl_message', name: 'message', label: 'Message' }
    ]);
    if (!values) return;

    PR.setBusy(button, true, 'SUBMITTING…');
    try {
      var result = await PR.call('submit dealer enquiry', function (sb) {
        return sb.rpc('submit_dealer_enquiry', { p_data: values });
      });
      PR.toast('Dealer enquiry submitted: ' + result.enquiry_number, 'success');
      success(result);
    } catch (err) {
      PR.setBusy(button, false);
      PR.showFormError(form, err.message);
      PR.toast(err.message, 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    PR.mountLayout('dealer');
    PR.fillStates(document.getElementById('dl_state'));
    document.getElementById('dealerForm').addEventListener('submit', submit);
  });
})();
