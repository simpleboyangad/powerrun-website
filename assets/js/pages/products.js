/* Products listing page */
(function () {
  'use strict';
  var PR = window.PR;

  var state = { category: '', subcategory: '', search: '', sort: 'featured' };

  function currentCategory() {
    if (!state.category) return null;
    return PR.catalog.categories.find(function (c) { return c.slug === state.category; }) || null;
  }

  function renderTabs() {
    var host = document.getElementById('categoryTabs');
    if (!host) return;
    var top = PR.topCategories();
    host.innerHTML =
      '<button class="tab' + (state.category ? '' : ' active') + '" type="button" data-cat="">ALL</button>' +
      top.map(function (cat) {
        var on = state.category === cat.slug ? ' active' : '';
        return '<button class="tab' + on + '" type="button" data-cat="' + PR.esc(cat.slug) + '">' +
               PR.esc(String(cat.name).toUpperCase()) + '</button>';
      }).join('');
  }

  function renderSubcategories() {
    var select = document.getElementById('subcategoryFilter');
    if (!select) return;
    var parent = currentCategory();
    var subs = parent ? PR.subCategoriesOf(parent.id) : [];
    select.innerHTML = '<option value="">All sub-categories</option>' +
      subs.map(function (s) {
        return '<option value="' + PR.esc(s.slug) + '"' +
               (state.subcategory === s.slug ? ' selected' : '') + '>' + PR.esc(s.name) + '</option>';
      }).join('');
    select.disabled = !subs.length;
    select.style.display = subs.length ? '' : 'none';
  }

  function visibleProducts() {
    var query = state.search.toLowerCase();
    var list = PR.catalog.products.filter(function (p) {
      if (state.category && p.categorySlug !== state.category) return false;
      if (state.subcategory && p.subcategorySlug !== state.subcategory) return false;
      if (!query) return true;
      return [p.name, p.sku, p.category, p.subcategory, p.shortDescription, p.description]
        .join(' ').toLowerCase().indexOf(query) !== -1;
    });

    var sorted = list.slice();
    if (state.sort === 'price-asc') {
      sorted.sort(function (a, b) { return (a.price || Infinity) - (b.price || Infinity); });
    } else if (state.sort === 'price-desc') {
      sorted.sort(function (a, b) { return (b.price || -1) - (a.price || -1); });
    } else if (state.sort === 'name') {
      sorted.sort(function (a, b) { return a.name.localeCompare(b.name); });
    } else {
      sorted.sort(function (a, b) {
        if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
        return a.sortOrder - b.sortOrder;
      });
    }
    return sorted;
  }

  function render() {
    var grid = document.getElementById('productGrid');
    var count = document.getElementById('productCount');
    if (!grid) return;

    var list = visibleProducts();
    if (count) {
      count.textContent = list.length + ' of ' + PR.catalog.products.length + ' products';
    }

    if (!list.length) {
      grid.innerHTML = '<div class="empty-state"><h3>No products match your search</h3>' +
        '<p>Try a different keyword or category.</p>' +
        '<button class="btn orange" type="button" id="clearFilters">Clear filters</button></div>';
      var clear = document.getElementById('clearFilters');
      if (clear) {
        clear.addEventListener('click', function () {
          state.category = ''; state.subcategory = ''; state.search = '';
          var s = document.getElementById('productSearch');
          if (s) s.value = '';
          syncUrl(); renderTabs(); renderSubcategories(); render();
        });
      }
      return;
    }
    grid.innerHTML = list.map(PR.productCard).join('');
  }

  function syncUrl() {
    var params = new URLSearchParams();
    if (state.category) params.set('category', state.category);
    if (state.subcategory) params.set('subcategory', state.subcategory);
    if (state.search) params.set('q', state.search);
    var qs = params.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  function bind() {
    var search = document.getElementById('productSearch');
    if (search) {
      search.addEventListener('input', function (event) {
        state.search = event.target.value.trim();
        syncUrl(); render();
      });
    }
    var sort = document.getElementById('productSort');
    if (sort) {
      sort.addEventListener('change', function (event) { state.sort = event.target.value; render(); });
    }
    var sub = document.getElementById('subcategoryFilter');
    if (sub) {
      sub.addEventListener('change', function (event) {
        state.subcategory = event.target.value; syncUrl(); render();
      });
    }
    var tabs = document.getElementById('categoryTabs');
    if (tabs) {
      tabs.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-cat]');
        if (!btn) return;
        state.category = btn.getAttribute('data-cat');
        state.subcategory = '';
        syncUrl(); renderTabs(); renderSubcategories(); render();
      });
    }
  }

  async function init() {
    PR.mountLayout('products');
    state.category = PR.param('category') || '';
    state.subcategory = PR.param('subcategory') || '';
    state.search = PR.param('q') || '';

    var searchInput = document.getElementById('productSearch');
    if (searchInput && state.search) searchInput.value = state.search;

    var grid = document.getElementById('productGrid');
    if (grid) grid.innerHTML = PR.skeletonGrid(8);
    bind();

    try {
      await Promise.all([PR.loadCategories(), PR.loadProducts()]);
      renderTabs();
      renderSubcategories();
      render();
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
