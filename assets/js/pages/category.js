/* Category landing page: /hybrid-inverters/, /lithium-batteries/, ...
 *
 * The intro, buying guide and FAQ are plain HTML in the page. The product grid
 * is also written into the HTML by scripts/seo_build.py so the page has real
 * content without JavaScript; this script swaps it for the live cards (current
 * price, stock, add-to-cart) and applies the category's SEO fields.
 */
(function () {
  'use strict';
  var PR = window.PR;

  function applySeo(cat) {
    var head = document.querySelector('meta[name="description"]');
    PR.seo.apply({
      key: 'category',
      title: cat.meta_title || document.title,
      description: cat.meta_description || (head && head.content) || '',
      keywords: cat.focus_keyword || '',
      canonical: cat.canonical_url || PR.seo.categoryUrl(cat.slug),
      image: cat.og_image || cat.image_url || '',
      index: cat.seo_index !== false,
      follow: cat.seo_follow !== false,
      breadcrumbs: [
        { name: 'Home', url: '/' },
        { name: 'Products', url: '/products/' },
        { name: cat.name, url: PR.seo.categoryUrl(cat.slug) }
      ]
    });
  }

  async function init() {
    PR.mountLayout('products', false);
    var main = document.getElementById('main');
    var slug = main && main.getAttribute('data-category');
    var grid = document.getElementById('categoryGrid');
    if (!slug || !grid) return;

    try {
      await Promise.all([PR.loadCategories(), PR.loadProducts()]);
      var cat = PR.catalog.categories.find(function (c) { return c.slug === slug; });
      if (cat) applySeo(cat);
      var items = PR.catalog.products.filter(function (p) {
        return p.categorySlug === slug || p.subcategorySlug === slug;
      });
      // keep the built-in cards if the live list comes back empty
      if (items.length) grid.innerHTML = items.map(PR.productCard).join('');
    } catch (err) {
      // the static cards from the HTML stay in place; nothing to repair
      console.warn('[PowerRun] live products unavailable:', err.message);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
