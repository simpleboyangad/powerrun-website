/* Admin - coupon / discount code management */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var coupons = [];
  var contentHost = null;
  var editing = null;

  async function loadAll() {
    coupons = await PR.call('load coupons', function (sb) {
      return sb.from('coupons').select('*').order('created_at', { ascending: false });
    }) || [];
  }

  function statusOf(c) {
    var now = new Date();
    if (!c.is_active) return 'inactive';
    if (c.valid_until && new Date(c.valid_until) < now) return 'cancelled';
    if (c.valid_from && new Date(c.valid_from) > now) return 'pending';
    if (c.usage_limit != null && c.usage_count >= c.usage_limit) return 'cancelled';
    return 'active';
  }

  function render(host) {
    host.innerHTML =
      '<div class="panel">' +
        '<div class="panel-head"><h2>Coupons</h2>' +
          '<div class="page-actions"><button class="btn" type="button" id="newCouponBtn">+ Add Coupon</button></div>' +
        '</div>' +
        (coupons.length
          ? '<div class="table-scroll"><table class="grid"><thead><tr>' +
              '<th>Code</th><th>Discount</th><th>Min Order</th><th>Usage</th><th>Validity</th><th>Status</th><th></th>' +
            '</tr></thead><tbody>' +
            coupons.map(function (c) {
              return '<tr><td><b>' + PR.esc(c.code) + '</b>' +
                  (c.show_on_site ? ' <span class="pill delivered">BANNER</span>' : '') +
                  (c.description ? '<small>' + PR.esc(c.description) + '</small>' : '') + '</td>' +
                '<td>' + (c.discount_type === 'percent'
                  ? c.discount_value + '%' + (c.max_discount_amount ? ' (max ' + PR.money(c.max_discount_amount) + ')' : '')
                  : PR.money(c.discount_value)) + '</td>' +
                '<td>' + (c.min_order_amount > 0 ? PR.money(c.min_order_amount) : '-') + '</td>' +
                '<td>' + c.usage_count + (c.usage_limit != null ? ' / ' + c.usage_limit : '') +
                  (c.per_customer_limit ? '<small>' + c.per_customer_limit + ' per customer</small>' : '') + '</td>' +
                '<td class="nowrap">' +
                  (c.valid_from ? PR.formatDate(c.valid_from) : 'Anytime') + ' &rarr; ' +
                  (c.valid_until ? PR.formatDate(c.valid_until) : 'No expiry') + '</td>' +
                '<td>' + PRA.pill(statusOf(c)) + '</td>' +
                '<td class="nowrap">' +
                  '<button class="btn ghost small" type="button" data-edit-coupon="' + PR.esc(c.id) + '">Edit</button> ' +
                  '<button class="btn danger small" type="button" data-delete-coupon="' + PR.esc(c.id) + '">Delete</button>' +
                '</td></tr>';
            }).join('') +
            '</tbody></table></div>'
          : PRA.empty('No coupons yet', 'Add a discount code like "DIWALI10" to boost sales.')) +
      '</div>';
  }

  function toInputDate(value) {
    if (!value) return '';
    return new Date(value).toISOString().slice(0, 10);
  }

  function openForm(coupon) {
    editing = coupon || null;
    var c = coupon || {};

    var body = PRA.openDrawer(coupon ? 'Edit Coupon' : 'Add Coupon',
      '<form class="form" id="couponForm" novalidate>' +
        '<div id="couponFormMessage"></div>' +
        '<div class="form-grid">' +
          '<label>Coupon Code <span class="req">*</span>' +
            '<input id="cn_code" required maxlength="30" value="' + PR.esc(c.code || '') +
            '" placeholder="DIWALI10" style="text-transform:uppercase"></label>' +
          '<label>Description<input id="cn_description" maxlength="160" value="' + PR.esc(c.description || '') +
            '" placeholder="Diwali sale - 10% off"></label>' +
        '</div>' +
        '<div class="form-grid three">' +
          '<label>Discount Type<select id="cn_type">' +
            '<option value="percent"' + (c.discount_type !== 'flat' ? ' selected' : '') + '>Percent (%)</option>' +
            '<option value="flat"' + (c.discount_type === 'flat' ? ' selected' : '') + '>Flat Amount (₹)</option>' +
          '</select></label>' +
          '<label>Discount Value <span class="req">*</span>' +
            '<input id="cn_value" type="number" min="0" step="0.01" required value="' +
            PR.esc(c.discount_value == null ? '' : c.discount_value) + '"></label>' +
          '<label>Max Discount (₹)<input id="cn_max" type="number" min="0" step="1" value="' +
            PR.esc(c.max_discount_amount == null ? '' : c.max_discount_amount) + '">' +
            '<span class="hint">Caps a % coupon. Leave empty for no cap.</span></label>' +
        '</div>' +
        '<div class="form-grid three">' +
          '<label>Minimum Order (₹)<input id="cn_min" type="number" min="0" step="1" value="' +
            PR.esc(c.min_order_amount == null ? 0 : c.min_order_amount) + '"></label>' +
          '<label>Total Usage Limit<input id="cn_usage_limit" type="number" min="1" step="1" value="' +
            PR.esc(c.usage_limit == null ? '' : c.usage_limit) + '"><span class="hint">Empty = unlimited.</span></label>' +
          '<label>Limit Per Customer<input id="cn_customer_limit" type="number" min="1" step="1" value="' +
            PR.esc(c.per_customer_limit == null ? '' : c.per_customer_limit) + '"><span class="hint">Empty = unlimited.</span></label>' +
        '</div>' +
        '<div class="form-grid">' +
          '<label>Valid From<input id="cn_from" type="date" value="' + toInputDate(c.valid_from) + '">' +
            '<span class="hint">Empty = active immediately.</span></label>' +
          '<label>Valid Until<input id="cn_until" type="date" value="' + toInputDate(c.valid_until) + '">' +
            '<span class="hint">Empty = never expires.</span></label>' +
        '</div>' +
        '<label class="inline"><input id="cn_active" type="checkbox"' +
          (c.is_active === false ? '' : ' checked') + '> Active</label>' +
        '<div style="border:1px dashed var(--line);border-radius:10px;padding:14px">' +
          '<label class="inline"><input id="cn_show_on_site" type="checkbox"' +
            (c.show_on_site ? ' checked' : '') + '> Show as a site-wide banner</label>' +
          '<p class="hint" style="margin:6px 0 10px">Announces this code to every visitor at the top of the site. ' +
            'Only one coupon shows at a time (the most recent one marked here).</p>' +
          '<label>Banner Text (optional)<input id="cn_banner_text" maxlength="120" value="' + PR.esc(c.banner_text || '') +
            '" placeholder="Auto-generated from the discount if left empty"></label>' +
        '</div>' +
        (coupon ? '<p class="hint">Used ' + c.usage_count + ' time' + (c.usage_count === 1 ? '' : 's') + ' so far.</p>' : '') +
        '<div class="page-actions" style="justify-content:flex-end">' +
          '<button class="btn gray" type="button" id="cancelCouponBtn">Cancel</button>' +
          '<button class="btn" type="submit" id="saveCouponBtn">' + (coupon ? 'SAVE CHANGES' : 'ADD COUPON') + '</button>' +
        '</div>' +
      '</form>');

    document.getElementById('cancelCouponBtn').addEventListener('click', PRA.closeDrawer);
    document.getElementById('couponForm').addEventListener('submit', save);
    return body;
  }

  async function save(event) {
    event.preventDefault();
    var button = document.getElementById('saveCouponBtn');
    var messageHost = document.getElementById('couponFormMessage');
    messageHost.innerHTML = '';

    var values = PR.validateForm(event.target, [
      { el: 'cn_code', name: 'code', label: 'Coupon code', required: true },
      { el: 'cn_value', name: 'value', label: 'Discount value', required: true }
    ]);
    if (!values) return;

    var discountValue = Number(values.value);
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      PR.fieldError(document.getElementById('cn_value'), 'Enter a value greater than zero.');
      PR.toast('Enter a valid discount value.', 'error');
      return;
    }
    var discountType = document.getElementById('cn_type').value;
    if (discountType === 'percent' && discountValue > 100) {
      PR.fieldError(document.getElementById('cn_value'), 'A percent discount cannot exceed 100.');
      PR.toast('A percent discount cannot exceed 100.', 'error');
      return;
    }

    var maxRaw = document.getElementById('cn_max').value.trim();
    var limitRaw = document.getElementById('cn_usage_limit').value.trim();
    var custLimitRaw = document.getElementById('cn_customer_limit').value.trim();
    var fromRaw = document.getElementById('cn_from').value;
    var untilRaw = document.getElementById('cn_until').value;

    var payload = {
      code: values.code.toUpperCase().trim(),
      description: document.getElementById('cn_description').value.trim() || null,
      discount_type: discountType,
      discount_value: discountValue,
      min_order_amount: Number(document.getElementById('cn_min').value) || 0,
      max_discount_amount: maxRaw === '' ? null : Number(maxRaw),
      usage_limit: limitRaw === '' ? null : Number(limitRaw),
      per_customer_limit: custLimitRaw === '' ? null : Number(custLimitRaw),
      valid_from: fromRaw || null,
      valid_until: untilRaw || null,
      is_active: document.getElementById('cn_active').checked,
      show_on_site: document.getElementById('cn_show_on_site').checked,
      banner_text: document.getElementById('cn_banner_text').value.trim() || null
    };

    PR.setBusy(button, true, 'SAVING…');
    try {
      if (editing) {
        await PR.call('update coupon', function (sb) {
          return sb.from('coupons').update(payload).eq('id', editing.id);
        });
      } else {
        await PR.call('create coupon', function (sb) {
          return sb.from('coupons').insert(payload);
        });
      }
      PRA.closeDrawer();
      PR.toast('Coupon saved.', 'success');
      await refresh();
    } catch (err) {
      PR.setBusy(button, false);
      var msg = /duplicate key|already exists/i.test(err.message)
        ? 'A coupon with this code already exists.' : err.message;
      messageHost.innerHTML = '<div class="form-message error" role="alert">' + PR.esc(msg) + '</div>';
      PR.toast(msg, 'error');
    }
  }

  async function remove(id) {
    var coupon = coupons.find(function (c) { return c.id === id; });
    if (!coupon) return;
    if (!confirm('Delete coupon "' + coupon.code + '"?\n\nThis cannot be undone. Orders that already used it keep their discount.')) return;
    try {
      await PR.call('delete coupon', function (sb) { return sb.from('coupons').delete().eq('id', id); });
      PR.toast('Coupon deleted.', 'success');
      await refresh();
    } catch (err) {
      PR.toast(err.message, 'error');
    }
  }

  async function refresh() {
    await loadAll();
    render(contentHost);
  }

  document.addEventListener('click', function (event) {
    if (event.target.closest('#newCouponBtn')) { openForm(null); return; }
    var edit = event.target.closest('[data-edit-coupon]');
    if (edit) {
      var coupon = coupons.find(function (c) { return c.id === edit.getAttribute('data-edit-coupon'); });
      if (coupon) openForm(coupon);
      return;
    }
    var del = event.target.closest('[data-delete-coupon]');
    if (del) remove(del.getAttribute('data-delete-coupon'));
  });

  PRA.boot('coupons', 'Coupons', async function (host) {
    contentHost = host;
    host.innerHTML = '<div class="panel">' + PRA.skeleton(6) + '</div>';
    await loadAll();
    render(host);
  });
})();
