/* /admin/ entry point - sends the visitor to the dashboard (which enforces the
 * guard) or to the login page. */
(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', async function () {
    var PR = window.PR;
    if (!PR.sb) { window.location.replace('/admin/login/'); return; }
    try {
      var result = await PR.sb.auth.getSession();
      var session = result && result.data ? result.data.session : null;
      window.location.replace(session ? '/admin/dashboard/' : '/admin/login/');
    } catch (err) {
      window.location.replace('/admin/login/');
    }
  });
})();
