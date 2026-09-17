/* Admin - SEO Manager.
 *
 * Three tabs, all reading and writing the tables added in sql/11_seo.sql:
 *   Dashboard  health score and what is missing, counted from real data
 *   Global SEO the site-wide defaults every page falls back to
 *   Pages      one row per real route (no new routes are invented here)
 *
 * Product and category SEO live inside their own editors (Products, Categories)
 * so there is a single place to edit each record.
 */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var TITLE_MIN = 50, TITLE_MAX = 60;
  var DESC_MIN = 140, DESC_MAX = 160;

  var state = { tab: 'dashboard', global: {}, pages: [], products: [], categories: [], files: {} };
  var host = null;

  /* ------------------------------------------------------------------ data */
  async function loadAll() {
    var results = await Promise.all([
      PR.call('load global SEO', function (sb) { return sb.from('global_seo').select('*').eq('id', 1).maybeSingle(); }),
      PR.call('load page SEO', function (sb) { return sb.from('page_seo').select('*').order('sort_order').order('page_name'); }),
      PR.call('load products', function (sb) {
        return sb.from('products').select('id,name,sku,slug,is_active,meta_title,meta_description,focus_keyword,' +
          'canonical_url,og_image,image_alt,seo_index,product_images(id,alt_text)').order('sort_order');
      }),
      PR.call('load categories', function (sb) {
        return sb.from('categories').select('id,name,slug,parent_id,is_active,meta_title,meta_description,focus_keyword,' +
          'canonical_url,og_image,seo_index').order('sort_order').order('name');
      })
    ]);
    state.global = results[0] || { id: 1 };
    state.pages = results[1] || [];
    state.products = results[2] || [];
    state.categories = results[3] || [];
    state.files = await fileStatus();
  }

  /* sitemap.xml and robots.txt are static files served by the site itself. */
  async function fileStatus() {
    var out = {};
    await Promise.all(['/sitemap.xml', '/robots.txt'].map(async function (path) {
      try {
        var res = await fetch(path + '?t=' + Date.now(), { cache: 'no-store' });
        var text = res.ok ? await res.text() : '';
        out[path] = {
          ok: res.ok,
          urls: (text.match(/<loc>/g) || []).length,
          hasSitemapLine: /Sitemap:\s*https?:\/\//i.test(text),
          blocksAdmin: /Disallow:\s*\/admin/i.test(text),
          bytes: text.length
        };
      } catch (err) {
        out[path] = { ok: false, urls: 0 };
      }
    }));
    return out;
  }

  /* ----------------------------------------------------------- SEO scoring */
  /* Only clearly defined, checkable fields count towards the score. */
  function productChecks(p) {
    var images = p.product_images || [];
    return [
      { key: 'title', label: 'SEO Title', done: !!p.meta_title },
      { key: 'description', label: 'Meta Description', done: !!p.meta_description },
      { key: 'slug', label: 'SEO Slug', done: !!p.slug },
      { key: 'canonical', label: 'Canonical', done: !!p.canonical_url || !!p.slug },
      { key: 'og', label: 'OG Image', done: !!p.og_image || images.length > 0 },
      { key: 'alt', label: 'Image ALT', done: !!p.image_alt || images.some(function (i) { return !!i.alt_text; }) },
      { key: 'keyword', label: 'Focus Keyword', done: !!p.focus_keyword }
    ];
  }

  function categoryChecks(c) {
    return [
      { key: 'title', label: 'SEO Title', done: !!c.meta_title },
      { key: 'description', label: 'Meta Description', done: !!c.meta_description },
      { key: 'slug', label: 'SEO Slug', done: !!c.slug },
      { key: 'keyword', label: 'Focus Keyword', done: !!c.focus_keyword }
    ];
  }

  function pageChecks(p) {
    return [
      { key: 'title', label: 'SEO Title', done: !!p.title },
      { key: 'description', label: 'Meta Description', done: !!p.description || !p.seo_index }
    ];
  }

  function globalChecks(g) {
    return [
      { key: 'meta_title', label: 'Meta Title', done: !!g.meta_title },
      { key: 'meta_description', label: 'Meta Description', done: !!g.meta_description },
      { key: 'site_url', label: 'Website URL', done: !!g.site_url },
      { key: 'og_image', label: 'Default OG Image', done: !!g.og_image },
      { key: 'keywords', label: 'Primary Keywords', done: !!g.keywords }
    ];
  }

  function health() {
    var done = 0, total = 0;
    function add(list) { list.forEach(function (c) { total++; if (c.done) done++; }); }
    add(globalChecks(state.global));
    state.pages.filter(function (p) { return p.seo_index; }).forEach(function (p) { add(pageChecks(p)); });
    state.products.filter(function (p) { return p.is_active; }).forEach(function (p) { add(productChecks(p)); });
    state.categories.filter(function (c) { return c.is_active; }).forEach(function (c) { add(categoryChecks(c)); });
    var files = state.files || {};
    total += 2;
    if (files['/sitemap.xml'] && files['/sitemap.xml'].ok) done++;
    if (files['/robots.txt'] && files['/robots.txt'].ok) done++;
    return { done: done, total: total, percent: total ? Math.round((done / total) * 100) : 0 };
  }

  /* ------------------------------------------------------------- form bits */
  function counterHint(len, min, max) {
    var cls = len === 0 ? '' : (len < min ? ' warn' : (len > max ? ' over' : ' good'));
    return '<span class="seo-counter' + cls + '">Characters: <b>' + len + '</b> / ' + max +
           ' · Recommended: ' + min + '–' + max + '</span>';
  }

  function field(opts) {
    var value = opts.value == null ? '' : String(opts.value);
    var input = opts.textarea
      ? '<textarea id="' + opts.id + '"' + (opts.rows ? ' rows="' + opts.rows + '"' : '') +
        (opts.counter ? ' data-counter="' + opts.min + ',' + opts.max + '"' : '') +
        (opts.placeholder ? ' placeholder="' + PR.esc(opts.placeholder) + '"' : '') + '>' + PR.esc(value) + '</textarea>'
      : '<input id="' + opts.id + '" type="' + (opts.type || 'text') + '" value="' + PR.esc(value) + '"' +
        (opts.counter ? ' data-counter="' + opts.min + ',' + opts.max + '"' : '') +
        (opts.placeholder ? ' placeholder="' + PR.esc(opts.placeholder) + '"' : '') + '>';
    return '<label>' + PR.esc(opts.label) + input +
      (opts.counter ? counterHint(value.length, opts.min, opts.max) : '') +
      (opts.hint ? '<span class="hint">' + opts.hint + '</span>' : '') +
      '</label>';
  }

  function checkbox(id, label, checked, hint) {
    return '<label class="inline"><input id="' + id + '" type="checkbox"' + (checked ? ' checked' : '') + '> ' +
      PR.esc(label) + (hint ? '<span class="hint">' + hint + '</span>' : '') + '</label>';
  }

  /* Google result preview, refreshed as the fields are typed in. */
  function preview(id) {
    return '<div class="seo-preview" id="' + id + '">' +
      '<div class="seo-preview-head">Google search preview</div>' +
      '<div class="seo-preview-url" data-role="url"></div>' +
      '<div class="seo-preview-title" data-role="title"></div>' +
      '<div class="seo-preview-desc" data-role="desc"></div>' +
    '</div>';
  }

  function bindPreview(previewId, titleId, descId, urlValue) {
    var box = document.getElementById(previewId);
    if (!box) return;
    function paint() {
      var title = (document.getElementById(titleId) || {}).value || state.global.meta_title || 'PowerRun Industries';
      var desc = (document.getElementById(descId) || {}).value || state.global.meta_description || '';
      box.querySelector('[data-role="title"]').textContent = title.slice(0, 70);
      box.querySelector('[data-role="desc"]').textContent = desc.slice(0, 200);
      box.querySelector('[data-role="url"]').textContent =
        (typeof urlValue === 'function' ? urlValue() : urlValue) || state.global.site_url || 'https://powerrun.in';
    }
    [titleId, descId].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', paint);
    });
    paint();
  }

  function bindCounters(scope) {
    (scope || document).querySelectorAll('[data-counter]').forEach(function (el) {
      var bounds = el.getAttribute('data-counter').split(',');
      var min = Number(bounds[0]), max = Number(bounds[1]);
      var out = el.parentElement.querySelector('.seo-counter');
      if (!out) return;
      el.addEventListener('input', function () {
        var len = el.value.length;
        out.innerHTML = 'Characters: <b>' + len + '</b> / ' + max + ' · Recommended: ' + min + '–' + max;
        out.className = 'seo-counter' + (len === 0 ? '' : (len < min ? ' warn' : (len > max ? ' over' : ' good')));
      });
    });
  }

  /* ------------------------------------------------------------- dashboard */
  function missingList(title, rows, linkBase) {
    if (!rows.length) return '';
    return '<div class="seo-missing"><b>' + PR.esc(title) + ' (' + rows.length + ')</b><ul>' +
      rows.slice(0, 12).map(function (r) {
        return '<li>' + PR.esc(r.name) + (r.sku ? ' <span class="hint">' + PR.esc(r.sku) + '</span>' : '') + '</li>';
      }).join('') +
      (rows.length > 12 ? '<li class="hint">…and ' + (rows.length - 12) + ' more</li>' : '') +
      '</ul>' + (linkBase ? '<a class="btn ghost small" href="' + linkBase + '">Open editor</a>' : '') + '</div>';
  }

  function dashboard() {
    var h = health();
    var active = state.products.filter(function (p) { return p.is_active; });
    var noTitle = active.filter(function (p) { return !p.meta_title; });
    var noDesc = active.filter(function (p) { return !p.meta_description; });
    var noAlt = active.filter(function (p) {
      var imgs = p.product_images || [];
      return !p.image_alt && !imgs.some(function (i) { return !!i.alt_text; });
    });
    var noCanonical = active.filter(function (p) { return !p.canonical_url && !p.slug; });
    var complete = active.filter(function (p) {
      return productChecks(p).every(function (c) { return c.done; });
    });
    var indexablePages = state.pages.filter(function (p) { return p.seo_index; }).length;
    var indexableCats = state.categories.filter(function (c) { return c.is_active && c.seo_index !== false && !c.parent_id; }).length;
    var sitemap = state.files['/sitemap.xml'] || {};
    var robots = state.files['/robots.txt'] || {};
    var site = (state.global.site_url || PR.config.SITE_URL || '').replace(/\/+$/, '');

    return '' +
      '<div class="panel">' +
        '<h2>SEO Health</h2>' +
        '<div class="seo-health">' +
          '<div class="seo-score"><b>' + h.percent + '%</b><span>' + h.done + ' of ' + h.total + ' checks</span></div>' +
          '<div class="seo-bar"><span style="width:' + h.percent + '%"></span></div>' +
        '</div>' +
        '<p class="hint">Each check is a single named field that is either filled in or empty: global defaults, ' +
          'page titles and descriptions, product title / description / slug / canonical / OG image / ALT text / focus keyword, ' +
          'category title, description, slug and keyword, plus sitemap.xml and robots.txt.</p>' +
      '</div>' +

      '<div class="stats">' +
        '<div class="stat"><small>Indexable pages</small><strong>' + (indexablePages + active.length + indexableCats) + '</strong></div>' +
        '<div class="stat"><small>Products with SEO complete</small><strong>' + complete.length + ' / ' + active.length + '</strong></div>' +
        '<div class="stat"><small>Missing SEO title</small><strong>' + noTitle.length + '</strong></div>' +
        '<div class="stat"><small>Missing meta description</small><strong>' + noDesc.length + '</strong></div>' +
        '<div class="stat"><small>Missing image ALT</small><strong>' + noAlt.length + '</strong></div>' +
        '<div class="stat"><small>Missing canonical</small><strong>' + noCanonical.length + '</strong></div>' +
      '</div>' +

      '<div class="panel">' +
        '<h2>Sitemap &amp; robots.txt</h2>' +
        '<table class="grid"><tbody>' +
          '<tr><td>Sitemap</td><td><a href="/sitemap.xml" target="_blank" rel="noopener">' + site + '/sitemap.xml</a></td>' +
            '<td>' + (sitemap.ok ? '<span class="pill ok">OK · ' + sitemap.urls + ' URLs</span>' : '<span class="pill bad">Missing</span>') + '</td></tr>' +
          '<tr><td>robots.txt</td><td><a href="/robots.txt" target="_blank" rel="noopener">' + site + '/robots.txt</a></td>' +
            '<td>' + (robots.ok
              ? '<span class="pill ok">OK</span> ' +
                (robots.blocksAdmin ? '<span class="pill ok">/admin blocked</span> ' : '<span class="pill bad">/admin not blocked</span> ') +
                (robots.hasSitemapLine ? '<span class="pill ok">sitemap linked</span>' : '<span class="pill bad">no sitemap line</span>')
              : '<span class="pill bad">Missing</span>') + '</td></tr>' +
        '</tbody></table>' +
        '<p class="hint">Submit the sitemap URL in Google Search Console → Sitemaps. Both files are regenerated from this ' +
          'database when the site is published (<code>python scripts/seo_build.py</code>).</p>' +
      '</div>' +

      '<div class="panel">' +
        '<h2>What still needs SEO</h2>' +
        (noTitle.length + noDesc.length + noAlt.length ? '' : '<p class="hint">Nothing missing. 🎉</p>') +
        missingList('Products missing SEO title', noTitle, '/admin/products/') +
        missingList('Products missing meta description', noDesc, '/admin/products/') +
        missingList('Products missing image ALT text', noAlt, '/admin/products/') +
        missingList('Categories missing SEO title', state.categories.filter(function (c) { return c.is_active && !c.meta_title; }), '/admin/categories/') +
      '</div>';
  }

  /* ---------------------------------------------------------------- global */
  function globalTab() {
    var g = state.global || {};
    return '<div class="panel">' +
      '<h2>Global SEO</h2>' +
      '<p class="hint">Used on every page that has no value of its own.</p>' +
      '<form class="form" id="globalForm">' +
        '<div id="globalMessage"></div>' +
        '<div class="form-grid">' +
          field({ id: 'g_site_name', label: 'Website Title (brand name)', value: g.site_name, hint: 'Shown as og:site_name and in schema.' }) +
          field({ id: 'g_site_url', label: 'Website URL', value: g.site_url, hint: 'Example: https://powerrun.in' }) +
        '</div>' +
        field({ id: 'g_meta_title', label: 'Meta Title', value: g.meta_title, counter: true, min: TITLE_MIN, max: TITLE_MAX,
                hint: 'The blue line in Google results.' }) +
        field({ id: 'g_meta_description', label: 'Meta Description', value: g.meta_description, textarea: true, rows: 3,
                counter: true, min: DESC_MIN, max: DESC_MAX, hint: 'The grey text under the title in Google results.' }) +
        field({ id: 'g_keywords', label: 'Primary Keywords', value: g.keywords, hint: 'Comma separated. Minor ranking factor, kept for completeness.' }) +
        preview('globalPreview') +
        '<div class="form-grid">' +
          field({ id: 'g_og_title', label: 'Default OG Title', value: g.og_title, hint: 'Used by WhatsApp / Facebook link previews.' }) +
          field({ id: 'g_og_image', label: 'Default OG Image URL', value: g.og_image, hint: '1200×630 works best.' }) +
        '</div>' +
        field({ id: 'g_og_description', label: 'Default OG Description', value: g.og_description, textarea: true, rows: 2 }) +
        '<div class="form-grid">' +
          field({ id: 'g_twitter_image', label: 'Twitter / X Card Image URL', value: g.twitter_image }) +
          field({ id: 'g_favicon_url', label: 'Favicon URL', value: g.favicon_url, hint: 'Default: /assets/powerrun-logo.png' }) +
        '</div>' +
        '<div class="form-grid">' +
          field({ id: 'g_gsc', label: 'Google Search Console Verification Code', value: g.gsc_verification,
                  hint: 'Paste only the content value of the meta tag Google gives you.' }) +
          field({ id: 'g_ga', label: 'Google Analytics Measurement ID', value: g.ga_measurement_id, placeholder: 'G-XXXXXXXXXX',
                  hint: 'Analytics loads on the public site only when this is filled in.' }) +
        '</div>' +
        field({ id: 'g_canonical', label: 'Default Canonical URL', value: g.default_canonical, hint: 'Normally the same as the website URL.' }) +
        field({ id: 'g_robots', label: 'robots.txt content', value: g.robots_txt, textarea: true, rows: 8,
                hint: 'Leave empty to use the safe default (blocks /admin, /cart, /checkout, /account and links the sitemap).' }) +
        '<div class="page-actions" style="justify-content:flex-end">' +
          '<button class="btn gray" type="button" id="globalResetBtn">Reset</button>' +
          '<button class="btn ghost" type="button" id="globalDefaultsBtn">Restore recommended text</button>' +
          '<button class="btn" type="submit" id="globalSaveBtn">SAVE / UPDATE</button>' +
        '</div>' +
      '</form>' +
    '</div>';
  }

  var RECOMMENDED = {
    g_meta_title: 'PowerRun Industries | Lithium Batteries, Hybrid Inverters & Solar Panels',
    g_meta_description: 'PowerRun Industries supplies lithium batteries, hybrid solar inverters, solar panels and e-rickshaw batteries for homes, businesses and electric mobility across India.',
    g_keywords: 'lithium battery, hybrid solar inverter, solar panel, e-rickshaw battery, solar battery, power bank, stabilizer, PowerRun Industries',
    g_og_title: 'PowerRun Industries | Energy Storage & Solar Solutions',
    g_og_description: 'Lithium batteries, hybrid solar inverters, solar panels and e-rickshaw batteries, built and supported in India.'
  };

  async function saveGlobal(event) {
    event.preventDefault();
    var button = document.getElementById('globalSaveBtn');
    var payload = {
      id: 1,
      site_name: val('g_site_name'), site_url: val('g_site_url'),
      meta_title: val('g_meta_title'), meta_description: val('g_meta_description'),
      keywords: val('g_keywords'), og_title: val('g_og_title'), og_description: val('g_og_description'),
      og_image: val('g_og_image'), twitter_image: val('g_twitter_image'), favicon_url: val('g_favicon_url'),
      gsc_verification: val('g_gsc'), ga_measurement_id: val('g_ga'),
      default_canonical: val('g_canonical'), robots_txt: val('g_robots')
    };
    PR.setBusy(button, true, 'SAVING…');
    try {
      await PR.call('save global SEO', function (sb) { return sb.from('global_seo').upsert(payload); });
      state.global = Object.assign({}, state.global, payload);
      if (PR.seo) PR.seo.clearCache();
      PR.setBusy(button, false);
      document.getElementById('globalMessage').innerHTML =
        '<div class="form-message success">Saved. The public pages pick this up immediately; run ' +
        '<code>python scripts/seo_build.py</code> to rewrite sitemap.xml, robots.txt and the static tags.</div>';
      PR.toast('Global SEO saved.', 'success');
    } catch (err) {
      PR.setBusy(button, false);
      document.getElementById('globalMessage').innerHTML =
        '<div class="form-message error" role="alert">' + PR.esc(err.message) + '</div>';
      PR.toast(err.message, 'error');
    }
  }

  function val(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    var value = el.value.trim();
    return value === '' ? null : value;
  }

  /* ----------------------------------------------------------------- pages */
  function pagesTab() {
    return '<div class="panel">' +
      '<h2>Page SEO</h2>' +
      '<p class="hint">One row per page that exists on the website. Category pages are edited in ' +
        '<a href="/admin/categories/">Categories</a> and product pages in <a href="/admin/products/">Products</a>.</p>' +
      '<div class="table-scroll"><table class="grid"><thead><tr>' +
        '<th>Page</th><th>Path</th><th>SEO title</th><th>Status</th><th></th>' +
      '</tr></thead><tbody>' +
      state.pages.map(function (p) {
        var checks = pageChecks(p);
        var done = checks.filter(function (c) { return c.done; }).length;
        return '<tr>' +
          '<td><b>' + PR.esc(p.page_name) + '</b></td>' +
          '<td><a href="' + PR.esc(p.path) + '" target="_blank" rel="noopener">' + PR.esc(p.path) + '</a></td>' +
          '<td>' + (p.title ? PR.esc(p.title) : '<span class="hint">not set</span>') + '</td>' +
          '<td>' + (p.seo_index ? '<span class="pill ok">Index</span>' : '<span class="pill">Noindex</span>') +
            ' <span class="hint">' + done + '/' + checks.length + '</span></td>' +
          '<td style="text-align:right"><button class="btn ghost small" type="button" data-edit-page="' +
            PR.esc(p.page_key) + '">Edit</button></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>' +
    '</div>';
  }

  function editPage(key) {
    var p = state.pages.find(function (row) { return row.page_key === key; });
    if (!p) return;
    var site = (state.global.site_url || PR.config.SITE_URL || '').replace(/\/+$/, '');
    var body = PRA.openDrawer('SEO · ' + p.page_name,
      '<form class="form" id="pageForm">' +
        '<div id="pageMessage"></div>' +
        '<div class="form-grid">' +
          field({ id: 'p_name', label: 'Page Name', value: p.page_name }) +
          field({ id: 'p_path', label: 'URL Slug / Path', value: p.path, hint: 'Existing route. Changing it here does not move the page.' }) +
        '</div>' +
        field({ id: 'p_title', label: 'SEO Title', value: p.title, counter: true, min: TITLE_MIN, max: TITLE_MAX }) +
        field({ id: 'p_desc', label: 'Meta Description', value: p.description, textarea: true, rows: 3,
                counter: true, min: DESC_MIN, max: DESC_MAX }) +
        field({ id: 'p_keywords', label: 'Keywords', value: p.keywords, hint: 'Comma separated.' }) +
        preview('pagePreview') +
        field({ id: 'p_canonical', label: 'Canonical URL', value: p.canonical_url,
                hint: 'Leave empty to use ' + PR.esc(site + p.path) }) +
        '<div class="form-grid">' +
          field({ id: 'p_og_title', label: 'OG Title', value: p.og_title }) +
          field({ id: 'p_og_image', label: 'OG Image URL', value: p.og_image }) +
        '</div>' +
        field({ id: 'p_og_desc', label: 'OG Description', value: p.og_description, textarea: true, rows: 2 }) +
        '<div class="form-grid three">' +
          checkbox('p_index', 'Index (allow in search results)', p.seo_index) +
          checkbox('p_follow', 'Follow links', p.seo_follow) +
          checkbox('p_sitemap', 'Include in sitemap.xml', p.in_sitemap) +
        '</div>' +
        '<div class="page-actions" style="justify-content:flex-end">' +
          '<button class="btn gray" type="button" id="pageCancelBtn">Cancel</button>' +
          '<button class="btn" type="submit" id="pageSaveBtn">SAVE CHANGES</button>' +
        '</div>' +
      '</form>');

    bindCounters(body);
    bindPreview('pagePreview', 'p_title', 'p_desc', function () {
      return (val('p_canonical') || (site + (val('p_path') || p.path)));
    });
    document.getElementById('pageCancelBtn').addEventListener('click', PRA.closeDrawer);
    document.getElementById('pageForm').addEventListener('submit', async function (event) {
      event.preventDefault();
      var button = document.getElementById('pageSaveBtn');
      PR.setBusy(button, true, 'SAVING…');
      try {
        var payload = {
          page_name: val('p_name') || p.page_name,
          path: val('p_path') || p.path,
          title: val('p_title'), description: val('p_desc'), keywords: val('p_keywords'),
          canonical_url: val('p_canonical'), og_title: val('p_og_title'),
          og_description: val('p_og_desc'), og_image: val('p_og_image'),
          seo_index: document.getElementById('p_index').checked,
          seo_follow: document.getElementById('p_follow').checked,
          in_sitemap: document.getElementById('p_sitemap').checked
        };
        await PR.call('save page SEO', function (sb) {
          return sb.from('page_seo').update(payload).eq('id', p.id);
        });
        if (PR.seo) PR.seo.clearCache();
        PRA.closeDrawer();
        PR.toast('Page SEO saved.', 'success');
        await refresh();
      } catch (err) {
        PR.setBusy(button, false);
        document.getElementById('pageMessage').innerHTML =
          '<div class="form-message error" role="alert">' + PR.esc(err.message) + '</div>';
        PR.toast(err.message, 'error');
      }
    });
  }

  /* ------------------------------------------------------------------ view */
  function render() {
    var tabs = [['dashboard', 'Dashboard'], ['global', 'Global SEO'], ['pages', 'Pages']];
    host.innerHTML =
      '<div class="tabs-row">' + tabs.map(function (t) {
        return '<button class="tab-btn' + (state.tab === t[0] ? ' active' : '') + '" type="button" data-tab="' +
          t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>' +
      (state.tab === 'dashboard' ? dashboard() : state.tab === 'global' ? globalTab() : pagesTab());

    host.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () { state.tab = btn.getAttribute('data-tab'); render(); });
    });
    host.querySelectorAll('[data-edit-page]').forEach(function (btn) {
      btn.addEventListener('click', function () { editPage(btn.getAttribute('data-edit-page')); });
    });
    if (state.tab === 'global') {
      bindCounters(host);
      bindPreview('globalPreview', 'g_meta_title', 'g_meta_description', function () {
        return val('g_site_url') || PR.config.SITE_URL;
      });
      document.getElementById('globalForm').addEventListener('submit', saveGlobal);
      document.getElementById('globalResetBtn').addEventListener('click', function () { render(); });
      document.getElementById('globalDefaultsBtn').addEventListener('click', function () {
        Object.keys(RECOMMENDED).forEach(function (id) {
          var el = document.getElementById(id);
          if (el) { el.value = RECOMMENDED[id]; el.dispatchEvent(new Event('input')); }
        });
        PR.toast('Recommended text filled in. Review it, then press Save.', 'info');
      });
    }
  }

  async function refresh() {
    await loadAll();
    render();
  }

  async function init() {
    try {
      await PRA.requireAdmin();
    } catch (err) {
      return;
    }
    host = PRA.mountShell('seo', 'SEO Manager');
    host.innerHTML = PRA.skeleton(6);
    try {
      await refresh();
    } catch (err) {
      host.innerHTML = PRA.empty('SEO data could not be loaded', err.message,
        '<button class="btn" type="button" onclick="location.reload()">Try again</button>');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
