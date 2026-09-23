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

  /* ------------------------------------------------------------ addresses */
  var addresses = [];
  var editingAddress = null;

  async function loadAddresses() {
    addresses = await PR.call('load addresses', function (sb) {
      return sb.from('customer_addresses').select('*').order('is_default', { ascending: false }).order('created_at');
    }) || [];
    renderAddresses();
  }

  function renderAddresses() {
    var host = document.getElementById('addressList');
    if (!addresses.length) {
      host.innerHTML = '<p class="small-note">No saved addresses yet. Add one so checkout can fill itself in.</p>';
      return;
    }
    host.innerHTML = addresses.map(function (a) {
      return '<div style="border:1px solid var(--line);border-radius:10px;padding:14px;margin-bottom:10px">' +
        '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">' +
          '<div><b>' + PR.esc(a.label || 'Address') + '</b>' +
            (a.is_default ? ' <span class="pill delivered">DEFAULT</span>' : '') +
            '<div class="small-note" style="margin-top:6px;line-height:1.7">' +
              PR.esc(a.name) + ' · ' + PR.esc(a.mobile) + '<br>' +
              PR.esc(a.address) + '<br>' +
              PR.esc([a.city, a.state, a.pincode].filter(Boolean).join(', ')) +
            '</div></div>' +
          '<div style="display:flex;flex-direction:column;gap:6px;flex:none">' +
            (a.is_default ? '' : '<button class="outline" type="button" data-addr-default="' + PR.esc(a.id) + '" style="padding:6px 10px;font-size:12px">Set Default</button>') +
            '<button class="outline" type="button" data-addr-edit="' + PR.esc(a.id) + '" style="padding:6px 10px;font-size:12px">Edit</button>' +
            '<button class="outline" type="button" data-addr-delete="' + PR.esc(a.id) + '" style="padding:6px 10px;font-size:12px;color:var(--red);border-color:#f0c9c9">Delete</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function openAddressForm(address) {
    editingAddress = address || null;
    var form = document.getElementById('addressForm');
    document.getElementById('addressFormMessage').innerHTML = '';
    ['label', 'name', 'mobile', 'address', 'city', 'pincode'].forEach(function (key) {
      document.getElementById('af_' + key).value = (address && address[key]) || '';
    });
    document.getElementById('af_state').value = (address && address.state) || '';
    document.getElementById('af_default').checked = !!(address && address.is_default);
    document.getElementById('saveAddressBtn').textContent = address ? 'SAVE CHANGES' : 'SAVE ADDRESS';
    document.getElementById('addressFormWrap').hidden = false;
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function closeAddressForm() {
    editingAddress = null;
    document.getElementById('addressForm').reset();
    document.getElementById('addressFormWrap').hidden = true;
  }

  async function saveAddress(event) {
    event.preventDefault();
    var button = document.getElementById('saveAddressBtn');
    var messageHost = document.getElementById('addressFormMessage');
    messageHost.innerHTML = '';

    var values = PR.validateForm(event.target, [
      { el: 'af_name', name: 'name', label: 'Full name', required: true },
      { el: 'af_mobile', name: 'mobile', label: 'Mobile number', required: true, type: 'mobile' },
      { el: 'af_address', name: 'address', label: 'Address', required: true },
      { el: 'af_city', name: 'city', label: 'City', required: true },
      { el: 'af_state', name: 'state', label: 'State', required: true },
      { el: 'af_pincode', name: 'pincode', label: 'Pincode', required: true, type: 'pincode' }
    ]);
    if (!values) return;

    var payload = {
      label: document.getElementById('af_label').value.trim() || null,
      name: values.name, mobile: values.mobile, address: values.address,
      city: values.city, state: values.state, pincode: values.pincode,
      is_default: document.getElementById('af_default').checked
    };

    PR.setBusy(button, true, 'SAVING…');
    try {
      if (payload.is_default) {
        await PR.call('clear default address', function (sb) {
          return sb.from('customer_addresses').update({ is_default: false }).eq('is_default', true);
        });
      }
      if (editingAddress) {
        await PR.call('update address', function (sb) {
          return sb.from('customer_addresses').update(payload).eq('id', editingAddress.id);
        });
      } else {
        var session = await PR.account.getSession();
        payload.user_id = session.user.id;
        await PR.call('create address', function (sb) { return sb.from('customer_addresses').insert(payload); });
      }
      PR.setBusy(button, false);
      PR.toast('Address saved.', 'success');
      closeAddressForm();
      await loadAddresses();
    } catch (err) {
      PR.setBusy(button, false);
      messageHost.innerHTML = '<div class="form-message error" role="alert">' + PR.esc(err.message) + '</div>';
      PR.toast(err.message, 'error');
    }
  }

  async function setDefaultAddress(id) {
    try {
      await PR.call('clear default address', function (sb) {
        return sb.from('customer_addresses').update({ is_default: false }).eq('is_default', true);
      });
      await PR.call('set default address', function (sb) {
        return sb.from('customer_addresses').update({ is_default: true }).eq('id', id);
      });
      PR.toast('Default address updated.', 'success');
      await loadAddresses();
    } catch (err) { PR.toast(err.message, 'error'); }
  }

  async function deleteAddress(id) {
    if (!confirm('Delete this saved address?')) return;
    try {
      await PR.call('delete address', function (sb) { return sb.from('customer_addresses').delete().eq('id', id); });
      PR.toast('Address deleted.', 'success');
      await loadAddresses();
    } catch (err) { PR.toast(err.message, 'error'); }
  }

  function bindAddressUi() {
    PR.fillStates(document.getElementById('af_state'));
    document.getElementById('addAddressBtn').addEventListener('click', function () { openAddressForm(null); });
    document.getElementById('cancelAddressBtn').addEventListener('click', closeAddressForm);
    document.getElementById('addressForm').addEventListener('submit', saveAddress);
    document.getElementById('addressList').addEventListener('click', function (event) {
      var editBtn = event.target.closest('[data-addr-edit]');
      if (editBtn) {
        var a = addresses.find(function (x) { return String(x.id) === editBtn.getAttribute('data-addr-edit'); });
        if (a) openAddressForm(a);
        return;
      }
      var defBtn = event.target.closest('[data-addr-default]');
      if (defBtn) { setDefaultAddress(defBtn.getAttribute('data-addr-default')); return; }
      var delBtn = event.target.closest('[data-addr-delete]');
      if (delBtn) deleteAddress(delBtn.getAttribute('data-addr-delete'));
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

    bindAddressUi();
    try {
      await loadAddresses();
    } catch (err) {
      console.error('[PowerRun] could not load saved addresses:', err);
    }

    document.getElementById('signOutBtn').addEventListener('click', async function () {
      await PR.account.signOut();
      window.location.href = '/';
    });

    document.getElementById('changePasswordBtn').addEventListener('click', function () {
      window.location.href = '/set-password/';
    });
  });
})();
