/* Admin - store settings and admin users */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var settings = {};
  var admins = [];
  var contentHost = null;

  async function loadAll() {
    var results = await Promise.all([
      PR.call('load settings', function (sb) { return sb.from('site_settings').select('*'); }),
      PR.call('load admin users', function (sb) {
        return sb.from('admin_users').select('*').order('created_at');
      })
    ]);
    settings = {};
    (results[0] || []).forEach(function (row) { settings[row.key] = row.value; });
    admins = results[1] || [];
  }

  function render(host) {
    var shipping = settings.shipping || { flat_rate: 0, free_above: 0 };
    var payments = settings.payments || { razorpay_enabled: false, cod_enabled: true };
    var store = settings.store || {};
    var razorpayConfigured = !!PR.config.RAZORPAY_KEY_ID;

    host.innerHTML =
      '<div class="panel">' +
        '<h2>Shipping</h2>' +
        '<form class="form" id="shippingForm">' +
          '<div id="shippingMessage"></div>' +
          '<div class="form-grid">' +
            '<label>Flat Shipping Charge (₹)' +
              '<input id="st_flat" type="number" min="0" step="1" value="' +
              PR.esc(Number(shipping.flat_rate) || 0) + '">' +
              '<span class="hint">Set 0 for free shipping on every order.</span></label>' +
            '<label>Free Shipping Above (₹)' +
              '<input id="st_free" type="number" min="0" step="1" value="' +
              PR.esc(Number(shipping.free_above) || 0) + '">' +
              '<span class="hint">Set 0 to disable this threshold.</span></label>' +
          '</div>' +
          '<p class="hint">These values are applied by the database when an order is placed, ' +
            'not by the browser.</p>' +
          '<div class="page-actions" style="justify-content:flex-end">' +
            '<button class="btn" type="submit" id="saveShippingBtn">SAVE SHIPPING</button></div>' +
        '</form>' +
      '</div>' +

      '<div class="panel">' +
        '<h2>Payments</h2>' +
        '<form class="form" id="paymentsForm">' +
          '<div id="paymentsMessage"></div>' +
          '<label class="inline"><input id="st_cod" type="checkbox"' +
            (payments.cod_enabled !== false ? ' checked' : '') + '> ' +
            'Allow "Pay on Confirmation" (order now, confirm payment by phone)</label>' +
          '<label class="inline"><input id="st_razorpay" type="checkbox"' +
            (payments.razorpay_enabled ? ' checked' : '') +
            (razorpayConfigured ? '' : ' disabled') + '> ' +
            'Allow online payment via Razorpay</label>' +
          (razorpayConfigured
            ? '<p class="form-message success">Razorpay public key is configured in ' +
              '<code>/assets/js/config.js</code>.</p>'
            : '<p class="form-message error">Razorpay is not configured yet, so online payment ' +
              'cannot be switched on. Two values are required:<br><br>' +
              '<b>1. RAZORPAY_KEY_ID</b> — set it in <code>/assets/js/config.js</code> ' +
              '(public key, safe in the browser).<br>' +
              '<b>2. RAZORPAY_KEY_SECRET</b> — set it as a Supabase Edge Function secret ' +
              '(never in any file served to the browser).</p>') +
          '<div class="page-actions" style="justify-content:flex-end">' +
            '<button class="btn" type="submit" id="savePaymentsBtn">SAVE PAYMENTS</button></div>' +
        '</form>' +
      '</div>' +

      '<div class="panel">' +
        '<h2>Store Contact Details</h2>' +
        '<form class="form" id="storeForm">' +
          '<div id="storeMessage"></div>' +
          '<div class="form-grid">' +
            '<label>Phone<input id="st_phone" value="' + PR.esc(store.phone || '') + '"></label>' +
            '<label>WhatsApp Number<input id="st_whatsapp" value="' + PR.esc(store.whatsapp || '') +
              '"><span class="hint">Country code, no + (e.g. 918700307676).</span></label>' +
          '</div>' +
          '<label>Email<input id="st_email" type="email" value="' + PR.esc(store.email || '') + '"></label>' +
          '<p class="hint">These are used by the admin panel. The storefront header and footer read ' +
            'from <code>/assets/js/config.js</code>.</p>' +
          '<div class="page-actions" style="justify-content:flex-end">' +
            '<button class="btn" type="submit" id="saveStoreBtn">SAVE CONTACT DETAILS</button></div>' +
        '</form>' +
      '</div>' +

      '<div class="panel">' +
        '<h2>Admin Users</h2>' +
        '<p class="hint" style="margin-top:0">Anyone listed here and marked active can sign in at ' +
          '/admin/login/. Access is enforced by the database, not by the browser.</p>' +
        '<div class="table-scroll"><table class="grid"><thead><tr>' +
          '<th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Added</th>' +
        '</tr></thead><tbody>' +
        admins.map(function (a) {
          var self = PRA.session && PRA.session.user && a.user_id === PRA.session.user.id;
          return '<tr><td><b>' + PR.esc(a.name || '-') + '</b>' +
            (self ? '<small>This is you</small>' : '') + '</td>' +
            '<td>' + PR.esc(a.email || '-') + '</td>' +
            '<td>' + PR.esc(a.role || 'admin') + '</td>' +
            '<td>' + PRA.pill(a.is_active === false ? 'inactive' : 'active') + '</td>' +
            '<td class="nowrap">' + PR.formatDate(a.created_at) + '</td></tr>';
        }).join('') +
        '</tbody></table></div>' +
        '<p class="hint">To add an administrator: create the user in Supabase ' +
          '(Authentication → Users), then insert a row into <code>admin_users</code> with that ' +
          'user’s id. Creating login accounts is deliberately not possible from this panel.</p>' +
      '</div>' +

      '<div class="panel">' +
        '<h2>Session</h2>' +
        '<p class="hint" style="margin-top:0">Signed in as <b>' +
          PR.esc((PRA.session && PRA.session.user && PRA.session.user.email) || '') + '</b></p>' +
        '<button class="btn danger" type="button" id="settingsLogout">SIGN OUT</button>' +
      '</div>';

    bind();
  }

  async function saveSetting(key, value, button, messageHostId) {
    var messageHost = document.getElementById(messageHostId);
    if (messageHost) messageHost.innerHTML = '';
    PR.setBusy(button, true, 'SAVING…');
    try {
      await PR.call('save settings', function (sb) {
        return sb.from('site_settings').upsert({ key: key, value: value }, { onConflict: 'key' });
      });
      PR.setBusy(button, false);
      PR.toast('Settings saved.', 'success');
      if (messageHost) {
        messageHost.innerHTML = '<div class="form-message success" role="status">Saved.</div>';
      }
      await loadAll();
    } catch (err) {
      PR.setBusy(button, false);
      if (messageHost) {
        messageHost.innerHTML = '<div class="form-message error" role="alert">' + PR.esc(err.message) + '</div>';
      }
      PR.toast(err.message, 'error');
    }
  }

  function bind() {
    document.getElementById('shippingForm').addEventListener('submit', function (event) {
      event.preventDefault();
      saveSetting('shipping', {
        flat_rate: Number(document.getElementById('st_flat').value) || 0,
        free_above: Number(document.getElementById('st_free').value) || 0
      }, document.getElementById('saveShippingBtn'), 'shippingMessage');
    });

    document.getElementById('paymentsForm').addEventListener('submit', function (event) {
      event.preventDefault();
      var cod = document.getElementById('st_cod').checked;
      var razorpay = document.getElementById('st_razorpay').checked;
      if (!cod && !razorpay) {
        document.getElementById('paymentsMessage').innerHTML =
          '<div class="form-message error" role="alert">At least one payment method must stay enabled, ' +
          'otherwise customers cannot place an order.</div>';
        return;
      }
      saveSetting('payments', { cod_enabled: cod, razorpay_enabled: razorpay },
        document.getElementById('savePaymentsBtn'), 'paymentsMessage');
    });

    document.getElementById('storeForm').addEventListener('submit', function (event) {
      event.preventDefault();
      saveSetting('store', {
        name: 'PowerRun Industries',
        phone: document.getElementById('st_phone').value.trim(),
        whatsapp: document.getElementById('st_whatsapp').value.trim(),
        email: document.getElementById('st_email').value.trim()
      }, document.getElementById('saveStoreBtn'), 'storeMessage');
    });

    document.getElementById('settingsLogout').addEventListener('click', function () {
      if (confirm('Sign out of the PowerRun admin panel?')) PRA.logout();
    });
  }

  PRA.boot('settings', 'Settings', async function (host) {
    contentHost = host;
    host.innerHTML = '<div class="panel">' + PRA.skeleton(5) + '</div>';
    await loadAll();
    render(host);
  });
})();
