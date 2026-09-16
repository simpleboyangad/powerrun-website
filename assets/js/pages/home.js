/* Home page */
(function () {
  'use strict';
  var PR = window.PR;

  var ICONS = {
    'hybrid-inverters': '⚡',
    'lithium-batteries': '🔋',
    'solar-panels': '☀️',
    'e-rickshaw-batteries': '🛺',
    'home-energy-storage': '🏠',
    'commercial-energy-storage': '🏢',
    'industrial-energy-solutions': '🏭',
    'ev-batteries': '🚗',
    'ups-power-backup': '🔌',
    'accessories-spare-parts': '🧰'
  };

  function renderCategories(categories, products) {
    var host = document.getElementById('homeCategories');
    if (!host) return;
    var top = categories.filter(function (c) { return !c.parent_id; });
    if (!top.length) {
      host.innerHTML = '<div class="empty-state"><h3>Categories are being updated</h3>' +
        '<p>Please check back shortly.</p><a class="btn orange" href="/products/">Browse all products</a></div>';
      return;
    }
    host.innerHTML = top.map(function (cat) {
      var count = products.filter(function (p) { return p.categoryId === cat.id; }).length;
      return '<a class="cat" href="/products/?category=' + encodeURIComponent(cat.slug) + '">' +
        '<div class="pic">' + (ICONS[cat.slug] || '⚡') + '</div>' +
        '<h3>' + PR.esc(String(cat.name).toUpperCase()) + '</h3>' +
        '<p>' + PR.esc(cat.description || 'Explore the PowerRun range.') + '</p>' +
        '<small>' + count + ' product' + (count === 1 ? '' : 's') + '</small>' +
        '<span class="cat-link">View Products →</span>' +
      '</a>';
    }).join('');
  }

  function renderFeatured(products) {
    var host = document.getElementById('featuredGrid');
    if (!host) return;
    var featured = products.filter(function (p) { return p.isFeatured; });
    if (featured.length < 4) featured = products.slice(0, 8);
    featured = featured.slice(0, 8);

    if (!featured.length) {
      host.innerHTML = '<div class="empty-state"><h3>No products published yet</h3>' +
        '<p>Our catalogue is being updated. Please contact us for availability.</p>' +
        '<a class="btn orange" href="/contact/">Contact Us</a></div>';
      return;
    }
    host.innerHTML = featured.map(PR.productCard).join('');
  }

  async function init() {
    PR.mountLayout('home');
    var grid = document.getElementById('featuredGrid');
    if (grid) grid.innerHTML = PR.skeletonGrid(8);

    try {
      var results = await Promise.all([PR.loadCategories(), PR.loadProducts()]);
      renderCategories(results[0], results[1]);
      renderFeatured(results[1]);
    } catch (err) {
      PR.toast(err.message, 'error');
      if (grid) {
        grid.innerHTML = '<div class="empty-state"><h3>Products could not be loaded</h3>' +
          '<p>' + PR.esc(err.message) + '</p>' +
          '<button class="btn orange" type="button" onclick="location.reload()">Try again</button></div>';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
