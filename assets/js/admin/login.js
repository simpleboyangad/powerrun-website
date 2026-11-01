/* Admin login.
 *
 * Signs in with Supabase Auth, then asks the DATABASE whether this account is
 * an admin (public.is_admin(), which reads admin_users server-side). A user who
 * authenticates but is not in admin_users is signed straight back out, and in
 * any case every admin table is guarded by RLS that performs the same check.
 *
 * 2-step login (TOTP): after the password, an admin must also enter the 6-digit
 * code from an authenticator app. The first time, the page links the app (QR
 * code) before letting them in. Once an account has a verified factor, the
 * database itself (public.pr_mfa_ok(), sql/47) refuses admin access to any
 * session that has not passed the code step (aal2), so a stolen password alone
 * opens nothing.
 */
(function () {
  'use strict';
  var PR = window.PR;

  var NOTICES = {
    denied: 'That account is not authorised to use the PowerRun admin panel.',
    error: 'Your session could not be verified. Please sign in again.',
    mfa: 'Please complete 2-step login to continue.'
  };

  var enrollFactorId = null;

  function notice(message, type) {
    var host = document.getElementById('loginNotice');
    host.innerHTML = '<div class="form-message ' + (type || 'error') + '" role="alert">' +
      PR.esc(message) + '</div>';
  }

  function safeNext() {
    var next = PR.param('next');
    // Only ever redirect within our own admin area.
    if (next && /^\/admin\/[A-Za-z0-9\-/]*$/.test(next)) return next;
    return '/admin/dashboard/';
  }

  function showStep(id) {
    ['loginForm', 'mfaEnroll', 'mfaVerify'].forEach(function (step) {
      document.getElementById(step).hidden = step !== id;
    });
    document.getElementById('mfaCancel').hidden = id === 'loginForm';
    var input = id === 'mfaEnroll' ? 'mfa_enroll_code' : id === 'mfaVerify' ? 'mfa_verify_code' : null;
    if (input) setTimeout(function () { document.getElementById(input).focus(); }, 50);
  }

  function readCode(id) {
    var code = document.getElementById(id).value.replace(/\D/g, '');
    if (code.length !== 6) throw new Error('Enter the 6-digit code from your authenticator app.');
    return code;
  }

  function codeError(err) {
    return /invalid|expired|code/i.test(err.message || '')
      ? 'That code is wrong or has expired. Type the code the app shows now.'
      : err.message;
  }

  async function isAdmin() {
    return PR.call('verify admin access', function (sb) { return sb.rpc('is_admin'); });
  }

  /* Runs once the password is accepted (or a session already exists): decide
     between the code step, first-time setup, or straight in. */
  async function afterPassword() {
    var aal = await PR.sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal.error) throw aal.error;

    if (aal.data.currentLevel === 'aal2') {
      if (!(await isAdmin())) { await PR.sb.auth.signOut(); throw new Error(NOTICES.denied); }
      return enter();
    }

    // account already has an authenticator: ask for the code; is_admin is
    // checked after it, because the database answers "no" until then
    if (aal.data.nextLevel === 'aal2') return showStep('mfaVerify');

    // no authenticator yet: only a real admin gets the setup screen
    if (!(await isAdmin())) { await PR.sb.auth.signOut(); throw new Error(NOTICES.denied); }
    return startEnroll();
  }

  async function startEnroll() {
    // clear half-finished setups from an earlier visit, so the new QR is the only one
    var list = await PR.sb.auth.mfa.listFactors();
    if (list.error) throw list.error;
    var stale = (list.data.all || []).filter(function (f) { return f.factor_type === 'totp' && f.status !== 'verified'; });
    for (var i = 0; i < stale.length; i++) await PR.sb.auth.mfa.unenroll({ factorId: stale[i].id });

    var res = await PR.sb.auth.mfa.enroll({
      factorType: 'totp',
      issuer: 'PowerRun Admin',
      friendlyName: 'Authenticator ' + new Date().toISOString().slice(0, 10) + ' ' + Date.now().toString(36)
    });
    if (res.error) throw res.error;
    enrollFactorId = res.data.id;
    document.getElementById('mfaQr').innerHTML =
      '<img alt="QR code for the authenticator app" src="' + PR.esc(res.data.totp.qr_code) + '">';
    document.getElementById('mfaSecret').textContent = res.data.totp.secret;
    showStep('mfaEnroll');
  }

  function enter() {
    PR.toast('Signed in. Loading your dashboard…', 'success');
    window.location.replace(safeNext());
  }

  async function submit(event) {
    event.preventDefault();
    var form = event.target;
    var button = document.getElementById('loginBtn');
    document.getElementById('loginNotice').innerHTML = '';

    var values = PR.validateForm(form, [
      { el: 'lg_email', name: 'email', label: 'Email address', required: true, type: 'email' },
      { el: 'lg_password', name: 'password', label: 'Password', required: true }
    ]);
    if (!values) return;

    PR.setBusy(button, true, 'SIGNING IN…');

    try {
      var auth = await PR.sb.auth.signInWithPassword({
        email: values.email,
        password: document.getElementById('lg_password').value
      });
      if (auth.error) {
        console.error('[PowerRun] sign-in failed:', auth.error);
        throw new Error(/invalid login/i.test(auth.error.message)
          ? 'Incorrect email or password.'
          : auth.error.message);
      }
      document.getElementById('lg_password').value = '';
      await afterPassword();
      PR.setBusy(button, false);
    } catch (err) {
      PR.setBusy(button, false);
      notice(err.message);
      PR.toast(err.message, 'error');
    }
  }

  async function submitEnroll(event) {
    event.preventDefault();
    var button = document.getElementById('mfaEnrollBtn');
    document.getElementById('loginNotice').innerHTML = '';
    PR.setBusy(button, true, 'CHECKING…');
    try {
      var code = readCode('mfa_enroll_code');
      var res = await PR.sb.auth.mfa.challengeAndVerify({ factorId: enrollFactorId, code: code });
      if (res.error) throw new Error(codeError(res.error));
      PR.toast('2-step login is on.', 'success');
      enter();
    } catch (err) {
      PR.setBusy(button, false);
      notice(err.message);
    }
  }

  async function submitVerify(event) {
    event.preventDefault();
    var button = document.getElementById('mfaVerifyBtn');
    document.getElementById('loginNotice').innerHTML = '';
    PR.setBusy(button, true, 'VERIFYING…');
    try {
      var code = readCode('mfa_verify_code');
      var list = await PR.sb.auth.mfa.listFactors();
      if (list.error) throw list.error;
      var factor = (list.data.totp || [])[0];
      if (!factor) throw new Error('No authenticator is linked to this account.');
      var res = await PR.sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code });
      if (res.error) throw new Error(codeError(res.error));
      if (!(await isAdmin())) { await PR.sb.auth.signOut(); throw new Error(NOTICES.denied); }
      enter();
    } catch (err) {
      PR.setBusy(button, false);
      document.getElementById('mfa_verify_code').value = '';
      notice(err.message);
      if (err.message === NOTICES.denied) showStep('loginForm');
    }
  }

  async function cancel() {
    try { await PR.sb.auth.signOut(); } catch (err) { /* already signed out */ }
    document.getElementById('loginNotice').innerHTML = '';
    showStep('loginForm');
  }

  document.addEventListener('DOMContentLoaded', async function () {
    var reason = PR.param('reason');
    if (reason && NOTICES[reason]) notice(NOTICES[reason], reason === 'mfa' ? 'info' : 'error');

    document.getElementById('loginForm').addEventListener('submit', submit);
    document.getElementById('mfaEnroll').addEventListener('submit', submitEnroll);
    document.getElementById('mfaVerify').addEventListener('submit', submitVerify);
    document.getElementById('mfaCancel').addEventListener('click', cancel);

    // If a session already exists, carry on from where it stands (straight in,
    // code step, or first-time setup) instead of asking for the password again.
    if (!PR.sb) { notice('Cannot reach the server. Check your connection and reload.'); return; }
    try {
      var result = await PR.sb.auth.getSession();
      if (result && result.data && result.data.session) await afterPassword();
    } catch (err) {
      console.warn('[PowerRun] existing session check failed:', err.message);
      notice(err.message);
    }
  });
})();
