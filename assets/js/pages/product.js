/* Product detail page */
(function () {
  'use strict';
  var PR = window.PR;

  var product = null;
  var qty = 1;

  /* SEO for this product: stored values first, then sensible fallbacks built
     from real product data. The clean /products/<slug>/ URL is the canonical
     one, so the older /product/?slug=... address points at it. */
  function setMeta(p) {
    var canonical = p.raw && p.raw.canonical_url ? p.raw.canonical_url : PR.seo.productUrl(p.slug);
    var title = p.metaTitle || (p.name + ' | ' + PR.config.COMPANY);
    var desc = p.metaDescription || p.shortDescription || (p.name + ' from ' + PR.config.COMPANY + '.');
    var raw = p.raw || {};
    var image = raw.og_image || (p.images.length ? p.images[0].url : '');

    PR.seo.apply({
      key: 'product',
      title: title,
      description: desc,
      keywords: [raw.focus_keyword, raw.secondary_keywords].filter(Boolean).join(', '),
      canonical: canonical,
      image: image,
      ogTitle: raw.og_title || title,
      ogDescription: raw.og_description || desc,
      type: 'product',
      index: raw.seo_index !== false,
      follow: raw.seo_follow !== false,
      product: p,
      breadcrumbs: [
        { name: 'Home', url: '/' },
        { name: 'Products', url: '/products/' }
      ].concat(p.categorySlug ? [{ name: p.category, url: PR.categoryPath(p.categorySlug) }] : [])
       .concat([{ name: p.name, url: canonical }])
    });
  }

  /* ------------------------------------------------------------- wishlist */
  // Kept in this browser only; a missing or blocked localStorage just means
  // the heart does not stay filled after a reload.
  var WISHLIST_KEY = 'pr_wishlist';

  function wishlist() {
    try {
      var list = JSON.parse(localStorage.getItem(WISHLIST_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (err) {
      return [];
    }
  }

  function isLiked(p) {
    return wishlist().indexOf(String(p.id)) !== -1;
  }

  function toggleLike(p) {
    var list = wishlist();
    var id = String(p.id);
    var at = list.indexOf(id);
    if (at === -1) list.push(id); else list.splice(at, 1);
    try { localStorage.setItem(WISHLIST_KEY, JSON.stringify(list)); } catch (err) { /* private mode */ }
    return at === -1;
  }

  /* ---------------------------------------------------------------- share */
  function productUrl(p) {
    return (p.raw && p.raw.canonical_url) || PR.seo.productUrl(p.slug);
  }

  async function shareProduct(p) {
    var url = productUrl(p);
    var text = p.name + (Number.isFinite(p.price) && p.price > 0 ? ' – ' + PR.money(p.price) : '') +
               ' | PowerRun Industries';
    if (navigator.share) {
      try {
        await navigator.share({ title: p.name, text: text, url: url });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;   // user closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      PR.toast('Product link copied.', 'success');
    } catch (err) {
      window.open('https://wa.me/?text=' + encodeURIComponent(text + ' ' + url), '_blank', 'noopener');
    }
  }

  /* -------------------------------------------------------------- gallery */
  var ICON_SHARE = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></g></svg>';
  var ICON_HEART = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8 3.6 4.5 7.1 4.5c2 0 3.6 1.1 4.9 2.9 1.3-1.8 2.9-2.9 4.9-2.9 3.5 0 5.6 3.5 4.4 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  var ICON_PREV = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_NEXT = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ALT text: the image's own text, then the product-wide ALT set in the
     admin SEO section, then the product name. */
  function imageAlt(p, img, index) {
    return img.alt || (p.raw && p.raw.image_alt) || (p.name + (index ? ' - image ' + (index + 1) : ''));
  }

  function gallery(p) {
    var liked = isLiked(p);
    var tools =
      '<button class="g-icon g-share" type="button" aria-label="Share this product">' + ICON_SHARE + '</button>' +
      '<button class="g-icon g-like' + (liked ? ' liked' : '') + '" type="button" aria-pressed="' + liked + '" ' +
        'aria-label="Save to wishlist">' + ICON_HEART + '</button>';

    if (!p.images.length) {
      return '<div class="gallery-stage"><div class="main-product-image"><div class="ph large">' +
             PR.esc(PR.initials(p.name)) + '</div></div>' + tools + '</div>';
    }

    var many = p.images.length > 1;
    var slides = p.images.map(function (img, i) {
      return '<div class="gallery-slide" role="group" aria-label="Image ' + (i + 1) + ' of ' + p.images.length + '">' +
               '<img src="' + PR.esc(img.url) + '" alt="' + PR.esc(imageAlt(p, img, i)) + '"' +
               (i ? ' loading="lazy"' : '') + ' width="700" height="560" draggable="false">' +
             '</div>';
    }).join('');
    var controls = many
      ? '<button class="g-arrow g-prev" type="button" aria-label="Previous image" disabled>' + ICON_PREV + '</button>' +
        '<button class="g-arrow g-next" type="button" aria-label="Next image">' + ICON_NEXT + '</button>' +
        '<div class="g-dots">' + p.images.map(function (img, i) {
          return '<button class="g-dot' + (i === 0 ? ' active' : '') + '" type="button" data-go="' + i + '" ' +
                 'aria-label="Show image ' + (i + 1) + '"></button>';
        }).join('') + '</div>'
      : '';
    var thumbs = many
      ? '<div class="product-thumbs">' + p.images.map(function (img, i) {
          return '<button class="thumb' + (i === 0 ? ' active' : '') + '" type="button" data-go="' + i + '" ' +
                 'aria-label="View image ' + (i + 1) + '">' +
                 PR.thumbImg(img, '', 'loading="lazy" width="86" height="72"') + '</button>';
        }).join('') + '</div>'
      : '';

    return '<div class="gallery-stage">' +
             '<div class="gallery-track" id="galleryTrack" tabindex="0" aria-label="Product images">' + slides + '</div>' +
             controls + tools +
           '</div>' + thumbs;
  }

  function bindGallery(host, p) {
    var track = document.getElementById('galleryTrack');
    var likeBtn = host.querySelector('.g-like');
    var shareBtn = host.querySelector('.g-share');

    if (shareBtn) shareBtn.addEventListener('click', function () { shareProduct(p); });
    if (likeBtn) {
      likeBtn.addEventListener('click', function () {
        var nowLiked = toggleLike(p);
        likeBtn.classList.toggle('liked', nowLiked);
        likeBtn.setAttribute('aria-pressed', String(nowLiked));
        PR.toast(nowLiked ? 'Saved to your wishlist.' : 'Removed from your wishlist.', 'success');
      });
    }
    if (!track) return;

    var count = track.children.length;
    var prev = host.querySelector('.g-prev');
    var next = host.querySelector('.g-next');

    function current() {
      return Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    }
    function go(index) {
      var i = Math.max(0, Math.min(count - 1, index));
      var target = i * track.clientWidth;
      var start = track.scrollLeft;
      track.scrollTo({ left: target, behavior: 'smooth' });
      // browsers that ignore smooth scrolling on a snap container never move;
      // jump instead so the arrows and dots always work
      setTimeout(function () {
        if (track.scrollLeft === start && Math.abs(start - target) > 2) {
          track.scrollLeft = target;
          sync();
        }
      }, 450);
    }
    var shown = 0;
    function sync() {
      var i = current();
      shown = i;
      host.querySelectorAll('.g-dot, .thumb').forEach(function (el) {
        el.classList.toggle('active', Number(el.getAttribute('data-go')) === i);
      });
      if (prev) prev.disabled = i <= 0;
      if (next) next.disabled = i >= count - 1;
    }

    // sync touches at most a dozen buttons, so it runs on every scroll event
    track.addEventListener('scroll', sync, { passive: true });
    if (prev) prev.addEventListener('click', function () { go(current() - 1); });
    if (next) next.addEventListener('click', function () { go(current() + 1); });
    host.querySelectorAll('[data-go]').forEach(function (el) {
      el.addEventListener('click', function () { go(Number(el.getAttribute('data-go'))); });
    });
    track.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(current() - 1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); go(current() + 1); }
    });
    // keep the same image in view when the window is resized or rotated
    window.addEventListener('resize', function () {
      track.scrollLeft = shown * track.clientWidth;
    });
  }

  /* Internal linking: the product's own category plus the categories that go
     with it (an inverter needs batteries and panels, and the other way round).
     Everything is taken from the live category list - nothing hard-coded. */
  var COMPANION_WORDS = {
    inverter: ['batter', 'panel'],
    batter: ['inverter', 'panel'],
    panel: ['inverter', 'batter'],
    rickshaw: ['batter', 'charger'],
    scooty: ['batter', 'charger']
  };

  function companionCategories(p) {
    var cats = (PR.catalog.categories || []).filter(function (c) { return !c.parent_id && c.is_active !== false; });
    var name = ((p.category || '') + ' ' + p.name).toLowerCase();
    var wanted = [];
    Object.keys(COMPANION_WORDS).forEach(function (key) {
      if (name.indexOf(key) !== -1) wanted = wanted.concat(COMPANION_WORDS[key]);
    });
    var picked = cats.filter(function (c) {
      if (c.slug === p.categorySlug) return false;
      var label = c.name.toLowerCase();
      return wanted.some(function (word) { return label.indexOf(word) !== -1; });
    });
    // fall back to the other top categories so the block is never empty
    if (!picked.length) {
      picked = cats.filter(function (c) { return c.slug !== p.categorySlug; });
    }
    return picked.slice(0, 3);
  }

  function internalLinks(p) {
    var companions = companionCategories(p);
    if (!p.categorySlug && !companions.length) return '';
    return '<div class="internal-links">' +
      '<b>Explore more</b>' +
      '<div class="link-chips">' +
        (p.categorySlug
          ? '<a href="' + PR.categoryPath(p.categorySlug) + '">All ' + PR.esc(p.category) + '</a>'
          : '') +
        companions.map(function (c) {
          return '<a href="' + PR.categoryPath(c.slug) + '">' + PR.esc(c.name) + '</a>';
        }).join('') +
        '<a href="/products/">All products</a>' +
        (p.brand ? '' : '<a href="/warranty/">Warranty registration</a>') +
        '<a href="/service/">Service request</a>' +
      '</div>' +
    '</div>';
  }

  function specs(p) {
    var html = '';
    if (p.specRows.length) {
      html += '<div class="spec-table-wrap"><b>Specifications</b><table class="spec-table"><tbody>' +
        p.specRows.map(function (row) {
          return '<tr><td>' + PR.esc(row.label) + '</td><td>' + PR.esc(row.value) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    } else if (p.specText) {
      html += '<div class="spec-table-wrap"><b>Specifications</b>' +
              '<p class="prose">' + PR.esc(p.specText) + '</p></div>';
    }
    if (p.features.length) {
      html += '<div class="spec-table-wrap"><b>Key Features</b><ul class="feature-list">' +
        p.features.map(function (f) { return '<li>' + PR.esc(f) + '</li>'; }).join('') + '</ul></div>';
    }
    if (p.description) {
      html += '<div class="spec-table-wrap"><b>Product Description</b>' +
              '<p class="prose">' + PR.esc(p.description) + '</p></div>';
    }
    return html;
  }

  function render(p) {
    var host = document.getElementById('productContent');
    var max = Math.max(1, p.stock);

    host.innerHTML =
      '<nav class="breadcrumb" aria-label="Breadcrumb">' +
        '<a href="/">Home</a> / <a href="/products/">Products</a>' +
        (p.categorySlug ? ' / <a href="' + PR.categoryPath(p.categorySlug) + '">' + PR.esc(p.category) + '</a>' : '') +
        ' / <span aria-current="page">' + PR.esc(p.name) + '</span>' +
      '</nav>' +
      '<div class="product-detail-view">' +
        '<div class="product-gallery-main">' + gallery(p) + '</div>' +
        '<div class="product-info">' +
          (p.category ? '<span class="detail-badge">' + PR.esc(String(p.category).toUpperCase()) + '</span>' : '') +
          '<h1>' + PR.esc(p.name) + '</h1>' +
          (p.sku ? '<div class="sku">SKU: ' + PR.esc(p.sku) + '</div>' : '') +
          (p.shortDescription ? '<p class="prose" style="margin:12px 0 0">' + PR.esc(p.shortDescription) + '</p>' : '') +
          PR.priceBlock(p) +
          (Number.isFinite(p.price) && p.price > 0
            ? '<div class="emi-note">⚡ <b>EMI options available on request</b> · ask us on WhatsApp or call</div>'
            : '') +
          PR.stockLine(p) +
          // Resold parts (p.brand set) have no warranty at all - say so before
          // the buy buttons, not only in small print.
          (p.brand
            ? '<div class="no-warranty" role="note"><b>⚠️ No Warranty</b>' +
                '<p>This product is sold without any warranty. Only damaged, defective or wrong items are replaced within 7 days of delivery.</p>' +
                '<p lang="hi">इस प्रोडक्ट पर कोई वारंटी नहीं है। सिर्फ़ टूटा हुआ, ख़राब या ग़लत प्रोडक्ट डिलीवरी के 7 दिन के अंदर बदला जाता है।</p></div>'
            : '') +
          (p.orderable
            ? '<div class="qty-stepper">' +
                '<button type="button" id="qtyMinus" aria-label="Decrease quantity">−</button>' +
                '<span id="qtyValue">1</span>' +
                '<button type="button" id="qtyPlus" aria-label="Increase quantity">+</button>' +
              '</div>' +
              '<div class="detail-actions">' +
                '<button class="outline" type="button" id="addToCartBtn">ADD TO CART</button>' +
                '<button class="btn orange" type="button" id="buyNowBtn">BUY NOW</button>' +
              '</div>'
            : '<div class="detail-actions">' +
                '<a class="btn orange" href="' + PR.esc(PR.whatsapp('Hello PowerRun Industries, I would like a quote for ' + p.name + (p.sku ? ' (' + p.sku + ')' : '') + '.')) + '" target="_blank" rel="noopener">REQUEST A QUOTE</a>' +
                '<a class="outline" href="/contact/">CONTACT US</a>' +
              '</div>') +
          (p.warranty && !p.brand ? '<p class="small-note" style="margin-top:14px">🛡️ ' + PR.esc(p.warranty) + '</p>' : '') +
          (p.datasheetUrl
            ? '<a class="datasheet-btn" href="' + PR.esc(p.datasheetUrl) + '" target="_blank" rel="noopener" ' +
                'title="' + PR.esc(p.datasheetName || 'Datasheet') + '">' +
                '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M12 12v6M9 15l3 3 3-3"/></g></svg>' +
                'DOWNLOAD DATASHEET <small>PDF</small></a>'
            : '') +
          '<div class="trust-badges">' +
            '<div class="trust-badge"><span class="ic">🚚</span><div><b>Pan India Delivery</b><small>Safely packed, tracked online</small></div></div>' +
            // Resold parts (p.brand set) carry no PowerRun warranty; only the
            // 7-day replacement from the refund policy applies to them.
            (p.brand
              ? '<div class="trust-badge trust-badge-warn"><span class="ic">⚠️</span><div><b>No Warranty</b><small>Sold without warranty</small></div></div>' +
                '<div class="trust-badge"><span class="ic">🔁</span><div><b>7-Day Replacement</b><small>Only if damaged, defective or wrong</small></div></div>' +
                '<div class="trust-badge"><span class="ic">🎧</span><div><b>Technical Support</b><small>Help choosing the right model</small></div></div>'
              : '<div class="trust-badge"><span class="ic">🛡️</span><div><b>Manufacturer Warranty</b><small>Register online after delivery</small></div></div>' +
                '<div class="trust-badge"><span class="ic">🎧</span><div><b>Technical Support</b><small>Sizing and installation help</small></div></div>' +
                '<div class="trust-badge"><span class="ic">✅</span><div><b>Quality Checked</b><small>Every unit tested before dispatch</small></div></div>') +
          '</div>' +
          PR.googleRatingLink('google-rating google-rating-product') +
          specs(p) +
          internalLinks(p) +
        '</div>' +
      '</div>';

    bindGallery(host, p);

    function setQty(next) {
      qty = Math.min(max, Math.max(1, next));
      var el = document.getElementById('qtyValue');
      if (el) el.textContent = String(qty);
      var minus = document.getElementById('qtyMinus');
      var plus = document.getElementById('qtyPlus');
      if (minus) minus.disabled = qty <= 1;
      if (plus) plus.disabled = qty >= max;
    }

    var minusBtn = document.getElementById('qtyMinus');
    var plusBtn = document.getElementById('qtyPlus');
    if (minusBtn) minusBtn.addEventListener('click', function () { setQty(qty - 1); });
    if (plusBtn) plusBtn.addEventListener('click', function () { setQty(qty + 1); });
    setQty(1);

    var addBtn = document.getElementById('addToCartBtn');
    if (addBtn) {
      addBtn.addEventListener('click', function () { PR.cart.add(p, qty); });
    }
    var buyBtn = document.getElementById('buyNowBtn');
    if (buyBtn) {
      buyBtn.addEventListener('click', function () {
        if (PR.cart.add(p, qty)) window.location.href = '/checkout/';
      });
    }
  }

  function renderQuoteRequest(p) {
    var section = document.getElementById('productSection');
    if (!section || document.getElementById('quoteRequest')) return;
    section.insertAdjacentHTML('afterend',
      '<section class="section" id="quoteRequest" style="padding-top:0"><div class="panel" id="quoteRequestBox">' +
        '<h2>Quote chahiye?</h2>' +
        '<p class="small-note">Apni details bharein. Hamari team price check karke quotation aapke WhatsApp par bhejegi.</p>' +
        '<form class="form" id="quoteRequestForm" novalidate>' +
          '<div class="form-grid">' +
            '<label>Naam <span class="req">*</span><input id="qr_name" maxlength="80" required></label>' +
            '<label>Mobile <span class="req">*</span><input id="qr_mobile" inputmode="numeric" maxlength="10" required placeholder="10-digit"></label>' +
          '</div>' +
          '<div class="form-grid">' +
            '<label>Email<input id="qr_email" type="email" maxlength="120"></label>' +
            '<label>GSTIN (agar ho)<input id="qr_gstin" maxlength="15" style="text-transform:uppercase"></label>' +
          '</div>' +
          '<b style="display:block;margin-top:6px">Billing Address</b>' +
          '<label>Address <span class="req">*</span><input id="qr_address" maxlength="200" required placeholder="House/Shop no, street, area"></label>' +
          '<div class="form-grid three">' +
            '<label>City <span class="req">*</span><input id="qr_city" maxlength="80" required></label>' +
            '<label>State <span class="req">*</span><select id="qr_state" required></select></label>' +
            '<label>Pincode <span class="req">*</span><input id="qr_pincode" inputmode="numeric" maxlength="6" required></label>' +
          '</div>' +
          '<label style="display:flex;align-items:center;gap:8px;margin-top:6px;font-weight:600"><input type="checkbox" id="qr_same" checked style="width:18px;height:18px;margin:0;flex:none"> Shipping address billing jaisa hi hai</label>' +
          '<div id="qr_ship" hidden>' +
            '<b style="display:block;margin-top:6px">Shipping Address</b>' +
            '<label>Address <span class="req">*</span><input id="qr_s_address" maxlength="200"></label>' +
            '<div class="form-grid three">' +
              '<label>City <span class="req">*</span><input id="qr_s_city" maxlength="80"></label>' +
              '<label>State <span class="req">*</span><select id="qr_s_state"></select></label>' +
              '<label>Pincode <span class="req">*</span><input id="qr_s_pincode" inputmode="numeric" maxlength="6"></label>' +
            '</div>' +
          '</div>' +
          '<button class="btn orange" id="quoteRequestBtn" type="submit" style="margin-top:8px">QUOTE REQUEST BHEJEIN</button>' +
        '</form>' +
        '<div id="quoteRequestResult"></div>' +
      '</div></section>');

    PR.fillStates(document.getElementById('qr_state'));
    PR.fillStates(document.getElementById('qr_s_state'));
    document.getElementById('qr_same').addEventListener('change', function (e) {
      document.getElementById('qr_ship').hidden = e.target.checked;
    });

    document.getElementById('quoteRequestForm').addEventListener('submit', async function (event) {
      event.preventDefault();
      function v(id) { return document.getElementById(id).value.trim(); }
      var name = v('qr_name');
      var mobile = v('qr_mobile').replace(/\D/g, '');
      var same = document.getElementById('qr_same').checked;
      var button = document.getElementById('quoteRequestBtn');
      var pin = /^[1-9]\d{5}$/;
      if (name.length < 2) { PR.toast('Naam daalein.', 'error'); return; }
      if (!/^[6-9]\d{9}$/.test(mobile)) { PR.toast('Sahi 10-digit mobile number daalein.', 'error'); return; }
      if (!v('qr_address') || !v('qr_city') || !v('qr_state')) { PR.toast('Poora billing address bharein.', 'error'); return; }
      if (!pin.test(v('qr_pincode'))) { PR.toast('Sahi 6-digit billing pincode daalein.', 'error'); return; }
      if (!same) {
        if (!v('qr_s_address') || !v('qr_s_city') || !v('qr_s_state')) { PR.toast('Poora shipping address bharein.', 'error'); return; }
        if (!pin.test(v('qr_s_pincode'))) { PR.toast('Sahi 6-digit shipping pincode daalein.', 'error'); return; }
      }

      var data = {
        product_id: p.id, name: name, mobile: mobile, email: v('qr_email'), gstin: v('qr_gstin'),
        address: v('qr_address'), city: v('qr_city'), state: v('qr_state'), pincode: v('qr_pincode'),
        shipping_same: same,
        shipping_address: v('qr_s_address'), shipping_city: v('qr_s_city'),
        shipping_state: v('qr_s_state'), shipping_pincode: v('qr_s_pincode')
      };

      PR.setBusy(button, true, 'BHEJ RAHE HAIN…');
      try {
        var q = await PR.call('send quote request', function (sb) {
          return sb.rpc('submit_product_quote_request', { p_data: data });
        });
        PR.setBusy(button, false);
        if (!q.existing) {
          PR.track('generate_lead', { lead_source: 'quote_request', currency: 'INR', value: p.price || 0,
                                      items: [PR.gaItem(p, 1)] });
        }
        document.getElementById('quoteRequestForm').hidden = true;
        var waText = p.name + ' ka quote chahiye. Naam: ' + name + ', Mobile: ' + mobile;
        document.getElementById('quoteRequestResult').innerHTML =
          '<div class="form-message success" style="margin-top:14px">' +
            (q.existing
              ? 'Aapki request pehle se hamare paas hai.'
              : 'Aapki request mil gayi hai.') +
            ' PowerRun team price check karke aapka quotation WhatsApp par ' + PR.esc(mobile) + ' par bhejegi.' +
          '</div>' +
          '<div class="detail-actions" style="margin-top:14px">' +
            '<a class="outline" href="' + PR.esc(PR.whatsapp(waText)) + '" target="_blank" rel="noopener">JALDI CHAHIYE? WHATSAPP KAREIN</a>' +
          '</div>';
      } catch (err) {
        PR.setBusy(button, false);
        PR.toast(err.message, 'error');
      }
    });
  }

  async function renderRelated(p) {
    try {
      await PR.loadProducts();
      var related = PR.catalog.products.filter(function (item) {
        return item.categoryId === p.categoryId && String(item.id) !== String(p.id);
      }).slice(0, 4);
      if (!related.length) return;
      document.getElementById('relatedSection').hidden = false;
      document.getElementById('relatedGrid').innerHTML = related.map(PR.productCard).join('');
    } catch (err) {
      console.warn('[PowerRun] related products unavailable:', err.message);
    }
  }

  /* -------------------------------------------------------------- reviews */
  function stars(rating) {
    var n = Number(rating) || 0;
    return '★★★★★☆☆☆☆☆'.slice(5 - n, 10 - n);
  }

  async function renderReviews(p) {
    var host = document.getElementById('productReviews');
    if (!host || !PR.sb) return;
    try {
      var reviews = await PR.call('load reviews', function (sb) {
        return sb.from('product_reviews')
          .select('rating,title,body,customer_name,created_at')
          .eq('product_id', p.id).eq('status', 'approved')
          .order('created_at', { ascending: false });
      }) || [];

      var avg = reviews.length
        ? reviews.reduce(function (sum, r) { return sum + r.rating; }, 0) / reviews.length
        : 0;

      host.innerHTML =
        '<div class="section-head"><h2>CUSTOMER <span>REVIEWS</span></h2>' +
          (reviews.length
            ? '<span class="hint" style="color:#f5a623">' + stars(Math.round(avg)) +
              '<span style="color:var(--muted)"> ' + avg.toFixed(1) + ' out of 5 · ' +
              reviews.length + ' review' + (reviews.length === 1 ? '' : 's') + '</span></span>'
            : '') +
        '</div>' +
        '<div class="review-list">' +
          (reviews.length
            ? reviews.map(function (r) {
                return '<div class="review-card">' +
                  '<div style="color:#f5a623">' + stars(r.rating) + '</div>' +
                  (r.title ? '<b>' + PR.esc(r.title) + '</b>' : '') +
                  '<p style="margin:6px 0">' + PR.esc(r.body) + '</p>' +
                  '<div class="hint">' + PR.esc(r.customer_name || 'Verified Buyer') + ' · ' +
                    PR.formatDate(r.created_at) + '</div>' +
                '</div>';
              }).join('')
            : '<p class="hint">No reviews yet — be the first to review this product.</p>') +
        '</div>' +
        '<div id="reviewFormHost"></div>';

      renderReviewForm(p);
    } catch (err) {
      console.warn('[PowerRun] reviews unavailable:', err.message);
    }
  }

  async function renderReviewForm(p) {
    var host = document.getElementById('reviewFormHost');
    if (!host || !PR.account) return;
    var session = await PR.account.getSession();
    if (!session) {
      host.innerHTML = '<p class="hint" style="margin-top:14px"><a href="/account/?next=' +
        encodeURIComponent(window.location.pathname) + '">Sign in</a> to write a review.</p>';
      return;
    }
    try {
      var mine = await PR.call('check your review', function (sb) {
        return sb.from('product_reviews').select('id,status')
          .eq('product_id', p.id).eq('user_id', session.user.id).limit(1);
      });
      if (mine && mine.length) {
        var status = mine[0].status;
        host.innerHTML = '<p class="hint" style="margin-top:14px">' +
          (status === 'approved' ? 'You already reviewed this product.'
            : status === 'pending' ? 'Your review is awaiting approval.'
            : 'Your review was not approved for publishing.') + '</p>';
        return;
      }
      var eligible = await PR.call('check purchase', function (sb) {
        return sb.from('order_items').select('id, orders!inner(order_status)')
          .eq('product_id', p.id).eq('orders.order_status', 'delivered').limit(1);
      });
      if (!eligible || !eligible.length) {
        host.innerHTML = '<p class="hint" style="margin-top:14px">Only customers who have received ' +
          'this product can write a review.</p>';
        return;
      }

      var profile = await PR.account.loadProfile();
      host.innerHTML =
        '<form class="form" id="reviewSubmitForm" style="max-width:520px;margin-top:16px">' +
          '<label>Your Rating' +
            '<div class="star-picker" id="starPicker" role="radiogroup" aria-label="Rating">' +
              [1, 2, 3, 4, 5].map(function (n) {
                return '<button type="button" class="star-btn" data-star="' + n + '" aria-label="' + n + ' star">☆</button>';
              }).join('') +
            '</div></label>' +
          '<label>Review<textarea id="rv_body" required maxlength="1000" ' +
            'placeholder="Share your experience with this product…"></textarea></label>' +
          '<button class="btn orange" type="submit">SUBMIT REVIEW</button>' +
        '</form>';

      var chosen = 0;
      var buttons = host.querySelectorAll('.star-btn');
      function paintStars() {
        buttons.forEach(function (b, i) { b.textContent = i < chosen ? '★' : '☆'; });
      }
      buttons.forEach(function (btn, i) {
        btn.addEventListener('click', function () { chosen = i + 1; paintStars(); });
      });

      document.getElementById('reviewSubmitForm').addEventListener('submit', async function (event) {
        event.preventDefault();
        if (!chosen) { PR.toast('Please select a rating.', 'error'); return; }
        var body = document.getElementById('rv_body').value.trim();
        if (!body) { PR.toast('Please write a review.', 'error'); return; }
        try {
          await PR.call('submit review', function (sb) {
            return sb.from('product_reviews').insert({
              product_id: p.id,
              user_id: session.user.id,
              customer_name: (profile && profile.name) || null,
              rating: chosen,
              body: body
            });
          });
          PR.toast('Review submitted — awaiting approval.', 'success');
          host.innerHTML = '<p class="hint" style="margin-top:14px">Your review is awaiting approval.</p>';
        } catch (err) {
          PR.toast(err.message, 'error');
        }
      });
    } catch (err) {
      console.warn('[PowerRun] review form unavailable:', err.message);
    }
  }

  /* The clean URL is /products/<slug>/. The older /product/?slug=... address
     stays alive for links that are already out there and forwards here. */
  function slugFromPath() {
    var match = window.location.pathname.match(/^\/products\/([^\/]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  async function init() {
    var pathSlug = slugFromPath();
    var querySlug = PR.param('slug');
    if (!pathSlug && querySlug && /^\/product\/?$/.test(window.location.pathname)) {
      window.location.replace('/products/' + encodeURIComponent(querySlug) + '/');
      return;
    }

    PR.mountLayout('products', false);
    var host = document.getElementById('productContent');
    var slug = pathSlug || querySlug;
    var id = PR.param('id');

    if (!slug && !id) {
      host.innerHTML = '<div class="empty-state"><h3>No product selected</h3>' +
        '<p>Choose a product from our catalogue.</p><a class="btn orange" href="/products/">Browse products</a></div>';
      return;
    }

    try {
      product = slug ? await PR.loadProductBySlug(slug) : await PR.loadProductById(id);
      if (!product || !product.isActive) {
        host.innerHTML = '<div class="empty-state"><h3>Product not found</h3>' +
          '<p>This product may have been removed or renamed.</p>' +
          '<a class="btn orange" href="/products/">Browse all products</a></div>';
        return;
      }
      setMeta(product);
      render(product);
      if (product.price > 0) {
        PR.track('view_item', { currency: 'INR', value: product.price, items: [PR.gaItem(product, 1)] });
      }
      renderRelated(product);
      renderReviews(product);
      renderQuoteRequest(product);
    } catch (err) {
      PR.toast(err.message, 'error');
      host.innerHTML = '<div class="empty-state"><h3>Product could not be loaded</h3>' +
        '<p>' + PR.esc(err.message) + '</p>' +
        '<button class="btn orange" type="button" onclick="location.reload()">Try again</button></div>';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
