/* PowerRun Industries - catalogue access and product card rendering.
 * Products and categories always come from Supabase. Nothing is hard-coded.
 */
(function () {
  'use strict';

  var PR = window.PR;

  /* Product images are embedded (a single unambiguous relationship).
     Category and sub-category names are resolved client-side from the
     categories list, because `products` has two foreign keys into
     `categories` and the embedded-select disambiguation hint is not
     supported by this project's PostgREST version. */
  var SELECT = '*, product_images(id,image_url,storage_path,sort_order,alt_text)';

  function queryProducts(label, build) {
    return PR.call(label, function (sb) { return build(sb, SELECT); });
  }

  PR.catalog = {
    products: [],
    categories: [],
    categoryById: {}
  };

  function categoryOf(id) {
    return (id && PR.catalog.categoryById[id]) || null;
  }

  PR.normalizeProduct = function (row) {
    var images = (row.product_images || [])
      .slice()
      .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); })
      .map(function (img) {
        return { id: img.id, url: img.image_url, path: img.storage_path, alt: img.alt_text || '', sort_order: img.sort_order || 0 };
      });

    // Specifications are stored as an ORDERED array [{label, value}] so the
    // spec table always reads in the sequence the admin entered. The older
    // {key: value} object form is still understood, but Postgres does not
    // preserve jsonb key order, so those render in arbitrary order.
    var specs = row.specifications;
    var specRows = [];
    var specText = '';
    if (Array.isArray(specs)) {
      specs.forEach(function (entry) {
        if (entry && entry.label) specRows.push({ label: entry.label, value: String(entry.value == null ? '' : entry.value) });
      });
    } else if (specs && typeof specs === 'object') {
      Object.keys(specs).forEach(function (key) {
        if (key === 'text') return;
        specRows.push({ label: key, value: String(specs[key]) });
      });
      specText = specs.text || '';
    } else if (specs) {
      specText = String(specs);
    }

    var features = Array.isArray(row.features) ? row.features
      : (typeof row.features === 'string' && row.features ? [row.features] : []);

    var stock = Number(row.stock) || 0;
    var availability = row.availability || (stock > 0 ? 'in_stock' : 'out_of_stock');
    var orderable = availability === 'in_stock' && stock > 0 &&
                    Number.isFinite(Number(row.price)) && Number(row.price) > 0;

    return {
      id: row.id,
      name: row.name,
      slug: row.slug || PR.slugify(row.name),
      sku: row.sku || '',
      categoryId: row.category_id,
      category: (categoryOf(row.category_id) || {}).name || '',
      categorySlug: (categoryOf(row.category_id) || {}).slug || '',
      subcategoryId: row.subcategory_id || null,
      subcategory: (categoryOf(row.subcategory_id) || {}).name || '',
      subcategorySlug: (categoryOf(row.subcategory_id) || {}).slug || '',
      shortDescription: row.short_description || '',
      description: row.description || '',
      price: row.price === null || row.price === undefined ? null : Number(row.price),
      mrp: row.mrp === null || row.mrp === undefined ? null : Number(row.mrp),
      discountPercent: Number(row.discount_percent) || 0,
      stock: stock,
      availability: availability,
      orderable: orderable,
      warranty: row.warranty || '',
      datasheetUrl: row.datasheet_url || '',
      datasheetName: row.datasheet_name || '',
      specRows: specRows,
      specText: specText || '',
      features: features,
      isActive: row.is_active !== false,
      isFeatured: !!row.is_featured,
      isNew: !!row.is_new,
      sortOrder: Number(row.sort_order) || 0,
      metaTitle: row.meta_title || '',
      metaDescription: row.meta_description || '',
      images: images,
      raw: row
    };
  };

  PR.loadCategories = async function (includeInactive) {
    var rows = await PR.call('load categories', function (sb) {
      var q = sb.from('categories').select('*').order('sort_order', { ascending: true }).order('name');
      if (!includeInactive) q = q.eq('is_active', true);
      return q;
    });
    PR.catalog.categories = rows || [];
    PR.catalog.categoryById = {};
    PR.catalog.categories.forEach(function (c) { PR.catalog.categoryById[c.id] = c; });
    return PR.catalog.categories;
  };

  PR.topCategories = function () {
    return PR.catalog.categories.filter(function (c) { return !c.parent_id; });
  };

  PR.subCategoriesOf = function (parentId) {
    return PR.catalog.categories.filter(function (c) { return c.parent_id === parentId; });
  };

  PR.ensureCategories = async function () {
    if (!PR.catalog.categories.length) await PR.loadCategories(true);
    return PR.catalog.categories;
  };

  PR.loadProducts = async function (options) {
    options = options || {};
    await PR.ensureCategories();
    var rows = await queryProducts('load products', function (sb, select) {
      var q = sb.from('products').select(select)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (!options.includeInactive) q = q.eq('is_active', true);
      if (options.categoryId) q = q.eq('category_id', options.categoryId);
      return q;
    });
    PR.catalog.products = (rows || []).map(PR.normalizeProduct);
    return PR.catalog.products;
  };

  PR.loadProductBySlug = async function (slug) {
    await PR.ensureCategories();
    var rows = await queryProducts('load product', function (sb, select) {
      return sb.from('products').select(select).eq('slug', slug).eq('is_active', true).limit(1);
    });
    return rows && rows.length ? PR.normalizeProduct(rows[0]) : null;
  };

  PR.loadProductById = async function (id) {
    await PR.ensureCategories();
    var rows = await queryProducts('load product', function (sb, select) {
      return sb.from('products').select(select).eq('id', id).limit(1);
    });
    return rows && rows.length ? PR.normalizeProduct(rows[0]) : null;
  };

  /* --------------------------------------------------------------- display */
  /* Clean, indexable product URL. scripts/seo_build.py writes a real page at
     this address for every product; /product/?slug=... still works and points
     its canonical here. */
  PR.productUrl = function (product) {
    return '/products/' + encodeURIComponent(product.slug) + '/';
  };

  PR.priceBlock = function (product) {
    var price = Number(product.price);
    var mrp = Number(product.mrp);
    var hasPrice = Number.isFinite(price) && price > 0;
    var hasMrp = Number.isFinite(mrp) && mrp > 0 && hasPrice && mrp > price;
    var html = '<div class="price-row"><span class="price-now">' + PR.money(product.price) + '</span>';
    if (hasMrp) {
      html += '<span class="price-mrp">' + PR.money(product.mrp) + '</span>' +
              '<span class="discount-badge">-' + Math.round((1 - price / mrp) * 100) + '%</span>';
    }
    return html + '</div>';
  };

  /* Price block for a product card: price, struck-through MRP, discount and
     the rupee amount saved. Kept separate from priceBlock(), which is the
     larger layout used on the product detail page. */
  PR.cardPriceBlock = function (product) {
    var price = Number(product.price);
    var mrp = Number(product.mrp);
    var hasPrice = Number.isFinite(price) && price > 0;

    if (!hasPrice) {
      return '<div class="card-price"><span class="price">Price on request</span></div>';
    }

    var hasMrp = Number.isFinite(mrp) && mrp > 0 && mrp > price;
    var html = '<div class="card-price"><span class="price">' + PR.money(price) + '</span>';
    if (hasMrp) {
      html += '<span class="card-mrp">' + PR.money(mrp) + '</span>' +
              '<span class="card-off">' + Math.round((1 - price / mrp) * 100) + '% OFF</span>';
    }
    html += '</div>';
    if (hasMrp) {
      html += '<div class="card-save">You save ' + PR.money(mrp - price) + '</div>';
    }
    return html;
  };

  PR.stockLine = function (product) {
    if (product.availability === 'discontinued') return '<div class="stock-line out">Discontinued</div>';
    if (product.availability === 'preorder') return '<div class="stock-line low">Available on pre-order</div>';
    if (product.availability === 'out_of_stock' || product.stock <= 0) {
      return '<div class="stock-line out">Out of stock</div>';
    }
    if (product.stock <= 5) {
      return '<div class="stock-line low">Only ' + product.stock + ' left in stock</div>';
    }
    return '<div class="stock-line in">In stock</div>';
  };

  PR.productImage = function (product, cssClass) {
    if (product.images.length) {
      return '<img src="' + PR.esc(product.images[0].url) + '" alt="' + PR.esc(product.name) +
             '" loading="lazy" width="400" height="400">';
    }
    return '<div class="ph' + (cssClass ? ' ' + cssClass : '') + '">' + PR.esc(PR.initials(product.name)) + '</div>';
  };

  PR.productCard = function (product) {
    var tag = '';
    if (!product.orderable && product.availability !== 'preorder') {
      tag = '<span class="tag stock-out">OUT OF STOCK</span>';
    } else if (product.isNew) {
      tag = '<span class="tag">NEW</span>';
    } else if (product.discountPercent > 0) {
      tag = '<span class="tag">-' + Math.round(product.discountPercent) + '%</span>';
    }

    var url = PR.productUrl(product);
    return '' +
      '<article class="card">' + tag +
        '<a class="card-img" href="' + url + '" aria-label="' + PR.esc(product.name) + '">' +
          PR.productImage(product) +
        '</a>' +
        '<div class="card-body">' +
          '<span class="catname">' + PR.esc(product.category || 'PowerRun') + '</span>' +
          '<h3><a href="' + url + '">' + PR.esc(product.name) + '</a></h3>' +
          '<p>' + PR.esc(product.shortDescription) + '</p>' +
          PR.cardPriceBlock(product) +
          (product.sku ? '<div class="card-sku">' + PR.esc(product.sku) + '</div>' : '') +
          '<div class="card-actions">' +
            '<a class="outline" href="' + url + '">VIEW</a>' +
            (product.orderable
              ? '<button class="btn orange" type="button" data-add-to-cart="' + PR.esc(product.id) + '">ADD TO CART</button>'
              : '<a class="btn dark" href="' + PR.esc(PR.whatsapp('Hello PowerRun Industries, I would like a quote for ' + product.name + (product.sku ? ' (' + product.sku + ')' : '') + '.')) + '" target="_blank" rel="noopener">GET QUOTE</a>') +
          '</div>' +
        '</div>' +
      '</article>';
  };

  /* Delegated add-to-cart for every grid on the site. */
  document.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-add-to-cart]');
    if (!btn || !PR.cart) return;
    event.preventDefault();
    var id = btn.getAttribute('data-add-to-cart');
    var product = PR.catalog.products.find(function (p) { return String(p.id) === String(id); });
    if (!product) { PR.toast('Product not found. Please reload the page.', 'error'); return; }
    PR.cart.add(product, 1);
  });

  PR.skeletonGrid = function (count) {
    var out = '';
    for (var i = 0; i < (count || 8); i++) out += '<div class="skeleton-card"></div>';
    return out;
  };
})();
