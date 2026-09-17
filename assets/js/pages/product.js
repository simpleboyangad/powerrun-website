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
      ].concat(p.categorySlug ? [{ name: p.category, url: '/products/?category=' + encodeURIComponent(p.categorySlug) }] : [])
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
                 '<img src="' + PR.esc(img.url) + '" alt="" loading="lazy" width="86" height="72"></button>';
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
          ? '<a href="/products/?category=' + encodeURIComponent(p.categorySlug) + '">All ' + PR.esc(p.category) + '</a>'
          : '') +
        companions.map(function (c) {
          return '<a href="/products/?category=' + PR.esc(c.slug) + '">' + PR.esc(c.name) + '</a>';
        }).join('') +
        '<a href="/products/">All products</a>' +
        '<a href="/warranty/">Warranty registration</a>' +
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
        (p.categorySlug ? ' / <a href="/products/?category=' + encodeURIComponent(p.categorySlug) + '">' + PR.esc(p.category) + '</a>' : '') +
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
            ? '<div class="emi-note">⚡ EMI from <b>' + PR.money(Math.round(p.price / 12)) +
              '</b>/mo · 12 months · EMI options available on request</div>'
            : '') +
          PR.stockLine(p) +
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
          (p.warranty ? '<p class="small-note" style="margin-top:14px">🛡️ ' + PR.esc(p.warranty) + '</p>' : '') +
          (p.datasheetUrl
            ? '<a class="datasheet-btn" href="' + PR.esc(p.datasheetUrl) + '" target="_blank" rel="noopener" ' +
                'title="' + PR.esc(p.datasheetName || 'Datasheet') + '">' +
                '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M12 12v6M9 15l3 3 3-3"/></g></svg>' +
                'DOWNLOAD DATASHEET <small>PDF</small></a>'
            : '') +
          '<div class="trust-badges">' +
            '<div class="trust-badge"><span class="ic">🚚</span><div><b>Pan India Delivery</b><small>Safely packed and insured</small></div></div>' +
            '<div class="trust-badge"><span class="ic">🛡️</span><div><b>Manufacturer Warranty</b><small>Register online after delivery</small></div></div>' +
            '<div class="trust-badge"><span class="ic">🎧</span><div><b>Technical Support</b><small>Sizing and installation help</small></div></div>' +
            '<div class="trust-badge"><span class="ic">✅</span><div><b>Tested &amp; Certified</b><small>Quality checked before dispatch</small></div></div>' +
          '</div>' +
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
      renderRelated(product);
    } catch (err) {
      PR.toast(err.message, 'error');
      host.innerHTML = '<div class="empty-state"><h3>Product could not be loaded</h3>' +
        '<p>' + PR.esc(err.message) + '</p>' +
        '<button class="btn orange" type="button" onclick="location.reload()">Try again</button></div>';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
