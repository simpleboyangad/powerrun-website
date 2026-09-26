/* PowerRun Industries - shared customer header, footer and chrome.
 *
 * Injected on every customer page so branding and navigation stay in one
 * place. NOTE: this file deliberately contains no admin link of any kind.
 * The admin panel lives at /admin/ and is never advertised on the storefront.
 */
(function () {
  'use strict';

  var PR = window.PR;
  var cfg = window.PR_CONFIG;

  var NAV = [
    { href: '/', label: 'HOME', key: 'home' },
    { href: '/about/', label: 'ABOUT US', key: 'about' },
    { href: '/products/', label: 'PRODUCTS', key: 'products' },
    { href: '/warranty/', label: 'WARRANTY', key: 'warranty' },
    { href: '/service/', label: 'SERVICE', key: 'service' },
    { href: '/dealer/', label: 'DEALERSHIP', key: 'dealer' },
    { href: '/contact/', label: 'CONTACT US', key: 'contact' }
  ];

  function navLinks(active, cls) {
    return NAV.map(function (item) {
      var on = item.key === active ? ' class="active"' : (cls ? ' class="' + cls + '"' : '');
      return '<a href="' + item.href + '"' + on + '>' + item.label + '</a>';
    }).join('');
  }

  /* A site-wide banner for the one coupon the admin has marked "Show as a
     site-wide banner" (assets/js/admin/coupons.js). Reads through a
     read-only RPC that never exposes ids, usage counts or any other
     coupon internals - see sql/16_coupon_site_banner.sql. */
  function bannerMessage(coupon) {
    if (coupon.banner_text) return coupon.banner_text;
    var amount = coupon.discount_type === 'percent'
      ? coupon.discount_value + '% off' : PR.money(coupon.discount_value) + ' off';
    var min = Number(coupon.min_order_amount) > 0
      ? ' on orders above ' + PR.money(coupon.min_order_amount) : '';
    return '🎉 Use code ' + coupon.code + ' for ' + amount + min + '!';
  }

  PR.loadPromoBanner = async function () {
    var host = document.getElementById('prPromoBanner');
    if (!host || !PR.sb) return;
    try {
      var coupon = await PR.call('load site banner coupon', function (sb) {
        return sb.rpc('active_site_banner_coupon');
      });
      if (!coupon) { host.hidden = true; return; }
      host.hidden = false;
      host.innerHTML = '<span>' + PR.esc(bannerMessage(coupon)) + '</span>';
    } catch (err) {
      console.warn('[PowerRun] promo banner unavailable:', err.message);
      host.hidden = true;
    }
  };

  PR.renderHeader = function (active) {
    var host = document.getElementById('pr-header');
    if (!host) return;
    host.innerHTML =
      '<div class="promo-banner" id="prPromoBanner" hidden></div>' +
      '<div class="top">' +
        '<div>⚡ Welcome to <b>' + PR.esc(cfg.COMPANY) + '</b></div>' +
        '<div><span>☎ ' + PR.esc(cfg.PHONE) + '</span><span>✉ ' + PR.esc(cfg.EMAIL) + '</span></div>' +
      '</div>' +
      '<header class="header">' +
        '<button class="mobile-menu-btn" type="button" aria-label="Open menu" aria-expanded="false" ' +
                'data-pr-menu>☰</button>' +
        '<a href="/" aria-label="PowerRun Industries home">' +
          '<img class="logo" src="/assets/powerrun-logo.png" alt="PowerRun Industries logo" ' +
               'width="172" height="55" loading="eager">' +
        '</a>' +
        '<nav class="nav" aria-label="Main">' + navLinks(active) + '</nav>' +
        '<div class="mobile-nav" id="prMobileNav">' + navLinks(active) + '</div>' +
        '<div class="actions">' +
          '<a class="icon" href="/products/" aria-label="Search products" title="Search products">⌕</a>' +
          '<a class="icon" href="/track-order/" aria-label="Track your order" title="Track your order">◴</a>' +
          '<a class="icon" href="/account/" aria-label="My account" title="My account">👤</a>' +
          '<a class="icon cart" href="/cart/" aria-label="View cart" title="View cart">' +
            '🛒<i class="badge" id="cartCount">0</i>' +
          '</a>' +
        '</div>' +
      '</header>';

    var btn = host.querySelector('[data-pr-menu]');
    var menu = host.querySelector('#prMobileNav');
    if (btn && menu) {
      btn.addEventListener('click', function () {
        var open = menu.classList.toggle('show');
        btn.setAttribute('aria-expanded', String(open));
      });
    }
    PR.updateCartBadge();
    PR.loadPromoBanner();
  };

  PR.renderFooter = function () {
    var host = document.getElementById('pr-footer');
    if (!host) return;
    var year = new Date().getFullYear();
    host.innerHTML =
      '<footer class="footer">' +
        '<div class="footer-grid">' +
          '<div>' +
            '<h3>POWER<span style="color:#fff">RUN</span></h3>' +
            '<p>Powering today, sustaining tomorrow. High-performance lithium batteries, ' +
            'hybrid inverters and complete energy solutions.</p>' +
            '<p>☎ ' + PR.esc(cfg.PHONE) + '<br>✉ ' + PR.esc(cfg.EMAIL) + '</p>' +
          '</div>' +
          '<div><h3>Products</h3><ul id="prFooterCats">' +
            '<li><a href="/products/?category=hybrid-inverters">Hybrid Inverters</a></li>' +
            '<li><a href="/products/?category=lithium-batteries">Lithium Batteries</a></li>' +
            '<li><a href="/products/?category=solar-panels">Solar Panels</a></li>' +
            '<li><a href="/products/?category=e-rickshaw-batteries">E-Rickshaw Batteries</a></li>' +
          '</ul></div>' +
          '<div><h3>Company</h3><ul>' +
            '<li><a href="/about/">About Us</a></li>' +
            '<li><a href="/products/">All Products</a></li>' +
            '<li><a href="/dealer/">Become a Dealer</a></li>' +
            '<li><a href="/contact/">Contact Us</a></li>' +
          '</ul></div>' +
          '<div><h3>Support</h3><ul>' +
            '<li><a href="/battery-calculator/">Battery Calculator</a></li>' +
            '<li><a href="/solar-calculator/">Solar Calculator</a></li>' +
            '<li><a href="/warranty/">Warranty Registration</a></li>' +
            '<li><a href="/service/">Service Request</a></li>' +
            '<li><a href="/track-order/">Track Order</a></li>' +
            '<li><a href="/account/">My Account</a></li>' +
            '<li><a href="https://wa.me/' + PR.esc(cfg.WHATSAPP) + '" target="_blank" rel="noopener">WhatsApp Support</a></li>' +
          '</ul></div>' +
          '<div><h3>Policies</h3><ul>' +
            '<li><a href="/shipping-policy/">Shipping Policy</a></li>' +
            '<li><a href="/refund-policy/">Return &amp; Refund</a></li>' +
            '<li><a href="/terms/">Terms &amp; Conditions</a></li>' +
            '<li><a href="/privacy-policy/">Privacy Policy</a></li>' +
          '</ul></div>' +
        '</div>' +
        '<div class="copy">© ' + year + ' ' + PR.esc(cfg.COMPANY) + '. All Rights Reserved.</div>' +
      '</footer>' +
      '<a class="wa-float" href="' + PR.esc(PR.whatsapp('Hello PowerRun Industries, I need an energy solution.')) + '" ' +
         'target="_blank" rel="noopener" aria-label="Chat with PowerRun Industries on WhatsApp">' +
         '<svg viewBox="0 0 32 32" width="30" height="30" fill="#fff" aria-hidden="true"><path d="M16.04 3C9.37 3 3.98 8.39 3.98 15.06c0 2.66.87 5.13 2.36 7.13L4.98 28l5.98-1.32a12.02 12.02 0 0 0 5.08 1.12h.01c6.67 0 12.06-5.39 12.06-12.06C28.11 8.39 22.72 3 16.04 3zm7.1 17.06c-.3.84-1.5 1.54-2.44 1.74-.65.14-1.5.25-4.36-.93-3.66-1.5-6.02-5.2-6.2-5.44-.18-.24-1.48-1.97-1.48-3.76 0-1.79.94-2.66 1.28-3.02.33-.36.72-.45.96-.45.24 0 .48 0 .69.01.22.01.51-.08.8.61.3.72 1.02 2.49 1.11 2.67.09.18.15.39.03.63-.12.24-.18.39-.36.6-.18.21-.38.47-.54.63-.18.18-.37.38-.16.74.21.36.93 1.53 2 2.48 1.37 1.22 2.53 1.6 2.89 1.78.36.18.57.15.78-.09.21-.24.9-1.05 1.14-1.41.24-.36.48-.3.81-.18.33.12 2.1.99 2.46 1.17.36.18.6.27.69.42.09.15.09.87-.21 1.71z"/></svg></a>';
  };

  PR.updateCartBadge = function () {
    var el = document.getElementById('cartCount');
    if (el && PR.cart) el.textContent = String(PR.cart.count());
  };

  PR.mountLayout = function (active, seoOptions) {
    PR.renderHeader(active);
    PR.renderFooter();
    // Pages that know more about themselves (product, category) call
    // PR.seo.apply again with that detail; applying twice is harmless.
    if (PR.seo && seoOptions !== false) PR.seo.apply(seoOptions || {});
  };
})();
