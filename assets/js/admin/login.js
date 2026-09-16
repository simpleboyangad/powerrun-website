/* Admin login.
 *
 * Signs in with Supabase Auth, then asks the DATABASE whether this account is
 * an admin (public.is_admin(), which reads admin_users server-side). A user who
 * authenticates but is not in admin_users is signed straight back out, and in
 * any case every admin table is guarded by RLS that performs the same check.
 */
(function () {
  'use strict';
  var PR = window.PR;

  var NOTICES = {
    denied: 'That account is not authorised to use the PowerRun admin panel.',
    error: 'Your session could not be verified. Please sign in again.'
  };

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

      var isAdmin = await PR.call('verify admin access', function (sb) { return sb.rpc('is_admin'); });
      if (!isAdmin) {
        await PR.sb.auth.signOut();
        throw new Error(NOTICES.denied);
      }

      PR.toast('Signed in. Loading your dashboard…', 'success');
      window.location.replace(safeNext());
    } catch (err) {
      PR.setBusy(button, false);
      notice(err.message);
      PR.toast(err.message, 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    var reason = PR.param('reason');
    if (reason && NOTICES[reason]) notice(NOTICES[reason]);

    document.getElementById('loginForm').addEventListener('submit', submit);

    // If a valid admin session already exists, skip the form.
    if (!PR.sb) { notice('Cannot reach the server. Check your connection and reload.'); return; }
    try {
      var result = await PR.sb.auth.getSession();
      if (result && result.data && result.data.session) {
        var isAdmin = await PR.call('verify admin access', function (sb) { return sb.rpc('is_admin'); });
        if (isAdmin) window.location.replace(safeNext());
        else await PR.sb.auth.signOut();
      }
    } catch (err) {
      console.warn('[PowerRun] existing session check failed:', err.message);
    }
  });
})();
