/* PowerRun Industries - core runtime shared by the customer site and admin.
 *
 * Provides: the Supabase client, escaping/format helpers, toasts, button busy
 * states, and a single call wrapper so that no database error can ever fail
 * silently.
 */
(function () {
  'use strict';

  var cfg = window.PR_CONFIG || {};
  var PR = (window.PR = window.PR || {});

  PR.config = cfg;

  /* ------------------------------------------------- password-reset landing
   * Supabase sends "Reset your password" links to the project's Site URL, which
   * is the storefront home page. That page has no way to handle a recovery
   * token, so the visitor just lands on the shop and nothing happens.
   *
   * Catch that here, BEFORE the Supabase client is created (it would otherwise
   * consume and clear the fragment), and forward to the page that can act on it.
   */
  (function forwardPasswordRecovery() {
    var hash = window.location.hash || '';
    if (hash.indexOf('type=recovery') === -1) return;
    if (window.location.pathname.indexOf('/set-password') === 0) return;
    window.location.replace('/set-password/' + hash);
  })();

  /* ---------------------------------------------------------------- client */
  PR.sb = null;
  PR.clientError = null;

  if (window.supabase && window.supabase.createClient) {
    try {
      PR.sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    } catch (err) {
      PR.clientError = err;
      console.error('[PowerRun] Supabase client could not be created:', err);
    }
  } else {
    PR.clientError = new Error('Supabase library failed to load');
    console.error('[PowerRun] Supabase library failed to load (CDN blocked or offline).');
  }

  /* --------------------------------------------------------------- helpers */
  PR.esc = function (value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
      });
  };

  PR.money = function (value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return 'Price on request';
    return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  };

  PR.slugify = function (value) {
    return String(value || '').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  };

  PR.initials = function (name) {
    return String(name || 'PR').split(/\s+/).filter(Boolean).slice(0, 2)
      .map(function (w) { return w[0]; }).join('').toUpperCase();
  };

  PR.formatDate = function (value) {
    if (!value) return '-';
    var d = new Date(value);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  PR.formatDateTime = function (value) {
    if (!value) return '-';
    var d = new Date(value);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  PR.param = function (name) {
    return new URLSearchParams(window.location.search).get(name);
  };

  PR.isValidMobile = function (value) { return /^[6-9]\d{9}$/.test(String(value || '').trim()); };
  PR.isValidPincode = function (value) { return /^[1-9]\d{5}$/.test(String(value || '').trim()); };
  PR.isValidEmail = function (value) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value || '').trim()); };

  /* ---------------------------------------------------------------- toasts */
  function toastHost() {
    var host = document.querySelector('.toast-host');
    if (!host) {
      host = document.createElement('div');
      host.className = 'toast-host';
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    return host;
  }

  PR.toast = function (message, type) {
    var el = document.createElement('div');
    el.className = 'toast ' + (type || 'info');
    el.textContent = String(message);
    toastHost().appendChild(el);
    setTimeout(function () { el.classList.add('out'); }, type === 'error' ? 6000 : 3500);
    setTimeout(function () { el.remove(); }, type === 'error' ? 6400 : 3900);
    return el;
  };

  /* ------------------------------------------------------------ busy state */
  PR.setBusy = function (button, busy, label) {
    if (!button) return;
    if (busy) {
      if (!button.dataset.originalLabel) button.dataset.originalLabel = button.innerHTML;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.innerHTML = '<span class="spinner" aria-hidden="true"></span>' +
        PR.esc(label || 'Please wait…');
    } else {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      if (button.dataset.originalLabel) {
        button.innerHTML = button.dataset.originalLabel;
        delete button.dataset.originalLabel;
      }
    }
  };

  /* ------------------------------------------------- inline form messaging */
  PR.showFormError = function (container, message) {
    if (!container) return;
    var box = container.querySelector('.form-message');
    if (!box) {
      box = document.createElement('div');
      box.className = 'form-message';
      container.prepend(box);
    }
    box.className = 'form-message error';
    box.setAttribute('role', 'alert');
    box.textContent = message;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  PR.clearFormError = function (container) {
    if (!container) return;
    var box = container.querySelector('.form-message');
    if (box) box.remove();
  };

  /* ----------------------------------------------------------- call wrapper
   * Every Supabase interaction goes through this. It guarantees that:
   *   - the technical error is always logged for debugging,
   *   - the caller receives a readable message,
   *   - nothing ever fails silently.
   */
  PR.call = async function (label, fn) {
    if (!PR.sb) {
      var offline = new Error('Cannot reach the PowerRun servers. Please check your connection and reload the page.');
      console.error('[PowerRun] ' + label + ' skipped - no Supabase client.', PR.clientError);
      throw offline;
    }
    var result;
    try {
      result = await fn(PR.sb);
    } catch (err) {
      console.error('[PowerRun] ' + label + ' threw:', err);
      throw new Error(err && err.message ? err.message : 'Unexpected error during ' + label);
    }
    if (result && result.error) {
      console.error('[PowerRun] ' + label + ' failed:', result.error);
      throw new Error(PR.friendlyError(result.error, label));
    }
    return result ? result.data : null;
  };

  PR.friendlyError = function (error, label) {
    var msg = (error && (error.message || error.error_description)) || 'Unknown error';
    var code = error && error.code;

    if (code === '42501' || /row-level security|permission denied/i.test(msg)) {
      return 'You are not allowed to do that. Please sign in again with an authorised account.';
    }
    if (code === 'PGRST116') return 'That record no longer exists.';
    if (code === '23505' || /duplicate key/i.test(msg)) {
      return 'That value is already in use. Please choose a different one.';
    }
    if (code === '23503') return 'That record is still referenced elsewhere and cannot be removed.';
    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
      return 'Could not reach the server. Please check your internet connection and try again.';
    }
    // P0001 = a deliberate `raise exception` from one of our own functions;
    // those messages are already written for customers.
    return msg + (label ? '' : '');
  };

  /* -------------------------------------------------------------- settings */
  var settingsCache = null;
  PR.getSettings = async function () {
    if (settingsCache) return settingsCache;
    try {
      var rows = await PR.call('load site settings', function (sb) {
        return sb.from('site_settings').select('key,value');
      });
      settingsCache = {};
      (rows || []).forEach(function (row) { settingsCache[row.key] = row.value; });
    } catch (err) {
      console.warn('[PowerRun] falling back to default settings:', err.message);
      settingsCache = {};
    }
    if (!settingsCache.shipping) settingsCache.shipping = { flat_rate: 0, free_above: 0 };
    if (!settingsCache.payments) settingsCache.payments = { razorpay_enabled: false, cod_enabled: true };
    return settingsCache;
  };

  PR.shippingFor = function (subtotal, shipping) {
    var flat = Number(shipping && shipping.flat_rate) || 0;
    var freeAbove = Number(shipping && shipping.free_above) || 0;
    if (freeAbove > 0 && Number(subtotal) >= freeAbove) return 0;
    return flat;
  };


  /* ------------------------------------------------------- Indian states */
  PR.INDIA_STATES = ['Andaman and Nicobar Islands','Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chandigarh','Chhattisgarh','Dadra and Nagar Haveli and Daman and Diu','Delhi','Goa','Gujarat','Haryana','Himachal Pradesh','Jammu and Kashmir','Jharkhand','Karnataka','Kerala','Ladakh','Lakshadweep','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Puducherry','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal'];

  PR.fillStates = function (select, placeholder) {
    if (!select) return;
    select.innerHTML = '<option value="">' + PR.esc(placeholder || 'Select state…') + '</option>' +
      PR.INDIA_STATES.map(function (s) { return '<option>' + PR.esc(s) + '</option>'; }).join('');
  };

  /* --------------------------------------------------------- validation */
  PR.fieldError = function (input, message) {
    if (!input) return;
    var label = input.closest('label') || input.parentElement;
    var existing = label && label.querySelector('.field-error');
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      if (!existing && label) {
        var span = document.createElement('span');
        span.className = 'field-error';
        span.textContent = message;
        label.appendChild(span);
      } else if (existing) {
        existing.textContent = message;
      }
    } else {
      input.removeAttribute('aria-invalid');
      if (existing) existing.remove();
    }
  };

  /* rules: [{ el, label, required, type, min, max }] - returns values or null */
  PR.validateForm = function (form, rules) {
    var values = {};
    var firstBad = null;
    rules.forEach(function (rule) {
      var el = typeof rule.el === 'string' ? document.getElementById(rule.el) : rule.el;
      if (!el) return;
      var value = String(el.value || '').trim();
      var error = '';

      if (rule.required && !value) {
        error = (rule.label || 'This field') + ' is required.';
      } else if (value && rule.type === 'mobile' && !PR.isValidMobile(value)) {
        error = 'Enter a valid 10-digit Indian mobile number.';
      } else if (value && rule.type === 'email' && !PR.isValidEmail(value)) {
        error = 'Enter a valid email address.';
      } else if (value && rule.type === 'pincode' && !PR.isValidPincode(value)) {
        error = 'Enter a valid 6-digit pincode.';
      }

      PR.fieldError(el, error);
      if (error && !firstBad) firstBad = el;
      values[rule.name || el.id] = value || null;
    });

    if (firstBad) {
      firstBad.focus();
      firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
      PR.toast('Please correct the highlighted fields.', 'error');
      return null;
    }
    return values;
  };

  /* --------------------------------------------------------- whatsapp links */
  PR.whatsapp = function (text) {
    return 'https://wa.me/' + cfg.WHATSAPP + '?text=' + encodeURIComponent(text);
  };
})();
