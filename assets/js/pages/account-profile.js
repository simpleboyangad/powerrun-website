/* Customer account - saved delivery details */
(function () {
  'use strict';
  var PR = window.PR;

  function nav() {
    return '<div class="tabs" style="margin-bottom:22px">' +
      '<a class="tab" href="/account/orders/">MY ORDERS</a>' +
      '<a class="tab active" href="/account/profile/">MY DETAILS</a>' +
      '<a class="tab" href="/account/">ACCOUNT</a>' +
    '</div>';
  }

  function fill(profile, session) {
    document.getElementById('pf_email').value = session.user.email || '';
    document.getElementById('profileWho').innerHTML =
      'Signed in as <b>' + PR.esc(session.user.email) + '</b>';
    if (!profile) return;
    ['name', 'mobile', 'address', 'city', 'state', 'pincode'].forEach(function (key) {
      var el = document.getElementById('pf_' + key);
      if (el && profile[key]) el.value = profile[key];
    });
  }

  async function submit(event) {
    event.preventDefault();
    var button = document.getElementById('profileBtn');
    PR.clearFormError(event.target);

    var values = PR.validateForm(event.target, [
      { el: 'pf_name', name: 'name', label: 'Full name', required: true },
      { el: 'pf_mobile', name: 'mobile', label: 'Mobile number', type: 'mobile' },
      { el: 'pf_address', name: 'address', label: 'Address' },
      { el: 'pf_city', name: 'city', label: 'City' },
      { el: 'pf_state', name: 'state', label: 'State' },
      { el: 'pf_pincode', name: 'pincode', label: 'Pincode', type: 'pincode' }
    ]);
    if (!values) return;

    PR.setBusy(button, true, 'SAVING…');
    try {
      await PR.account.saveProfile(values);
      PR.setBusy(button, false);
      PR.toast('Your details have been saved.', 'success');
      var box = document.createElement('div');
      box.className = 'form-message success';
      box.setAttribute('role', 'status');
      box.textContent = 'Saved. Checkout will fill these in for you next time.';
      event.target.prepend(box);
      setTimeout(function () { box.remove(); }, 5000);
    } catch (err) {
      PR.setBusy(button, false);
      PR.showFormError(event.target, err.message);
      PR.toast(err.message, 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    PR.mountLayout('');
    document.getElementById('accountNav').innerHTML = nav();
    PR.fillStates(document.getElementById('pf_state'));

    var session = await PR.account.requireSignIn();
    if (!session) return;

    try {
      fill(await PR.account.loadProfile(), session);
    } catch (err) {
      PR.toast(err.message, 'error');
    }

    document.getElementById('profileForm').addEventListener('submit', submit);

    document.getElementById('signOutBtn').addEventListener('click', async function () {
      await PR.account.signOut();
      window.location.href = '/';
    });

    document.getElementById('changePasswordBtn').addEventListener('click', function () {
      window.location.href = '/set-password/';
    });
  });
})();
