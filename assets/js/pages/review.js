/* Review link page: /review/?t=<order review token>, sent by the admin on
 * WhatsApp once an order is delivered. Lists the products in that order and
 * lets the customer review each one without an account. Reviews are saved as
 * pending and only appear on the site after admin approval. */
(function () {
  'use strict';
  var PR = window.PR;
  var host;

  function stars(n) {
    var out = '';
    for (var i = 1; i <= 5; i++) out += i <= n ? '★' : '☆';
    return out;
  }

  function message(title, text) {
    host.innerHTML = '<div class="panel"><h2>' + PR.esc(title) + '</h2><p class="hint">' + PR.esc(text) + '</p>' +
      '<div class="detail-actions" style="margin-top:14px">' +
        '<a class="btn orange" href="/products/">VIEW PRODUCTS</a></div></div>';
  }

  function itemCard(item, index) {
    var link = '/products/' + encodeURIComponent(item.slug) + '/';
    var head =
      '<div style="display:flex;gap:12px;align-items:center">' +
        (item.image ? '<img src="' + PR.esc(item.image) + '" alt="" width="64" height="64" ' +
          'style="width:64px;height:64px;object-fit:contain;border:1px solid #eee;border-radius:8px;background:#fff">' : '') +
        '<a href="' + link + '" target="_blank" rel="noopener"><b>' + PR.esc(item.name) + '</b></a>' +
      '</div>';

    if (item.reviewed) {
      return '<div class="panel" style="margin-top:14px">' + head +
        '<p class="hint" style="margin-top:10px">✓ Is product ka review mil gaya hai. Dhanyavaad!</p></div>';
    }
    return '<div class="panel" style="margin-top:14px" data-item="' + index + '">' + head +
      '<form class="form review-form" novalidate style="margin-top:12px">' +
        '<label>Rating <span class="req">*</span>' +
          '<div class="star-picker" role="radiogroup" aria-label="Rating">' +
            [1, 2, 3, 4, 5].map(function (n) {
              return '<button type="button" class="star-btn" data-star="' + n + '" aria-label="' + n + ' star">☆</button>';
            }).join('') +
          '</div></label>' +
        '<label>Review <span class="req">*</span><textarea name="body" maxlength="2000" rows="4" ' +
          'placeholder="Product kaisa laga? Backup, charging, installation, service ke baare mein likhein…"></textarea></label>' +
        '<label>Title (optional)<input name="title" maxlength="120" placeholder="Ek line mein, jaise: Bahut badhiya backup"></label>' +
        '<label>Your Name<input name="name" maxlength="60"></label>' +
        '<button class="btn orange" type="submit">SUBMIT REVIEW</button>' +
      '</form></div>';
  }

  function render(data, token) {
    var items = data.items || [];
    if (!items.length) {
      message('Nothing to review', 'Is order mein review karne layak koi product nahi mila.');
      return;
    }
    host.innerHTML =
      '<div class="panel"><h2>Namaste' + (data.name ? ' ' + PR.esc(data.name) : '') + '!</h2>' +
        '<p class="hint">Order ' + PR.esc(data.order_number) + ' ke products ke baare mein apna anubhav batayein.</p></div>' +
      items.map(itemCard).join('');

    host.querySelectorAll('[data-item]').forEach(function (card) {
      var item = items[Number(card.getAttribute('data-item'))];
      var form = card.querySelector('form');
      var buttons = card.querySelectorAll('.star-btn');
      var chosen = 0;
      form.elements.name.value = data.name || '';

      buttons.forEach(function (btn, i) {
        btn.addEventListener('click', function () {
          chosen = i + 1;
          buttons.forEach(function (b, j) { b.textContent = j < chosen ? '★' : '☆'; });
        });
      });

      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        var body = form.elements.body.value.trim();
        if (!chosen) { PR.toast('Please select a star rating.', 'error'); return; }
        if (body.length < 10) { PR.toast('Please write a few words about the product.', 'error'); return; }
        var button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
          await PR.call('submit review', function (sb) {
            return sb.rpc('submit_review_by_token', {
              p_token: token, p_product_id: item.product_id, p_rating: chosen,
              p_title: form.elements.title.value, p_body: body, p_name: form.elements.name.value
            });
          });
          card.innerHTML = card.firstElementChild.outerHTML +
            '<p class="hint" style="margin-top:10px;color:#14663a">' + stars(chosen) +
            ' &nbsp;Review mil gaya, dhanyavaad! Approval ke baad ye website par dikhega.</p>';
          PR.toast('Thank you! Review submitted.', 'success');
        } catch (err) {
          button.disabled = false;
          PR.toast(err.message, 'error');
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    host = document.getElementById('reviewRequest');
    var token = new URLSearchParams(window.location.search).get('t') || '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
      message('Review link not valid', 'Kripya WhatsApp par mila poora link kholein, ya humein WhatsApp karein.');
      return;
    }
    try {
      var data = await PR.call('load review request', function (sb) {
        return sb.rpc('get_review_request', { p_token: token });
      });
      render(data || {}, token);
    } catch (err) {
      message('Review not available', err.message);
    }
  });
})();
