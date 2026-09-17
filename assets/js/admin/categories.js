/* Admin - categories and sub-categories */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var categories = [];
  var counts = {};
  var contentHost = null;

  async function loadAll() {
    var results = await Promise.all([
      PR.call('load categories', function (sb) {
        return sb.from('categories').select('*').order('sort_order').order('name');
      }),
      PR.call('load product categories', function (sb) {
        return sb.from('products').select('id,category_id,subcategory_id');
      })
    ]);
    categories = results[0] || [];
    counts = {};
    (results[1] || []).forEach(function (p) {
      if (p.category_id) counts[p.category_id] = (counts[p.category_id] || 0) + 1;
      if (p.subcategory_id) counts[p.subcategory_id] = (counts[p.subcategory_id] || 0) + 1;
    });
  }

  function tops() { return categories.filter(function (c) { return !c.parent_id; }); }
  function subsOf(id) { return categories.filter(function (c) { return c.parent_id === id; }); }

  function render(host) {
    var list = tops();
    host.innerHTML =
      '<div class="panel">' +
        '<div class="panel-head"><h2>Categories</h2>' +
          '<div class="page-actions">' +
            '<button class="btn" type="button" data-new-category>+ Add Category</button>' +
          '</div>' +
        '</div>' +
        (list.length
          ? list.map(function (cat) {
              var subs = subsOf(cat.id);
              return '<div style="border:1px solid #eef0f3;border-radius:10px;padding:14px;margin-bottom:12px">' +
                '<div class="panel-head" style="margin-bottom:8px">' +
                  '<div><b style="font-size:15px">' + PR.esc(cat.name) + '</b> ' +
                    PRA.pill(cat.is_active ? 'active' : 'inactive') +
                    '<div class="hint">' + PR.esc(cat.description || 'No description') +
                    ' · /' + PR.esc(cat.slug) + ' · ' + (counts[cat.id] || 0) + ' products</div>' +
                  '</div>' +
                  '<div class="page-actions">' +
                    '<button class="btn ghost small" type="button" data-edit-category="' + PR.esc(cat.id) + '">Edit</button>' +
                    '<button class="btn gray small" type="button" data-new-sub="' + PR.esc(cat.id) + '">+ Sub-category</button>' +
                    '<button class="btn danger small" type="button" data-delete-category="' + PR.esc(cat.id) + '">Delete</button>' +
                  '</div>' +
                '</div>' +
                (subs.length
                  ? '<div class="table-scroll"><table class="grid"><thead><tr>' +
                      '<th>Sub-category</th><th>Slug</th><th>Products</th><th>Status</th><th></th>' +
                    '</tr></thead><tbody>' +
                    subs.map(function (sub) {
                      return '<tr><td><b>' + PR.esc(sub.name) + '</b>' +
                          (sub.description ? '<small>' + PR.esc(sub.description) + '</small>' : '') + '</td>' +
                        '<td class="nowrap">' + PR.esc(sub.slug) + '</td>' +
                        '<td>' + (counts[sub.id] || 0) + '</td>' +
                        '<td>' + PRA.pill(sub.is_active ? 'active' : 'inactive') + '</td>' +
                        '<td class="nowrap">' +
                          '<button class="btn ghost small" type="button" data-edit-category="' + PR.esc(sub.id) + '">Edit</button> ' +
                          '<button class="btn danger small" type="button" data-delete-category="' + PR.esc(sub.id) + '">Delete</button>' +
                        '</td></tr>';
                    }).join('') +
                    '</tbody></table></div>'
                  : '<p class="hint" style="margin:0">No sub-categories yet.</p>') +
              '</div>';
            }).join('')
          : PRA.empty('No categories yet', 'Add a category so products can be organised on the website.')) +
      '</div>';
  }

  function openForm(category, parentId) {
    var c = category || {};
    var isSub = !!(parentId || c.parent_id);
    var parent = categories.find(function (x) { return x.id === (parentId || c.parent_id); });

    var body = PRA.openDrawer(
      (category ? 'Edit ' : 'Add ') + (isSub ? 'Sub-category' : 'Category') +
        (isSub && parent ? ' — ' + parent.name : ''),
      '<form class="form" id="categoryForm" novalidate>' +
        '<div id="categoryFormMessage"></div>' +
        '<label>Name <span class="req">*</span>' +
          '<input id="cf_name" required maxlength="120" value="' + PR.esc(c.name || '') + '"></label>' +
        '<label>Slug' +
          '<input id="cf_slug" maxlength="120" value="' + PR.esc(c.slug || '') + '" placeholder="auto-generated from the name">' +
          '<span class="hint">Used in /products/?category=… URLs.</span></label>' +
        '<label>Description<textarea id="cf_description" maxlength="400">' +
          PR.esc(c.description || '') + '</textarea></label>' +
        '<div class="form-grid">' +
          '<label>Sort Order<input id="cf_sort" type="number" step="1" value="' +
            PR.esc(c.sort_order === null || c.sort_order === undefined ? 0 : c.sort_order) + '"></label>' +
          '<label class="inline" style="align-self:end"><input id="cf_active" type="checkbox"' +
            (c.is_active === false ? '' : ' checked') + '> Active</label>' +
        '</div>' +

        '<details open><summary style="cursor:pointer;font-weight:800;font-size:12px">SEO</summary>' +
          '<div style="margin-top:12px;display:grid;gap:14px">' +
            '<label>Category SEO Title' +
              '<input id="cf_meta_title" maxlength="160" value="' + PR.esc(c.meta_title || '') + '" ' +
                'data-counter="50,60" placeholder="' + PR.esc((c.name || 'Category') + ' | PowerRun Industries') + '">' +
              catCounter((c.meta_title || '').length, 50, 60) + '</label>' +
            '<label>Meta Description' +
              '<textarea id="cf_meta_description" maxlength="320" rows="3" data-counter="140,160">' +
                PR.esc(c.meta_description || '') + '</textarea>' +
              catCounter((c.meta_description || '').length, 140, 160) + '</label>' +
            '<div class="seo-preview" id="categorySeoPreview">' +
              '<div class="seo-preview-head">Google search preview</div>' +
              '<div class="seo-preview-url" data-role="url"></div>' +
              '<div class="seo-preview-title" data-role="title"></div>' +
              '<div class="seo-preview-desc" data-role="desc"></div>' +
            '</div>' +
            '<div class="form-grid">' +
              '<label>Focus Keyword<input id="cf_focus_kw" maxlength="120" value="' +
                PR.esc(c.focus_keyword || '') + '"></label>' +
              '<label>OG Image URL<input id="cf_og_image" maxlength="400" value="' +
                PR.esc(c.og_image || '') + '"></label>' +
            '</div>' +
            '<label>Canonical URL<input id="cf_canonical" maxlength="300" value="' + PR.esc(c.canonical_url || '') +
              '" placeholder="' + PR.esc(PR.config.SITE_URL + '/products/?category=' + (c.slug || '')) + '">' +
              '<span class="hint">Leave empty to use the category listing URL.</span></label>' +
            '<div class="form-grid">' +
              '<label class="inline"><input id="cf_seo_index" type="checkbox"' +
                (c.seo_index === false ? '' : ' checked') + '> Index (allow in search results)</label>' +
              '<label class="inline"><input id="cf_seo_follow" type="checkbox"' +
                (c.seo_follow === false ? '' : ' checked') + '> Follow links</label>' +
            '</div>' +
          '</div>' +
        '</details>' +
        '<div class="page-actions" style="justify-content:flex-end">' +
          '<button class="btn gray" type="button" id="cancelCategoryBtn">Cancel</button>' +
          '<button class="btn" type="submit" id="saveCategoryBtn">SAVE</button>' +
        '</div>' +
      '</form>');

    bindCategorySeo();
    document.getElementById('cancelCategoryBtn').addEventListener('click', PRA.closeDrawer);
    document.getElementById('categoryForm').addEventListener('submit', function (event) {
      save(event, category, parentId || c.parent_id || null);
    });
    return body;
  }

  function catCounter(len, min, max) {
    var cls = len === 0 ? '' : (len < min ? ' warn' : (len > max ? ' over' : ' good'));
    return '<span class="seo-counter' + cls + '">Characters: <b>' + len + '</b> / ' + max +
           ' \u00b7 Recommended: ' + min + '\u2013' + max + '</span>';
  }

  /* Live counters and Google preview inside the category drawer. */
  function bindCategorySeo() {
    document.querySelectorAll('#categoryForm [data-counter]').forEach(function (el) {
      var bounds = el.getAttribute('data-counter').split(',');
      el.addEventListener('input', function () {
        var out = el.parentElement.querySelector('.seo-counter');
        if (out) out.outerHTML = catCounter(el.value.length, Number(bounds[0]), Number(bounds[1]));
      });
    });
    var box = document.getElementById('categorySeoPreview');
    if (!box) return;
    function paint() {
      var name = (document.getElementById('cf_name') || {}).value || '';
      var slug = (document.getElementById('cf_slug') || {}).value || (name ? PR.slugify(name) : '');
      box.querySelector('[data-role="title"]').textContent =
        ((document.getElementById('cf_meta_title') || {}).value || (name ? name + ' | ' + PR.config.COMPANY : '')).slice(0, 70);
      box.querySelector('[data-role="desc"]').textContent =
        ((document.getElementById('cf_meta_description') || {}).value ||
         (document.getElementById('cf_description') || {}).value || '').slice(0, 200);
      box.querySelector('[data-role="url"]').textContent =
        (document.getElementById('cf_canonical') || {}).value ||
        (PR.config.SITE_URL + '/products/?category=' + slug);
    }
    ['cf_name', 'cf_slug', 'cf_description', 'cf_meta_title', 'cf_meta_description', 'cf_canonical']
      .forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('input', paint);
      });
    paint();
  }

  async function save(event, category, parentId) {
    event.preventDefault();
    var form = event.target;
    var button = document.getElementById('saveCategoryBtn');
    var messageHost = document.getElementById('categoryFormMessage');
    messageHost.innerHTML = '';

    var values = PR.validateForm(form, [
      { el: 'cf_name', name: 'name', label: 'Name', required: true }
    ]);
    if (!values) return;

    var payload = {
      name: values.name,
      slug: PR.slugify(document.getElementById('cf_slug').value || values.name),
      description: document.getElementById('cf_description').value.trim() || null,
      meta_title: document.getElementById('cf_meta_title').value.trim() || null,
      meta_description: document.getElementById('cf_meta_description').value.trim() || null,
      focus_keyword: document.getElementById('cf_focus_kw').value.trim() || null,
      og_image: document.getElementById('cf_og_image').value.trim() || null,
      canonical_url: document.getElementById('cf_canonical').value.trim() || null,
      seo_index: document.getElementById('cf_seo_index').checked,
      seo_follow: document.getElementById('cf_seo_follow').checked,
      sort_order: Number(document.getElementById('cf_sort').value) || 0,
      is_active: document.getElementById('cf_active').checked,
      parent_id: parentId || null
    };

    PR.setBusy(button, true, 'SAVING…');
    try {
      if (category) {
        await PR.call('update category', function (sb) {
          return sb.from('categories').update(payload).eq('id', category.id);
        });
      } else {
        await PR.call('create category', function (sb) {
          return sb.from('categories').insert(payload);
        });
      }
      PRA.closeDrawer();
      PR.toast('Category saved.', 'success');
      await refresh();
    } catch (err) {
      PR.setBusy(button, false);
      messageHost.innerHTML = '<div class="form-message error" role="alert">' + PR.esc(err.message) + '</div>';
      PR.toast(err.message, 'error');
    }
  }

  async function remove(id) {
    var category = categories.find(function (c) { return c.id === id; });
    if (!category) return;
    var used = counts[id] || 0;
    var subs = subsOf(id).length;

    if (used > 0) {
      alert('"' + category.name + '" still has ' + used + ' product' + (used === 1 ? '' : 's') +
            ' assigned to it.\n\nMove those products to another category first, or deactivate this one instead.');
      return;
    }
    if (!confirm('Delete "' + category.name + '"?' +
        (subs ? '\n\nIts ' + subs + ' sub-categories will be deleted too.' : '') +
        '\n\nThis cannot be undone.')) return;

    try {
      await PR.call('delete category', function (sb) {
        return sb.from('categories').delete().eq('id', id);
      });
      PR.toast('Category deleted.', 'success');
      await refresh();
    } catch (err) {
      PR.toast(err.message, 'error');
    }
  }

  async function refresh() {
    await loadAll();
    render(contentHost);
  }

  document.addEventListener('click', function (event) {
    if (event.target.closest('[data-new-category]')) { openForm(null, null); return; }

    var newSub = event.target.closest('[data-new-sub]');
    if (newSub) { openForm(null, newSub.getAttribute('data-new-sub')); return; }

    var edit = event.target.closest('[data-edit-category]');
    if (edit) {
      var category = categories.find(function (c) { return c.id === edit.getAttribute('data-edit-category'); });
      if (category) openForm(category, category.parent_id);
      return;
    }
    var del = event.target.closest('[data-delete-category]');
    if (del) remove(del.getAttribute('data-delete-category'));
  });

  PRA.boot('categories', 'Categories', async function (host) {
    contentHost = host;
    host.innerHTML = '<div class="panel">' + PRA.skeleton(6) + '</div>';
    await loadAll();
    render(host);
  });
})();
