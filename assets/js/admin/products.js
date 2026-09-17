/* Admin - product management (create, edit, delete, stock, price, images). */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;
  var BUCKET = PR.config.STORAGE_BUCKET;
  var MAX_IMAGES = PR.config.MAX_PRODUCT_IMAGES;

  var products = [];
  var categories = [];
  var editing = null;          // product row being edited, or null for a new one
  var existingImages = [];     // [{id, image_url, storage_path}]
  var pendingFiles = [];       // File[] queued for upload
  var DATASHEET_BUCKET = 'product-datasheets';
  var MAX_DATASHEET_MB = 20;
  var pendingDatasheet = null; // File queued to replace the current datasheet
  var removeDatasheet = false; // true when the admin clicked "Remove"

  /* ------------------------------------------------------------------ data */
  async function loadAll() {
    var results = await Promise.all([
      PR.call('load categories', function (sb) {
        return sb.from('categories').select('*').order('sort_order').order('name');
      }),
      PR.call('load products', function (sb) {
        return sb.from('products')
          .select('*, product_images(id,image_url,storage_path,sort_order)')
          .order('sort_order').order('created_at');
      })
    ]);
    categories = results[0] || [];
    products = results[1] || [];
  }

  function categoryName(id) {
    var c = categories.find(function (x) { return x.id === id; });
    return c ? c.name : '';
  }
  function topCategories() { return categories.filter(function (c) { return !c.parent_id; }); }
  function subsOf(parentId) { return categories.filter(function (c) { return c.parent_id === parentId; }); }

  function firstImage(product) {
    var images = (product.product_images || []).slice()
      .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
    return images.length ? images[0].image_url : null;
  }

  /* ------------------------------------------------------------------ list */
  function renderList(host) {
    host.innerHTML =
      '<div class="panel">' +
        '<div class="panel-head">' +
          '<h2>Products</h2>' +
          '<div class="page-actions">' +
            '<button class="btn" type="button" id="newProductBtn">+ Add Product</button>' +
          '</div>' +
        '</div>' +
        '<div class="toolbar">' +
          '<input type="search" id="productSearch" placeholder="Search name, SKU or category…" aria-label="Search products">' +
          '<select id="categoryFilter"><option value="">All categories</option>' +
            topCategories().map(function (c) {
              return '<option value="' + PR.esc(c.id) + '">' + PR.esc(c.name) + '</option>';
            }).join('') +
          '</select>' +
          '<select id="statusFilter">' +
            '<option value="">All statuses</option>' +
            '<option value="active">Active only</option>' +
            '<option value="inactive">Inactive only</option>' +
          '</select>' +
          '<span class="count" id="productCount">' + products.length + ' products</span>' +
        '</div>' +
        (products.length
          ? '<div class="table-scroll"><table class="grid" id="productTable"><thead><tr>' +
              '<th>Product</th><th>SKU</th><th>Category</th><th>Price</th><th>Stock</th>' +
              '<th>Status</th><th>Images</th><th></th>' +
            '</tr></thead><tbody>' + products.map(row).join('') + '</tbody></table></div>'
          : PRA.empty('No products yet', 'Add your first product to publish it on powerrun.in.',
              '<button class="btn" type="button" id="emptyAddBtn">+ Add Product</button>')) +
      '</div>';

    var add = document.getElementById('newProductBtn');
    if (add) add.addEventListener('click', function () { openForm(null); });
    var emptyAdd = document.getElementById('emptyAddBtn');
    if (emptyAdd) emptyAdd.addEventListener('click', function () { openForm(null); });

    PRA.bindSearch('productSearch', 'productTable', 'productCount');
    bindFilters();
  }

  function row(p) {
    var image = firstImage(p);
    var count = (p.product_images || []).length;
    return '<tr data-category="' + PR.esc(p.category_id || '') + '" data-status="' +
             (p.is_active ? 'active' : 'inactive') + '">' +
      '<td><div style="display:flex;gap:10px;align-items:center">' +
        (image
          ? '<img src="' + PR.esc(image) + '" alt="" width="42" height="42" ' +
            'style="width:42px;height:42px;object-fit:contain;background:#fafafa;border:1px solid #eee;border-radius:6px">'
          : '<div style="width:42px;height:42px;border-radius:6px;background:#171717;color:#fff;display:grid;place-items:center;font-size:11px;font-weight:800">' +
            PR.esc(PR.initials(p.name)) + '</div>') +
        '<div><b>' + PR.esc(p.name) + '</b>' +
          (p.is_featured ? '<small>Featured</small>' : '') + '</div>' +
      '</div></td>' +
      '<td class="nowrap">' + PR.esc(p.sku || '-') + '</td>' +
      '<td>' + PR.esc(categoryName(p.category_id) || '-') +
        (p.subcategory_id ? '<small>' + PR.esc(categoryName(p.subcategory_id)) + '</small>' : '') + '</td>' +
      '<td class="nowrap">' + (p.price ? PR.money(p.price) : '<span style="color:#b3261e">Not set</span>') +
        (p.mrp ? '<small>MRP ' + PR.money(p.mrp) + '</small>' : '') + '</td>' +
      '<td><b style="color:' + (Number(p.stock) > 5 ? '#14663a' : Number(p.stock) > 0 ? '#96590a' : '#b3261e') + '">' +
        (Number(p.stock) || 0) + '</b><small>' + PR.esc(p.availability || '-') + '</small></td>' +
      '<td>' + PRA.pill(p.is_active ? 'active' : 'inactive') + '</td>' +
      '<td class="nowrap">' + count + ' / ' + MAX_IMAGES + '</td>' +
      '<td class="nowrap">' +
        '<button class="btn ghost small" type="button" data-edit="' + PR.esc(p.id) + '">Edit</button> ' +
        '<button class="btn gray small" type="button" data-toggle="' + PR.esc(p.id) + '">' +
          (p.is_active ? 'Deactivate' : 'Activate') + '</button> ' +
        '<button class="btn danger small" type="button" data-delete="' + PR.esc(p.id) + '">Delete</button>' +
      '</td>' +
    '</tr>';
  }

  function bindFilters() {
    function apply() {
      var cat = (document.getElementById('categoryFilter') || {}).value || '';
      var status = (document.getElementById('statusFilter') || {}).value || '';
      var shown = 0;
      document.querySelectorAll('#productTable tbody tr').forEach(function (tr) {
        var ok = (!cat || tr.getAttribute('data-category') === cat) &&
                 (!status || tr.getAttribute('data-status') === status);
        tr.style.display = ok ? '' : 'none';
        if (ok) shown++;
      });
      var count = document.getElementById('productCount');
      if (count) count.textContent = shown + ' of ' + products.length + ' products';
    }
    ['categoryFilter', 'statusFilter'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', apply);
    });
  }

  /* ------------------------------------------------------------------ form */
  function specRowsFrom(specifications) {
    var rows = [];
    if (Array.isArray(specifications)) {
      specifications.forEach(function (entry) {
        if (entry && entry.label) rows.push({ label: entry.label, value: String(entry.value == null ? '' : entry.value) });
      });
    } else if (specifications && typeof specifications === 'object') {
      Object.keys(specifications).forEach(function (key) {
        if (key === 'text') return;
        rows.push({ label: key, value: String(specifications[key]) });
      });
      if (!rows.length && specifications.text) {
        rows.push({ label: 'Details', value: String(specifications.text) });
      }
    }
    return rows.length ? rows : [{ label: '', value: '' }];
  }

  function specRowHtml(row) {
    return '<div class="spec-row">' +
      '<input class="spec-label" placeholder="Specification (e.g. Capacity)" value="' + PR.esc(row.label) + '">' +
      '<input class="spec-value" placeholder="Value (e.g. 200 Ah)" value="' + PR.esc(row.value) + '">' +
      '<button type="button" class="spec-remove" aria-label="Remove specification">×</button>' +
    '</div>';
  }

  function openForm(product) {
    editing = product;
    existingImages = product
      ? (product.product_images || []).slice().sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); })
      : [];
    pendingFiles = [];
    pendingDatasheet = null;
    removeDatasheet = false;

    var p = product || {};
    var specs = specRowsFrom(p.specifications);
    var features = Array.isArray(p.features) ? p.features.join('\n') : '';

    var body = PRA.openDrawer(product ? 'Edit Product' : 'Add Product',
      '<form class="form" id="productForm" novalidate>' +
        '<div id="productFormMessage"></div>' +

        '<div class="form-grid">' +
          '<label>Product Name <span class="req">*</span>' +
            '<input id="pf_name" required maxlength="160" value="' + PR.esc(p.name || '') + '"></label>' +
          '<label>SKU <span class="req">*</span>' +
            '<input id="pf_sku" required maxlength="40" value="' + PR.esc(p.sku || '') + '"></label>' +
        '</div>' +

        '<label>URL Slug' +
          '<input id="pf_slug" maxlength="160" value="' + PR.esc(p.slug || '') + '" placeholder="auto-generated from the name">' +
          '<span class="hint">Used in the product URL: /product/?slug=… Changing it breaks existing links.</span></label>' +

        '<div class="form-grid">' +
          '<label>Category <span class="req">*</span><select id="pf_category" required>' +
            '<option value="">Select category…</option>' +
            topCategories().map(function (c) {
              return '<option value="' + PR.esc(c.id) + '"' +
                (p.category_id === c.id ? ' selected' : '') + '>' + PR.esc(c.name) + '</option>';
            }).join('') +
          '</select></label>' +
          '<label>Sub-category<select id="pf_subcategory">' +
            '<option value="">None</option></select></label>' +
        '</div>' +

        '<label>Short Description' +
          '<input id="pf_short" maxlength="220" value="' + PR.esc(p.short_description || '') + '">' +
          '<span class="hint">One line shown on product cards and search results.</span></label>' +

        '<label>Full Description<textarea id="pf_description" maxlength="4000">' +
          PR.esc(p.description || '') + '</textarea></label>' +

        '<div class="form-grid three">' +
          '<label>Price (₹) <span class="req">*</span>' +
            '<input id="pf_price" type="number" min="0" step="1" required value="' +
            PR.esc(p.price === null || p.price === undefined ? '' : p.price) + '"></label>' +
          '<label>MRP (₹)' +
            '<input id="pf_mrp" type="number" min="0" step="1" value="' +
            PR.esc(p.mrp === null || p.mrp === undefined ? '' : p.mrp) + '">' +
            '<span class="hint">Discount % is calculated automatically.</span></label>' +
          '<label>Stock Quantity <span class="req">*</span>' +
            '<input id="pf_stock" type="number" min="0" step="1" required value="' +
            PR.esc(p.stock === null || p.stock === undefined ? 0 : p.stock) + '"></label>' +
        '</div>' +

        '<div class="form-grid three">' +
          '<label>GST Rate (%)<select id="pf_gst_rate">' +
            [0, 5, 12, 18, 28].map(function (rate) {
              return '<option value="' + rate + '"' +
                (Number(p.gst_rate || 0) === rate ? ' selected' : '') + '>' + rate + '%</option>';
            }).join('') +
            '</select><span class="hint">0% means no GST line on the invoice.</span></label>' +
          '<label>HSN Code<input id="pf_hsn" maxlength="20" value="' + PR.esc(p.hsn_code || '') +
            '"><span class="hint">Required on a GST invoice.</span></label>' +
          '<label class="inline" style="align-self:end"><input id="pf_gst_incl" type="checkbox"' +
            (p.price_includes_gst === false ? '' : ' checked') + '> Price already includes GST</label>' +
        '</div>' +

        '<div class="form-grid">' +
          '<label>Availability<select id="pf_availability">' +
            ['in_stock', 'out_of_stock', 'preorder', 'discontinued'].map(function (value) {
              return '<option value="' + value + '"' +
                ((p.availability || 'in_stock') === value ? ' selected' : '') + '>' +
                value.replace(/_/g, ' ') + '</option>';
            }).join('') +
          '</select></label>' +
          '<label>Warranty<input id="pf_warranty" maxlength="160" value="' +
            PR.esc(p.warranty || '') + '" placeholder="e.g. 5 Years Warranty"></label>' +
        '</div>' +

        '<div>' +
          '<label style="margin-bottom:6px">Product Specifications</label>' +
          '<div class="spec-rows" id="specRows">' + specs.map(specRowHtml).join('') + '</div>' +
          '<button class="btn ghost small" type="button" id="addSpecBtn" style="margin-top:8px">+ Add specification</button>' +
        '</div>' +

        '<label>Features' +
          '<textarea id="pf_features" placeholder="One feature per line">' + PR.esc(features) + '</textarea>' +
          '<span class="hint">One per line. Shown as a bullet list on the product page.</span></label>' +

        '<div>' +
          '<label style="margin-bottom:6px">Product Images (1 to ' + MAX_IMAGES + ')</label>' +
          '<div class="image-grid" id="existingImages"></div>' +
          '<div class="drop" id="imageDrop" style="margin-top:10px">' +
            '<input id="pf_images" type="file" accept="image/*" multiple style="display:block;margin:0 auto">' +
            '<span class="hint">JPG, PNG or WebP · up to 5 MB each · uploaded to Supabase Storage on save.</span>' +
          '</div>' +
          '<div class="image-grid" id="pendingImages"></div>' +
        '</div>' +

        '<div>' +
          '<label style="margin-bottom:6px">Datasheet (PDF)</label>' +
          '<div id="datasheetCurrent"></div>' +
          '<div class="drop" style="margin-top:10px">' +
            '<input id="pf_datasheet" type="file" accept="application/pdf,.pdf" style="display:block;margin:0 auto">' +
            '<span class="hint">PDF only · up to ' + MAX_DATASHEET_MB + ' MB · customers can download it from the product page. ' +
              'Choosing a new file replaces the current one on save.</span>' +
          '</div>' +
        '</div>' +

        '<div class="form-grid three">' +
          '<label class="inline"><input id="pf_active" type="checkbox"' +
            (p.is_active === false ? '' : ' checked') + '> Active (visible on website)</label>' +
          '<label class="inline"><input id="pf_featured" type="checkbox"' +
            (p.is_featured ? ' checked' : '') + '> Featured on home page</label>' +
          '<label class="inline"><input id="pf_new" type="checkbox"' +
            (p.is_new ? ' checked' : '') + '> Show "New" badge</label>' +
        '</div>' +

        '<details><summary style="cursor:pointer;font-weight:800;font-size:12px">SEO (optional)</summary>' +
          '<div style="margin-top:12px;display:grid;gap:14px">' +
            '<label>Meta Title<input id="pf_meta_title" maxlength="160" value="' + PR.esc(p.meta_title || '') + '"></label>' +
            '<label>Meta Description<textarea id="pf_meta_description" maxlength="320">' +
              PR.esc(p.meta_description || '') + '</textarea></label>' +
            '<label>Sort Order<input id="pf_sort" type="number" step="1" value="' +
              PR.esc(p.sort_order === null || p.sort_order === undefined ? 0 : p.sort_order) + '"></label>' +
          '</div>' +
        '</details>' +

        '<div class="page-actions" style="justify-content:flex-end">' +
          '<button class="btn gray" type="button" id="cancelProductBtn">Cancel</button>' +
          '<button class="btn" type="submit" id="saveProductBtn">' +
            (product ? 'SAVE CHANGES' : 'CREATE PRODUCT') + '</button>' +
        '</div>' +
      '</form>');

    renderSubcategories(p.subcategory_id);
    renderExistingImages();
    renderDatasheet();
    bindForm(body);
  }

  function renderSubcategories(selected) {
    var parent = document.getElementById('pf_category').value;
    var select = document.getElementById('pf_subcategory');
    var subs = parent ? subsOf(parent) : [];
    select.innerHTML = '<option value="">None</option>' + subs.map(function (c) {
      return '<option value="' + PR.esc(c.id) + '"' +
        (selected === c.id ? ' selected' : '') + '>' + PR.esc(c.name) + '</option>';
    }).join('');
    select.disabled = !subs.length;
  }

  function renderExistingImages() {
    var host = document.getElementById('existingImages');
    if (!host) return;
    host.innerHTML = existingImages.map(function (img, index) {
      return '<div class="image-tile">' +
        '<img src="' + PR.esc(img.image_url) + '" alt="Product image ' + (index + 1) + '">' +
        '<button type="button" data-remove-image="' + index + '" aria-label="Delete image">×</button>' +
      '</div>';
    }).join('');
  }

  function renderDatasheet() {
    var host = document.getElementById('datasheetCurrent');
    if (!host) return;
    var current = editing && editing.datasheet_url && !removeDatasheet;
    if (pendingDatasheet) {
      host.innerHTML = '<div class="datasheet-row">📄 <b>' + PR.esc(pendingDatasheet.name) + '</b>' +
        '<span class="hint">(' + (pendingDatasheet.size / 1048576).toFixed(1) + ' MB · uploads on save' +
        (current ? ', replaces the current datasheet' : '') + ')</span>' +
        '<button class="btn gray small" type="button" data-datasheet="cancel">Cancel</button></div>';
    } else if (current) {
      host.innerHTML = '<div class="datasheet-row">📄 <a href="' + PR.esc(editing.datasheet_url) + '" target="_blank" rel="noopener">' +
        PR.esc(editing.datasheet_name || 'Datasheet.pdf') + '</a>' +
        '<button class="btn danger small" type="button" data-datasheet="remove">Remove</button></div>';
    } else {
      host.innerHTML = '<div class="hint">' +
        (removeDatasheet ? 'The datasheet will be removed when you save. ' +
          '<button class="btn gray small" type="button" data-datasheet="undo">Undo</button>'
          : 'No datasheet yet.') + '</div>';
    }
  }

  async function saveDatasheet(productId) {
    var previousPath = editing ? editing.datasheet_path : null;

    if (pendingDatasheet) {
      var file = pendingDatasheet;
      var safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').slice(-60);
      var path = productId + '/' + Date.now() + '-' + safe;
      var upload = await PR.sb.storage.from(DATASHEET_BUCKET).upload(path, file, {
        cacheControl: '3600', upsert: false, contentType: 'application/pdf'
      });
      if (upload.error) {
        console.error('[PowerRun] datasheet upload failed:', upload.error);
        throw new Error('Datasheet "' + file.name + '" could not be uploaded: ' + upload.error.message);
      }
      var url = PR.sb.storage.from(DATASHEET_BUCKET).getPublicUrl(path).data.publicUrl;
      await PR.call('save datasheet', function (sb) {
        return sb.from('products').update({
          datasheet_url: url, datasheet_path: path, datasheet_name: file.name
        }).eq('id', productId);
      });
    } else if (removeDatasheet && editing && editing.datasheet_url) {
      await PR.call('remove datasheet', function (sb) {
        return sb.from('products').update({
          datasheet_url: null, datasheet_path: null, datasheet_name: null
        }).eq('id', productId);
      });
    } else {
      return;
    }

    // the product row no longer points at the old file, so it can go
    if (previousPath) {
      var removal = await PR.sb.storage.from(DATASHEET_BUCKET).remove([previousPath]);
      if (removal.error) console.error('[PowerRun] old datasheet delete failed:', removal.error);
    }
  }

  function renderPendingImages() {
    var host = document.getElementById('pendingImages');
    if (!host) return;
    host.innerHTML = pendingFiles.map(function (file, index) {
      return '<div class="image-tile">' +
        '<img src="' + URL.createObjectURL(file) + '" alt="' + PR.esc(file.name) + '">' +
        '<button type="button" data-remove-pending="' + index + '" aria-label="Remove queued image">×</button>' +
      '</div>';
    }).join('');
  }

  function bindForm(body) {
    document.getElementById('pf_category').addEventListener('change', function () {
      renderSubcategories(null);
    });

    document.getElementById('cancelProductBtn').addEventListener('click', PRA.closeDrawer);

    document.getElementById('addSpecBtn').addEventListener('click', function () {
      document.getElementById('specRows')
        .insertAdjacentHTML('beforeend', specRowHtml({ label: '', value: '' }));
    });

    body.addEventListener('click', function (event) {
      var removeSpec = event.target.closest('.spec-remove');
      if (removeSpec) { removeSpec.closest('.spec-row').remove(); return; }

      var removeImage = event.target.closest('[data-remove-image]');
      if (removeImage) {
        var index = Number(removeImage.getAttribute('data-remove-image'));
        deleteImage(index);
        return;
      }

      var removePending = event.target.closest('[data-remove-pending]');
      if (removePending) {
        pendingFiles.splice(Number(removePending.getAttribute('data-remove-pending')), 1);
        renderPendingImages();
      }
    });

    document.getElementById('pf_datasheet').addEventListener('change', function (event) {
      var file = (event.target.files || [])[0];
      event.target.value = '';
      if (!file) return;
      if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
        PR.toast(file.name + ' is not a PDF file.', 'error');
        return;
      }
      if (file.size > MAX_DATASHEET_MB * 1024 * 1024) {
        PR.toast(file.name + ' is larger than ' + MAX_DATASHEET_MB + ' MB.', 'error');
        return;
      }
      pendingDatasheet = file;
      renderDatasheet();
    });

    document.getElementById('datasheetCurrent').addEventListener('click', function (event) {
      var action = event.target.getAttribute('data-datasheet');
      if (action === 'cancel') pendingDatasheet = null;
      if (action === 'remove') removeDatasheet = true;
      if (action === 'undo') removeDatasheet = false;
      if (action) renderDatasheet();
    });

    document.getElementById('pf_images').addEventListener('change', function (event) {
      var files = Array.from(event.target.files || []);
      var room = MAX_IMAGES - existingImages.length - pendingFiles.length;

      if (files.length > room) {
        PR.toast('You can add ' + Math.max(0, room) + ' more image' + (room === 1 ? '' : 's') +
                 ' (maximum ' + MAX_IMAGES + ' per product).', 'error');
        files = files.slice(0, Math.max(0, room));
      }
      var accepted = files.filter(function (file) {
        if (!/^image\//.test(file.type)) {
          PR.toast(file.name + ' is not an image file.', 'error');
          return false;
        }
        if (file.size > 5 * 1024 * 1024) {
          PR.toast(file.name + ' is larger than 5 MB.', 'error');
          return false;
        }
        return true;
      });
      pendingFiles = pendingFiles.concat(accepted);
      event.target.value = '';
      renderPendingImages();
    });

    document.getElementById('productForm').addEventListener('submit', save);
  }

  /* ---------------------------------------------------------------- images */
  async function deleteImage(index) {
    var image = existingImages[index];
    if (!image) return;
    if (!confirm('Delete this product image? This cannot be undone.')) return;

    try {
      if (image.id) {
        await PR.call('delete image record', function (sb) {
          return sb.from('product_images').delete().eq('id', image.id);
        });
      }
      if (image.storage_path) {
        var removal = await PR.sb.storage.from(BUCKET).remove([image.storage_path]);
        if (removal.error) console.error('[PowerRun] storage delete failed:', removal.error);
      }
      existingImages.splice(index, 1);
      renderExistingImages();
      PR.toast('Image deleted.', 'success');
    } catch (err) {
      PR.toast(err.message, 'error');
    }
  }

  async function uploadImages(productId, startIndex) {
    for (var i = 0; i < pendingFiles.length; i++) {
      var file = pendingFiles[i];
      var safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').slice(-60);
      var path = productId + '/' + Date.now() + '-' + i + '-' + safe;

      var upload = await PR.sb.storage.from(BUCKET).upload(path, file, {
        cacheControl: '31536000', upsert: false, contentType: file.type
      });
      if (upload.error) {
        console.error('[PowerRun] image upload failed:', upload.error);
        throw new Error('Image "' + file.name + '" could not be uploaded: ' + upload.error.message);
      }

      var publicUrl = PR.sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      await PR.call('save image record', function (sb) {
        return sb.from('product_images').insert({
          product_id: productId,
          image_url: publicUrl,
          storage_path: path,
          sort_order: startIndex + i
        });
      });
    }
  }

  /* ------------------------------------------------------------------ save */
  /* Saved as an ordered array so the sequence the admin sees is the sequence
     customers see. A jsonb object would lose that order. */
  function collectSpecs() {
    var specs = [];
    document.querySelectorAll('#specRows .spec-row').forEach(function (row) {
      var label = row.querySelector('.spec-label').value.trim();
      var value = row.querySelector('.spec-value').value.trim();
      if (label && value) specs.push({ label: label, value: value });
    });
    return specs;
  }

  async function save(event) {
    event.preventDefault();
    var form = event.target;
    var button = document.getElementById('saveProductBtn');
    var messageHost = document.getElementById('productFormMessage');
    messageHost.innerHTML = '';

    var values = PR.validateForm(form, [
      { el: 'pf_name', name: 'name', label: 'Product name', required: true },
      { el: 'pf_sku', name: 'sku', label: 'SKU', required: true },
      { el: 'pf_category', name: 'category_id', label: 'Category', required: true },
      { el: 'pf_price', name: 'price', label: 'Price', required: true },
      { el: 'pf_stock', name: 'stock', label: 'Stock quantity', required: true }
    ]);
    if (!values) return;

    var price = Number(values.price);
    var stock = Number(values.stock);
    var mrpRaw = document.getElementById('pf_mrp').value.trim();
    var mrp = mrpRaw === '' ? null : Number(mrpRaw);

    if (!Number.isFinite(price) || price <= 0) {
      PR.fieldError(document.getElementById('pf_price'), 'Enter a price greater than zero.');
      PR.toast('Enter a valid price.', 'error');
      return;
    }
    if (!Number.isFinite(stock) || stock < 0) {
      PR.fieldError(document.getElementById('pf_stock'), 'Stock cannot be negative.');
      PR.toast('Enter a valid stock quantity.', 'error');
      return;
    }
    if (mrp !== null && (!Number.isFinite(mrp) || mrp < price)) {
      PR.fieldError(document.getElementById('pf_mrp'), 'MRP must be at least the selling price.');
      PR.toast('MRP must be greater than or equal to the price.', 'error');
      return;
    }
    if (!editing && !pendingFiles.length) {
      PR.toast('Add at least one product image.', 'error');
      return;
    }

    var featuresText = document.getElementById('pf_features').value;
    var payload = {
      name: values.name,
      sku: values.sku,
      slug: PR.slugify(document.getElementById('pf_slug').value || values.name),
      category_id: values.category_id,
      subcategory_id: document.getElementById('pf_subcategory').value || null,
      short_description: document.getElementById('pf_short').value.trim() || null,
      description: document.getElementById('pf_description').value.trim() || null,
      price: price,
      mrp: mrp,
      compare_price: mrp,
      stock: stock,
      availability: document.getElementById('pf_availability').value,
      gst_rate: Number(document.getElementById('pf_gst_rate').value) || 0,
      hsn_code: document.getElementById('pf_hsn').value.trim() || null,
      price_includes_gst: document.getElementById('pf_gst_incl').checked,
      warranty: document.getElementById('pf_warranty').value.trim() || null,
      specifications: collectSpecs(),
      features: featuresText.split('\n').map(function (line) { return line.trim(); }).filter(Boolean),
      is_active: document.getElementById('pf_active').checked,
      is_featured: document.getElementById('pf_featured').checked,
      is_new: document.getElementById('pf_new').checked,
      meta_title: document.getElementById('pf_meta_title').value.trim() || null,
      meta_description: document.getElementById('pf_meta_description').value.trim() || null,
      sort_order: Number(document.getElementById('pf_sort').value) || 0
    };

    PR.setBusy(button, true, 'SAVING…');

    try {
      var productId;
      if (editing) {
        await PR.call('update product', function (sb) {
          return sb.from('products').update(payload).eq('id', editing.id);
        });
        productId = editing.id;
      } else {
        var created = await PR.call('create product', function (sb) {
          return sb.from('products').insert(payload).select('id').single();
        });
        productId = created.id;
      }

      if (pendingFiles.length) {
        PR.setBusy(button, true, 'UPLOADING IMAGES…');
        await uploadImages(productId, existingImages.length);
      }
      if (pendingDatasheet || removeDatasheet) {
        PR.setBusy(button, true, pendingDatasheet ? 'UPLOADING DATASHEET…' : 'SAVING…');
        await saveDatasheet(productId);
      }

      PRA.closeDrawer();
      PR.toast(editing ? 'Product updated.' : 'Product created.', 'success');
      await refresh();
    } catch (err) {
      PR.setBusy(button, false);
      messageHost.innerHTML = '<div class="form-message error" role="alert">' + PR.esc(err.message) + '</div>';
      PR.toast(err.message, 'error');
    }
  }

  /* ----------------------------------------------------------- row actions */
  async function toggleActive(id) {
    var product = products.find(function (p) { return String(p.id) === String(id); });
    if (!product) return;
    try {
      await PR.call('update product', function (sb) {
        return sb.from('products').update({ is_active: !product.is_active }).eq('id', id);
      });
      PR.toast('Product ' + (product.is_active ? 'deactivated' : 'activated') + '.', 'success');
      await refresh();
    } catch (err) {
      PR.toast(err.message, 'error');
    }
  }

  async function removeProduct(id) {
    var product = products.find(function (p) { return String(p.id) === String(id); });
    if (!product) return;
    if (!confirm('Delete "' + product.name + '" and all of its images?\n\nThis cannot be undone. ' +
                 'If the product has already been ordered, deactivate it instead.')) return;

    try {
      var paths = (product.product_images || [])
        .map(function (img) { return img.storage_path; }).filter(Boolean);

      await PR.call('delete product', function (sb) {
        return sb.from('products').delete().eq('id', id);
      });

      if (paths.length) {
        var removal = await PR.sb.storage.from(BUCKET).remove(paths);
        if (removal.error) console.error('[PowerRun] storage cleanup failed:', removal.error);
      }
      PR.toast('Product deleted.', 'success');
      await refresh();
    } catch (err) {
      PR.toast(err.message, 'error');
    }
  }

  var contentHost = null;
  async function refresh() {
    await loadAll();
    renderList(contentHost);
  }

  document.addEventListener('click', function (event) {
    var edit = event.target.closest('[data-edit]');
    if (edit) {
      var product = products.find(function (p) { return String(p.id) === String(edit.getAttribute('data-edit')); });
      if (product) openForm(product);
      return;
    }
    var toggle = event.target.closest('[data-toggle]');
    if (toggle) { toggleActive(toggle.getAttribute('data-toggle')); return; }
    var del = event.target.closest('[data-delete]');
    if (del) removeProduct(del.getAttribute('data-delete'));
  });

  PRA.boot('products', 'Products', async function (host) {
    contentHost = host;
    host.innerHTML = '<div class="panel">' + PRA.skeleton(8) + '</div>';
    await loadAll();
    renderList(host);
  });
})();
