/* PowerRun Industries - customer account helpers.
 *
 * Customer accounts are optional: guests can still order without one. When a
 * customer IS signed in, create_website_order() stamps their auth.uid() onto
 * the order, and the orders_owner_read RLS policy lets them read it back.
 * Nothing here decides what a customer may see - the database does.
 */
(function () {
  'use strict';

  var PR = window.PR;
  var account = {};

  account.session = null;

  account.getSession = async function (force) {
    if (account.session && !force) return account.session;
    if (!PR.sb) return null;
    try {
      var result = await PR.sb.auth.getSession();
      account.session = result && result.data ? result.data.session : null;
    } catch (err) {
      console.error('[PowerRun] could not read the session:', err);
      account.session = null;
    }
    return account.session;
  };

  /* An admin signing in must not be treated as a shopper, and vice versa. */
  account.isAdmin = async function () {
    try {
      return await PR.call('check role', function (sb) { return sb.rpc('is_admin'); });
    } catch (err) {
      return false;
    }
  };

  account.signIn = async function (email, password) {
    var result = await PR.sb.auth.signInWithPassword({ email: email, password: password });
    if (result.error) {
      console.error('[PowerRun] customer sign-in failed:', result.error);
      throw new Error(/invalid login/i.test(result.error.message)
        ? 'Incorrect email or password.'
        : result.error.message);
    }
    account.session = result.data.session;
    return result.data;
  };

  account.signUp = async function (email, password, name, mobile) {
    var result = await PR.sb.auth.signUp({
      email: email,
      password: password,
      options: { data: { name: name, mobile: mobile } }
    });
    if (result.error) {
      console.error('[PowerRun] sign-up failed:', result.error);
      var message = result.error.message;
      if (/already registered|already exists/i.test(message)) {
        message = 'An account with this email already exists. Please sign in instead.';
      }
      throw new Error(message);
    }
    account.session = result.data.session;
    // When the project requires email confirmation, signUp returns no session.
    return { needsConfirmation: !result.data.session, data: result.data };
  };

  account.signOut = async function () {
    try { await PR.sb.auth.signOut(); } catch (err) { console.error(err); }
    account.session = null;
  };

  account.requireSignIn = async function () {
    var session = await account.getSession();
    if (!session) {
      window.location.replace('/account/?next=' + encodeURIComponent(window.location.pathname));
      return null;
    }
    return session;
  };

  /* -------------------------------------------------------------- profile */
  account.loadProfile = async function () {
    var session = await account.getSession();
    if (!session) return null;
    var rows = await PR.call('load your profile', function (sb) {
      return sb.from('customers').select('*').eq('user_id', session.user.id).limit(1);
    });
    return rows && rows.length ? rows[0] : null;
  };

  account.saveProfile = function (values) {
    return PR.call('save your details', function (sb) {
      return sb.rpc('upsert_my_customer', { p_data: values });
    });
  };

  /* --------------------------------------------------------------- orders */
  account.loadOrders = async function () {
    var session = await account.getSession();
    if (!session) return [];
    return await PR.call('load your orders', function (sb) {
      return sb.from('orders')
        .select('*, order_items(id,product_name,product_sku,quantity,unit_price,total_price)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
    }) || [];
  };

  account.loadOrder = async function (orderNumber) {
    var rows = await PR.call('load the order', function (sb) {
      return sb.from('orders')
        .select('*, order_items(id,product_name,product_sku,quantity,unit_price,total_price)')
        .eq('order_number', orderNumber)
        .limit(1);
    });
    return rows && rows.length ? rows[0] : null;
  };

  account.claimOrder = function (orderNumber, mobile) {
    return PR.call('link that order', function (sb) {
      return sb.rpc('claim_order', { p_order_number: orderNumber, p_mobile: mobile });
    });
  };

  /* Header link reflects whether someone is signed in. */
  account.decorateHeader = async function () {
    var link = document.querySelector('.actions a[href="/account/"]');
    if (!link) return;
    var session = await account.getSession();
    if (session) {
      link.setAttribute('title', 'My account (' + (session.user.email || '') + ')');
      link.setAttribute('aria-label', 'My account');
      link.classList.add('signed-in');
    }
  };

  PR.account = account;
})();
