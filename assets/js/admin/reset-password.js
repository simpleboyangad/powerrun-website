/* Admin - set a new password.
 *
 * Handles two cases:
 *   1. Arriving from a Supabase "Reset your password" email. The link carries a
 *      recovery token in the URL fragment; supabase-js turns that into a
 *      short-lived recovery session, which is what authorises the change.
 *   2. An admin who is already signed in and simply wants to change it.
 *
 * The page never sees or needs the old password in case 1 - possession of the
 * emailed link is the proof.
 */
(function () {
  'use strict';
  var PR = window.PR;

  function notice(message, type) {
    document.getElementById('resetNotice').innerHTML =
      '<div class="form-message ' + (type || 'error') + '" role="alert">' + PR.esc(message) + '</div>';
  }

  function show(id) {
    ['resetLoading', 'resetForm', 'resetBlocked'].forEach(function (key) {
      var el = document.getElementById(key);
      if (el) el.hidden = key !== id;
    });
  }

  async function submit(event) {
    event.preventDefault();
    var button = document.getElementById('resetBtn');
    var form = event.target;
    document.getElementById('resetNotice').innerHTML = '';

    var values = PR.validateForm(form, [
      { el: 'rp_password', name: 'password', label: 'New password', required: true },
      { el: 'rp_confirm', name: 'confirm', label: 'Confirm password', required: true }
    ]);
    if (!values) return;

    var password = document.getElementById('rp_password').value;
    var confirm = document.getElementById('rp_confirm').value;

    if (password.length < 8) {
      PR.fieldError(document.getElementById('rp_password'), 'Use at least 8 characters.');
      notice('Your password must be at least 8 characters long.');
      return;
    }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) ||
        !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      PR.fieldError(document.getElementById('rp_password'),
        'Needs a lower-case letter, a capital, a number and a symbol.');
      notice('This project requires a lower-case letter, a capital letter, a number and a symbol.');
      return;
    }
    if (password !== confirm) {
      PR.fieldError(document.getElementById('rp_confirm'), 'The two passwords do not match.');
      notice('The two passwords do not match.');
      return;
    }

    PR.setBusy(button, true, 'SAVING…');
    try {
      var result = await PR.sb.auth.updateUser({ password: password });
      if (result.error) {
        console.error('[PowerRun] password update failed:', result.error);
        throw new Error(result.error.message);
      }
      show('resetForm');
      document.getElementById('resetForm').innerHTML =
        '<div style="text-align:center;padding:10px 0">' +
          '<div style="width:56px;height:56px;border-radius:50%;background:#1a9b52;color:#fff;' +
               'display:grid;place-items:center;font-size:30px;margin:0 auto 14px">✓</div>' +
          '<h2 style="margin:0 0 6px;font-size:19px">Password changed</h2>' +
          '<p class="hint">Use your new password from now on.</p>' +
          '<a class="btn block" href="/admin/login/" style="margin-top:14px">GO TO SIGN IN</a>' +
        '</div>';
      try { await PR.sb.auth.signOut(); } catch (err) { /* already effectively signed out */ }
    } catch (err) {
      PR.setBusy(button, false);
      var message = err.message || 'The password could not be changed.';
      if (/reauthentication|nonce/i.test(message)) {
        message = 'For security this project asks you to confirm your identity again. ' +
                  'Request a fresh "Reset your password" email and use that link.';
      } else if (/expired|invalid/i.test(message)) {
        message = 'This reset link has expired. Request a new one from Supabase and try again.';
      }
      notice(message);
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    if (!PR.sb) { notice('Cannot reach the server. Please reload the page.'); return; }

    // supabase-js consumes the token in the URL fragment on start-up; give it a
    // moment, then see whether we ended up with a session.
    var session = null;
    for (var attempt = 0; attempt < 12 && !session; attempt++) {
      var result = await PR.sb.auth.getSession();
      session = result && result.data ? result.data.session : null;
      if (!session) await new Promise(function (r) { setTimeout(r, 250); });
    }

    if (!session) {
      show('resetBlocked');
      return;
    }

    show('resetForm');
    document.getElementById('resetWho').textContent = session.user.email || '';
    document.getElementById('resetForm').addEventListener('submit', submit);
  });
})();
