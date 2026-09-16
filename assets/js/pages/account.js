/* Customer account - sign in, register, and link a guest order. */
(function () {
  'use strict';
  var PR = window.PR;
  var mode = 'signin';

  function nextUrl() {
    var next = PR.param('next');
    // Only ever send people back into our own customer pages.
    if (next && /^\/(account|cart|checkout|products)(\/|$)/.test(next)) return next;
    return '/account/orders/';
  }

  function renderSignedOut() {
    var host = document.getElementById('accountPanel');
    var isSignIn = mode === 'signin';

    host.innerHTML =
      '<div class="tabs" style="margin-bottom:18px">' +
        '<button class="tab' + (isSignIn ? ' active' : '') + '" type="button" data-mode="signin">SIGN IN</button>' +
        '<button class="tab' + (isSignIn ? '' : ' active') + '" type="button" data-mode="signup">CREATE ACCOUNT</button>' +
      '</div>' +
      '<div id="accountMessage"></div>' +
      '<form class="form" id="accountForm" novalidate>' +
        (isSignIn ? '' :
          '<div class="form-grid">' +
            '<label>Full Name <span class="req">*</span><input id="ac_name" required maxlength="120" autocomplete="name"></label>' +
            '<label>Mobile Number<input id="ac_mobile" inputmode="numeric" maxlength="10" autocomplete="tel-national"></label>' +
          '</div>') +
        '<label>Email Address <span class="req">*</span>' +
          '<input id="ac_email" type="email" required autocomplete="email"></label>' +
        '<label>Password <span class="req">*</span>' +
          '<input id="ac_password" type="password" required minlength="8" ' +
          'autocomplete="' + (isSignIn ? 'current-password' : 'new-password') + '">' +
          (isSignIn ? '' : '<span class="small-note">At least 8 characters, with a capital, a lower-case ' +
                           'letter, a number and a symbol.</span>') +
        '</label>' +
        '<button class="btn orange block" id="accountBtn" type="submit">' +
          (isSignIn ? 'SIGN IN' : 'CREATE MY ACCOUNT') + '</button>' +
      '</form>' +
      (isSignIn
        ? '<p class="small-note" style="margin-top:14px">Forgotten your password? ' +
          '<a href="#" id="forgotLink" style="color:var(--orange);font-weight:800">Email me a reset link</a></p>'
        : '<p class="small-note" style="margin-top:14px">Creating an account is optional — ' +
          'you can order as a guest at any time.</p>');

    host.querySelectorAll('[data-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        mode = btn.getAttribute('data-mode');
        renderSignedOut();
      });
    });
    document.getElementById('accountForm').addEventListener('submit', submit);
    var forgot = document.getElementById('forgotLink');
    if (forgot) forgot.addEventListener('click', sendReset);
  }

  function message(text, type) {
    document.getElementById('accountMessage').innerHTML =
      '<div class="form-message ' + (type || 'error') + '" role="alert">' + PR.esc(text) + '</div>';
  }

  async function sendReset(event) {
    event.preventDefault();
    var email = (document.getElementById('ac_email').value || '').trim();
    if (!PR.isValidEmail(email)) {
      message('Enter your email address above first, then click the reset link.');
      return;
    }
    try {
      var result = await PR.sb.auth.resetPasswordForEmail(email);
      if (result.error) throw new Error(result.error.message);
      message('If an account exists for ' + email + ', a reset link is on its way.', 'success');
    } catch (err) {
      console.error('[PowerRun] reset email failed:', err);
      message(/rate limit/i.test(err.message)
        ? 'Too many emails have been sent recently. Please try again in an hour, or call us on +91 87003 07676.'
        : err.message);
    }
  }

  async function submit(event) {
    event.preventDefault();
    var button = document.getElementById('accountBtn');
    var isSignIn = mode === 'signin';
    document.getElementById('accountMessage').innerHTML = '';

    var rules = [
      { el: 'ac_email', name: 'email', label: 'Email address', required: true, type: 'email' },
      { el: 'ac_password', name: 'password', label: 'Password', required: true }
    ];
    if (!isSignIn) {
      rules.unshift({ el: 'ac_name', name: 'name', label: 'Full name', required: true });
      rules.push({ el: 'ac_mobile', name: 'mobile', label: 'Mobile number', type: 'mobile' });
    }
    var values = PR.validateForm(event.target, rules);
    if (!values) return;

    var password = document.getElementById('ac_password').value;
    PR.setBusy(button, true, isSignIn ? 'SIGNING IN…' : 'CREATING…');

    try {
      if (isSignIn) {
        await PR.account.signIn(values.email, password);
      } else {
        var result = await PR.account.signUp(values.email, password, values.name, values.mobile);
        if (result.needsConfirmation) {
          PR.setBusy(button, false);
          message('Account created. Please open the confirmation email we just sent to ' +
                  values.email + ', then sign in.', 'success');
          mode = 'signin';
          setTimeout(renderSignedOut, 2500);
          return;
        }
      }
      // An admin signing in here would be confusing; send them where they belong.
      if (await PR.account.isAdmin()) {
        window.location.href = '/admin/dashboard/';
        return;
      }
      window.location.href = nextUrl();
    } catch (err) {
      PR.setBusy(button, false);
      message(err.message);
    }
  }

  async function renderSignedIn(session) {
    var host = document.getElementById('accountPanel');
    var orders = [];
    try {
      orders = await PR.account.loadOrders();
    } catch (err) {
      console.error(err);
    }

    host.innerHTML =
      '<h2>Welcome back</h2>' +
      '<p class="small-note">Signed in as <b>' + PR.esc(session.user.email) + '</b></p>' +
      '<div class="summary-row" style="border-top:1px solid #eee;margin-top:12px;padding-top:14px">' +
        '<span>Orders in this account</span><b>' + orders.length + '</b></div>' +
      '<div class="form" style="margin-top:16px">' +
        '<a class="btn orange block" href="/account/orders/">MY ORDERS</a>' +
        '<a class="outline block" href="/account/profile/">MY DETAILS</a>' +
        '<button class="outline block" type="button" id="signOutBtn">SIGN OUT</button>' +
      '</div>' +
      '<div style="border-top:1px solid #eee;margin-top:22px;padding-top:18px">' +
        '<h2 style="font-size:17px">Add a guest order</h2>' +
        '<p class="small-note">Ordered without signing in? Add it here to see it alongside the rest.</p>' +
        '<div id="claimMessage"></div>' +
        '<form class="form" id="claimForm" novalidate>' +
          '<div class="form-grid">' +
            '<label>Order ID <span class="req">*</span><input id="cl_order" required placeholder="PR-2026-00001" maxlength="40"></label>' +
            '<label>Mobile Used <span class="req">*</span><input id="cl_mobile" required inputmode="numeric" maxlength="10"></label>' +
          '</div>' +
          '<button class="outline" id="claimBtn" type="submit">ADD THIS ORDER</button>' +
        '</form>' +
      '</div>';

    document.getElementById('signOutBtn').addEventListener('click', async function () {
      await PR.account.signOut();
      window.location.reload();
    });
    document.getElementById('claimForm').addEventListener('submit', claim);
  }

  async function claim(event) {
    event.preventDefault();
    var button = document.getElementById('claimBtn');
    var host = document.getElementById('claimMessage');
    host.innerHTML = '';

    var values = PR.validateForm(event.target, [
      { el: 'cl_order', name: 'order', label: 'Order ID', required: true },
      { el: 'cl_mobile', name: 'mobile', label: 'Mobile number', required: true, type: 'mobile' }
    ]);
    if (!values) return;

    PR.setBusy(button, true, 'ADDING…');
    try {
      var result = await PR.account.claimOrder(values.order, values.mobile);
      PR.toast('Order ' + result.order_number + ' added to your account.', 'success');
      window.location.href = '/account/orders/';
    } catch (err) {
      PR.setBusy(button, false);
      host.innerHTML = '<div class="form-message error" role="alert">' + PR.esc(err.message) + '</div>';
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    PR.mountLayout('');
    if (!PR.sb) {
      document.getElementById('accountPanel').innerHTML =
        '<div class="form-message error">Cannot reach the server. Please reload the page.</div>';
      return;
    }
    var session = await PR.account.getSession();
    if (session) renderSignedIn(session);
    else renderSignedOut();
  });
})();
