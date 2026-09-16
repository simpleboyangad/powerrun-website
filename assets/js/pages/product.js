/* Product detail page */
(function () {
  'use strict';
  var PR = window.PR;

  var product = null;
  var qty = 1;

  function setMeta(p) {
    var title = p.metaTitle || (p.name + ' | PowerRun Industries');
    var desc = p.metaDescription || p.shortDescription ||
      (p.name + ' from PowerRun Industries.');
    document.title = title;

    function meta(selector, value) {
      var el = document.querySelector(selector);
      if (el) el.setAttribute('content', value);
    }
    meta('meta[name="description"]', desc);
    meta('meta[property="og:title"]', title);
    meta('meta[property="og:description"]', desc);
    meta('meta[name="twitter:title"]', title);
    meta('meta[name="twitter:description"]', desc);

    var url = PR.config.SITE_URL + '/product/?slug=' + encodeURIComponent(p.slug);
    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', url);
    meta('meta[property="og:url"]', url);
    if (p.images.length) {
      meta('meta[property="og:image"]', p.images[0].url);
      meta('meta[name="twitter:image"]', p.images[0].url);
    }

    var ld = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.name,
      description: desc,
      sku: p.sku || undefined,
      brand: { '@type': 'Brand', name: 'PowerRun Industries' },
      image: p.images.map(function (i) { return i.url; })
    };
    if (Number.isFinite(p.price) && p.price > 0) {
      ld.offers = {
        '@type': 'Offer',
        priceCurrency: 'INR',
        price: p.price,
        url: url,
        availability: p.orderable
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock'
      };
    }
    var script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(ld);
    document.head.appendChild(script);
  }

  function gallery(p) {
    if (!p.images.length) {
      return '<div class="main-product-image"><div class="ph large">' +
             PR.esc(PR.initials(p.name)) + '</div></div>';
    }
    var thumbs = p.images.length > 1
      ? '<div class="product-thumbs">' + p.images.map(function (img, i) {
          return '<button class="thumb' + (i === 0 ? ' active' : '') + '" type="button" ' +
                 'data-img="' + PR.esc(img.url) + '" aria-label="View image ' + (i + 1) + '">' +
                 '<img src="' + PR.esc(img.url) + '" alt="' + PR.esc(p.name) + ' image ' + (i + 1) + '" loading="lazy"></button>';
        }).join('') + '</div>'
      : '';
    return '<div class="main-product-image">' +
             '<img id="mainProductImage" src="' + PR.esc(p.images[0].url) + '" alt="' + PR.esc(p.name) + '" width="700" height="560">' +
           '</div>' + thumbs;
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
          '<div class="trust-badges">' +
            '<div class="trust-badge"><span class="ic">🚚</span><div><b>Pan India Delivery</b><small>Safely packed and insured</small></div></div>' +
            '<div class="trust-badge"><span class="ic">🛡️</span><div><b>Manufacturer Warranty</b><small>Register online after delivery</small></div></div>' +
            '<div class="trust-badge"><span class="ic">🎧</span><div><b>Technical Support</b><small>Sizing and installation help</small></div></div>' +
            '<div class="trust-badge"><span class="ic">✅</span><div><b>Tested &amp; Certified</b><small>Quality checked before dispatch</small></div></div>' +
          '</div>' +
          specs(p) +
        '</div>' +
      '</div>';

    host.addEventListener('click', function (event) {
      var thumb = event.target.closest('.thumb');
      if (thumb) {
        var main = document.getElementById('mainProductImage');
        if (main) main.src = thumb.getAttribute('data-img');
        host.querySelectorAll('.thumb').forEach(function (t) { t.classList.remove('active'); });
        thumb.classList.add('active');
      }
    });

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

  async function init() {
    PR.mountLayout('products');
    var host = document.getElementById('productContent');
    var slug = PR.param('slug');
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
