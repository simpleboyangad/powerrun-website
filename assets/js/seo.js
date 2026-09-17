/* PowerRun Industries - runtime SEO.
 *
 * Every public page calls PR.seo.apply(...) once, with whatever it knows about
 * itself. The values come from Supabase (global_seo + page_seo, edited in
 * Admin > SEO Manager) and fall back to the global defaults, then to the tags
 * already written into the page's HTML.
 *
 * WHY BOTH: the HTML files carry baked-in tags (written by
 * scripts/seo_build.py) so that crawlers which do not run JavaScript - the
 * WhatsApp / Facebook / X link previews - still see correct tags. This file
 * keeps the live pages in sync with the database between builds, and adds the
 * parts that depend on data loaded at run time (product titles, prices,
 * breadcrumbs, JSON-LD).
 *
 * One tag per name: every tag is looked up and updated, never appended twice.
 */
(function () {
  'use strict';

  var PR = window.PR;
  var CACHE_KEY = 'pr_seo_cache_v1';
  var CACHE_MS = 10 * 60 * 1000;

  var seo = (PR.seo = {});
  var data = null;          // { global: {...}, pages: { key: {...} } }
  var loading = null;

  /* ------------------------------------------------------------------ data */
  function readCache() {
    try {
      var raw = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (raw && raw.at && Date.now() - raw.at < CACHE_MS) return raw.value;
    } catch (err) { /* private mode or damaged cache */ }
    return null;
  }

  function writeCache(value) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), value: value })); }
    catch (err) { /* storage full or blocked - caching is optional */ }
  }

  seo.load = function () {
    if (data) return Promise.resolve(data);
    var cached = readCache();
    if (cached) { data = cached; return Promise.resolve(data); }
    if (loading) return loading;
    if (!PR.sb) return Promise.resolve({ global: {}, pages: {} });

    loading = Promise.all([
      PR.sb.from('global_seo').select('*').eq('id', 1).maybeSingle(),
      PR.sb.from('page_seo').select('*')
    ]).then(function (results) {
      var pages = {};
      (results[1].data || []).forEach(function (row) { pages[row.page_key] = row; });
      data = { global: (results[0].data || {}), pages: pages };
      writeCache(data);
      return data;
    }).catch(function (err) {
      console.warn('[PowerRun] SEO settings unavailable:', err.message);
      return { global: {}, pages: {} };
    });
    return loading;
  };

  seo.clearCache = function () {
    data = null; loading = null;
    try { sessionStorage.removeItem(CACHE_KEY); } catch (err) { /* ignore */ }
  };

  /* ----------------------------------------------------------------- utils */
  function head() { return document.head || document.getElementsByTagName('head')[0]; }

  function setTag(selector, attrs) {
    var el = head().querySelector(selector);
    if (!el) {
      el = document.createElement(attrs.tag || 'meta');
      Object.keys(attrs.create || {}).forEach(function (key) { el.setAttribute(key, attrs.create[key]); });
      head().appendChild(el);
    }
    Object.keys(attrs.set || {}).forEach(function (key) {
      if (attrs.set[key] === null || attrs.set[key] === undefined || attrs.set[key] === '') el.removeAttribute(key);
      else el.setAttribute(key, attrs.set[key]);
    });
    return el;
  }

  function meta(name, value) {
    if (!value) return;
    setTag('meta[name="' + name + '"]', { tag: 'meta', create: { name: name }, set: { content: value } });
  }

  function property(prop, value) {
    if (!value) return;
    setTag('meta[property="' + prop + '"]', { tag: 'meta', create: { property: prop }, set: { content: value } });
  }

  function link(rel, href) {
    if (!href) return;
    setTag('link[rel="' + rel + '"]', { tag: 'link', create: { rel: rel }, set: { href: href } });
  }

  function clean(text, limit) {
    if (!text) return '';
    var value = String(text).replace(/\s+/g, ' ').trim();
    if (limit && value.length > limit) value = value.slice(0, limit - 1).replace(/[\s,;:.-]+$/, '') + '…';
    return value;
  }

  function absolute(url) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    var base = (PR.config.SITE_URL || '').replace(/\/+$/, '');
    return base + (url.charAt(0) === '/' ? '' : '/') + url;
  }

  /* Canonical: site URL + path, no query string and no duplicate slashes.
     Product and category pages pass their own canonical explicitly. */
  seo.canonicalFor = function (path) {
    var base = (PR.config.SITE_URL || '').replace(/\/+$/, '');
    var p = path || window.location.pathname || '/';
    p = p.replace(/\/{2,}/g, '/');
    if (!/\.[a-z0-9]+$/i.test(p) && p.charAt(p.length - 1) !== '/') p += '/';
    return base + p;
  };

  seo.productUrl = function (slug) {
    return (PR.config.SITE_URL || '').replace(/\/+$/, '') + '/products/' + encodeURIComponent(slug) + '/';
  };

  seo.categoryUrl = function (slug) {
    return (PR.config.SITE_URL || '').replace(/\/+$/, '') + '/products/?category=' + encodeURIComponent(slug);
  };

  /* --------------------------------------------------------------- JSON-LD */
  function jsonLd(id, payload) {
    var el = document.getElementById(id);
    if (!payload) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = id;
      head().appendChild(el);
    }
    el.textContent = JSON.stringify(payload);
  }

  seo.organizationSchema = function (g) {
    var site = (g.site_url || PR.config.SITE_URL || '').replace(/\/+$/, '');
    return {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': site + '/#organization',
      name: g.site_name || PR.config.COMPANY,
      url: site + '/',
      logo: absolute(g.og_image || '/assets/powerrun-logo.png'),
      email: PR.config.EMAIL || undefined,
      telephone: PR.config.PHONE || undefined,
      areaServed: 'IN'
    };
  };

  seo.websiteSchema = function (g) {
    var site = (g.site_url || PR.config.SITE_URL || '').replace(/\/+$/, '');
    return {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': site + '/#website',
      url: site + '/',
      name: g.site_name || PR.config.COMPANY,
      publisher: { '@id': site + '/#organization' },
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: site + '/products/?q={search_term_string}' },
        'query-input': 'required name=search_term_string'
      }
    };
  };

  seo.breadcrumbSchema = function (items) {
    if (!items || items.length < 2) return null;
    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: items.map(function (item, i) {
        return {
          '@type': 'ListItem',
          position: i + 1,
          name: item.name,
          item: absolute(item.url)
        };
      })
    };
  };

  /* Only fields that really exist in the database are published. No ratings or
     reviews are emitted, because the site does not collect them yet. */
  seo.productSchema = function (p, canonical) {
    var node = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.name,
      description: clean(p.metaDescription || p.shortDescription || p.description, 500) || undefined,
      sku: p.sku || undefined,
      brand: { '@type': 'Brand', name: PR.config.COMPANY },
      url: canonical,
      image: (p.images || []).map(function (img) { return img.url; })
    };
    if (!node.image.length) delete node.image;
    if (Number.isFinite(p.price) && p.price > 0) {
      node.offers = {
        '@type': 'Offer',
        priceCurrency: 'INR',
        price: String(p.price),
        url: canonical,
        availability: p.orderable ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        seller: { '@type': 'Organization', name: PR.config.COMPANY }
      };
    }
    return node;
  };

  /* Route -> page_seo.page_key, matched on the stored path so the admin can
     add a page without touching the code. */
  seo.keyForPath = function (store, pathname) {
    var path = (pathname || window.location.pathname || '/').replace(/index\.html$/, '');
    if (path.charAt(path.length - 1) !== '/') path += '/';
    var match = '';
    Object.keys(store.pages || {}).forEach(function (key) {
      var p = store.pages[key].path || '';
      if (p && path === p) match = key;
    });
    return match;
  };

  /* ----------------------------------------------------------------- apply */
  /* options:
       key         page_seo.page_key for this route
       title / description / keywords / image   run-time values (product, category)
       canonical   explicit canonical URL
       type        og:type, default "website"
       index / follow   booleans, override the stored ones
       breadcrumbs [{name, url}]
       product     normalised product for Product JSON-LD                    */
  seo.apply = function (options) {
    var opts = options || {};
    return seo.load().then(function (store) {
      var g = store.global || {};
      var key = opts.key || seo.keyForPath(store);
      var page = (store.pages || {})[key] || {};

      var title = clean(opts.title || page.title || g.meta_title || document.title);
      var description = clean(opts.description || page.description || g.meta_description ||
        (document.querySelector('meta[name="description"]') || {}).content, 300);
      var keywords = opts.keywords || page.keywords || g.keywords || '';
      var canonical = opts.canonical || page.canonical_url || seo.canonicalFor(page.path);
      var image = absolute(opts.image || page.og_image || g.og_image || '/assets/powerrun-logo.png');
      var twitterImage = absolute(opts.image || page.og_image || g.twitter_image || g.og_image || image);
      var indexable = opts.index !== undefined ? opts.index : (page.seo_index !== false);
      var followable = opts.follow !== undefined ? opts.follow : (page.seo_follow !== false);

      if (title) document.title = title;
      meta('description', description);
      meta('keywords', keywords);
      meta('robots', (indexable ? 'index' : 'noindex') + ',' + (followable ? 'follow' : 'nofollow') +
        (indexable ? ',max-image-preview:large' : ''));
      link('canonical', canonical);

      property('og:type', opts.type || 'website');
      property('og:site_name', g.site_name || PR.config.COMPANY);
      property('og:title', clean(opts.ogTitle || page.og_title || opts.title || g.og_title || title));
      property('og:description', clean(opts.ogDescription || page.og_description || description || g.og_description, 300));
      property('og:url', canonical);
      property('og:image', image);
      meta('twitter:card', 'summary_large_image');
      meta('twitter:title', clean(opts.ogTitle || page.og_title || title));
      meta('twitter:description', clean(opts.ogDescription || page.og_description || description, 300));
      meta('twitter:image', twitterImage);

      if (g.gsc_verification) meta('google-site-verification', g.gsc_verification);
      if (g.favicon_url) link('icon', absolute(g.favicon_url));

      jsonLd('ld-organization', seo.organizationSchema(g));
      jsonLd('ld-website', key === 'home' ? seo.websiteSchema(g) : null);
      jsonLd('ld-breadcrumb', seo.breadcrumbSchema(opts.breadcrumbs));
      jsonLd('ld-product', opts.product ? seo.productSchema(opts.product, canonical) : null);

      loadAnalytics(g.ga_measurement_id);
      return { global: g, page: page, canonical: canonical };
    });
  };

  /* Google Analytics 4, only when a measurement id is configured. */
  function loadAnalytics(id) {
    if (!id || window.__prGaLoaded || !/^G-[A-Z0-9]+$/i.test(id)) return;
    window.__prGaLoaded = true;
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    head().appendChild(script);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', id);
  }
})();
