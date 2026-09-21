/* PowerRun Industries - admin shell: route guard, sidebar, shared UI.
 *
 * SECURITY NOTE
 * -------------
 * The redirect performed here is a convenience for the user interface only.
 * It is NOT what protects the data. Every admin table is protected by RLS
 * policies that call public.is_admin(), which checks the caller's auth.uid()
 * against the admin_users table inside the database. Editing this file, or
 * calling any of these functions from the console, gives no extra access:
 * the database refuses the query.
 */
(function () {
  'use strict';

  var PR = window.PR;
  var PRA = (window.PRA = window.PRA || {});

  var NAV = [
    { key: 'dashboard', href: '/admin/dashboard/', icon: '▦', label: 'Dashboard' },
    { key: 'products',  href: '/admin/products/',  icon: '📦', label: 'Products' },
    { key: 'categories', href: '/admin/categories/', icon: '🗂', label: 'Categories' },
    { key: 'orders',    href: '/admin/orders/',    icon: '🧾', label: 'Orders', badge: 'pending_orders' },
    { key: 'customers', href: '/admin/customers/', icon: '👥', label: 'Customers' },
    { key: 'warranty',  href: '/admin/warranty/',  icon: '🛡', label: 'Warranty', badge: 'warranty_pending' },
    { key: 'service',   href: '/admin/service/',   icon: '🔧', label: 'Service Requests', badge: 'service_open' },
    { key: 'dealers',   href: '/admin/dealers/',   icon: '🤝', label: 'Dealer Enquiries', badge: 'dealer_new' },
    { key: 'seo',        href: '/admin/seo/',        icon: '🔍', label: 'SEO Manager' },
    { key: 'calculator', href: '/admin/calculator/', icon: '📊', label: 'Profit & Loss Calculator' },
    { key: 'settings',   href: '/admin/settings/',   icon: '⚙', label: 'Settings' }
  ];

  PRA.session = null;
  PRA.admin = null;

  /* ------------------------------------------------------------------ guard */
  PRA.requireAdmin = async function () {
    if (!PR.sb) {
      document.body.innerHTML =
        '<div class="login-wrap"><div class="login-card">' +
        '<h1>Cannot reach the server</h1>' +
        '<p class="sub">The PowerRun admin panel could not connect to Supabase. ' +
        'Check your internet connection and reload.</p>' +
        '<button class="btn block" onclick="location.reload()">Reload</button></div></div>';
      throw new Error('no supabase client');
    }

    var sessionResult = await PR.sb.auth.getSession();
    var session = sessionResult && sessionResult.data ? sessionResult.data.session : null;
    if (!session) { PRA.toLogin(); throw new Error('not signed in'); }

    // Authorisation is decided by the database, not by this page.
    var isAdmin;
    try {
      isAdmin = await PR.call('verify admin access', function (sb) { return sb.rpc('is_admin'); });
    } catch (err) {
      console.error('[PowerRun] admin verification failed:', err);
      await PR.sb.auth.signOut();
      PRA.toLogin('error');
      throw err;
    }

    if (!isAdmin) {
      await PR.sb.auth.signOut();
      PRA.toLogin('denied');
      throw new Error('not an admin');
    }

    PRA.session = session;
    try {
      PRA.admin = await PR.call('load admin profile', function (sb) {
        return sb.from('admin_users').select('*').eq('user_id', session.user.id).maybeSingle();
      });
    } catch (err) {
      PRA.admin = null;
    }
    return session;
  };

  PRA.toLogin = function (reason) {
    var next = encodeURIComponent(window.location.pathname);
    var qs = '?next=' + next + (reason ? '&reason=' + reason : '');
    window.location.replace('/admin/login/' + qs);
  };

  PRA.logout = async function () {
    try { await PR.sb.auth.signOut(); } catch (err) { console.error('[PowerRun] sign out failed:', err); }
    window.location.replace('/admin/login/');
  };

  /* ------------------------------------------------------------------ shell */
  PRA.mountShell = function (activeKey, title) {
    var user = PRA.session && PRA.session.user;
    var name = (PRA.admin && PRA.admin.name) || (user && user.email) || 'Administrator';

    document.body.insertAdjacentHTML('afterbegin',
      '<div class="sidebar-backdrop" id="sidebarBackdrop"></div>' +
      '<div class="admin-shell">' +
        '<aside class="sidebar" id="adminSidebar">' +
          '<div class="brand">' +
            '<img src="/assets/powerrun-logo.png" alt="PowerRun Industries">' +
            '<b>PowerRun<small>ADMIN PANEL</small></b>' +
          '</div>' +
          NAV.map(function (item) {
            return '<a href="' + item.href + '"' + (item.key === activeKey ? ' class="active"' : '') + '>' +
              '<span class="ic" aria-hidden="true">' + item.icon + '</span>' + PR.esc(item.label) +
              (item.badge ? '<span class="badge-count" data-badge="' + item.badge + '" hidden></span>' : '') +
            '</a>';
          }).join('') +
          '<div class="spacer"></div>' +
          '<a href="/" target="_blank" rel="noopener"><span class="ic">↗</span>View Website</a>' +
          '<button type="button" class="logout" id="logoutBtn"><span class="ic">⏻</span>Logout</button>' +
        '</aside>' +
        '<div class="admin-main">' +
          '<div class="topbar">' +
            '<div style="display:flex;align-items:center;gap:12px">' +
              '<button class="menu-toggle" type="button" id="menuToggle" aria-label="Open menu">☰</button>' +
              '<h1>' + PR.esc(title) + '</h1>' +
            '</div>' +
            '<div class="who"><b>' + PR.esc(name) + '</b>' +
              PR.esc((PRA.admin && PRA.admin.role) || 'admin') + '</div>' +
          '</div>' +
          '<div class="content" id="adminContent"></div>' +
        '</div>' +
      '</div>');

    var sidebar = document.getElementById('adminSidebar');
    var backdrop = document.getElementById('sidebarBackdrop');
    function closeMenu() {
      sidebar.classList.remove('open');
      backdrop.classList.remove('show');
    }
    document.getElementById('menuToggle').addEventListener('click', function () {
      sidebar.classList.toggle('open');
      backdrop.classList.toggle('show');
    });
    backdrop.addEventListener('click', closeMenu);
    document.getElementById('logoutBtn').addEventListener('click', function () {
      if (confirm('Sign out of the PowerRun admin panel?')) PRA.logout();
    });

    PRA.loadBadges();
    return document.getElementById('adminContent');
  };

  PRA.loadBadges = async function () {
    try {
      var stats = await PR.call('load dashboard counts', function (sb) {
        return sb.rpc('admin_dashboard_stats');
      });
      PRA.stats = stats;
      document.querySelectorAll('[data-badge]').forEach(function (el) {
        var value = Number(stats[el.getAttribute('data-badge')]) || 0;
        el.textContent = String(value);
        el.hidden = value === 0;
      });
      document.dispatchEvent(new CustomEvent('pra:stats', { detail: stats }));
    } catch (err) {
      console.warn('[PowerRun] sidebar counts unavailable:', err.message);
    }
  };

  /* ----------------------------------------------------------------- drawer */
  var drawerTimer = null;

  PRA.openDrawer = function (title, bodyHtml) {
    var existing = document.getElementById('adminDrawer');
    if (existing) existing.remove();
    if (drawerTimer) { clearInterval(drawerTimer); drawerTimer = null; }

    document.body.insertAdjacentHTML('beforeend',
      '<div class="drawer-overlay show" id="adminDrawer">' +
        '<div class="drawer" role="dialog" aria-modal="true" aria-label="' + PR.esc(title) + '">' +
          '<div class="drawer-head"><h2>' + PR.esc(title) + '</h2>' +
            '<button class="drawer-close" type="button" aria-label="Close">×</button></div>' +
          '<div class="drawer-body">' + bodyHtml + '</div>' +
          '<div class="drawer-scroll" aria-hidden="true">' +
            '<button class="drawer-scroll-btn" type="button" data-scroll="up" title="Scroll up" aria-label="Scroll up">▲</button>' +
            '<button class="drawer-scroll-btn" type="button" data-scroll="down" title="Scroll down" aria-label="Scroll down">▼</button>' +
          '</div>' +
        '</div>' +
      '</div>');

    var overlay = document.getElementById('adminDrawer');
    var scroller = overlay.querySelector('.drawer-body');

    // Long forms (a product has photos, specs and a datasheet below the fold)
    // scroll inside the drawer; these buttons work when a mouse wheel or a
    // trackpad gesture does not.
    overlay.querySelector('.drawer-scroll').addEventListener('click', function (event) {
      var button = event.target.closest('[data-scroll]');
      if (!button) return;
      var step = Math.max(160, scroller.clientHeight * 0.8);
      var delta = button.getAttribute('data-scroll') === 'up' ? -step : step;
      var from = scroller.scrollTop;
      var target = Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight, from + delta));
      scroller.scrollBy({ top: delta, behavior: 'smooth' });
      // if the browser ignores smooth scrolling, jump instead
      setTimeout(function () {
        if (scroller.scrollTop === from && Math.abs(target - from) > 2) {
          scroller.scrollTop = target;
          syncScrollButtons();
        }
      }, 450);
    });
    function syncScrollButtons() {
      var atTop = scroller.scrollTop <= 2;
      var atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
      overlay.querySelector('[data-scroll="up"]').disabled = atTop;
      overlay.querySelector('[data-scroll="down"]').disabled = atEnd;
      overlay.querySelector('.drawer-scroll').hidden = atTop && atEnd;
    }
    scroller.addEventListener('scroll', syncScrollButtons, { passive: true });
    setTimeout(syncScrollButtons, 0);
    // the form grows and shrinks (spec rows, image tiles), so re-check now and then
    drawerTimer = setInterval(syncScrollButtons, 600);

    overlay.querySelector('.drawer-close').addEventListener('click', PRA.closeDrawer);
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) PRA.closeDrawer();
    });
    document.addEventListener('keydown', escClose);
    return overlay.querySelector('.drawer-body');
  };

  function escClose(event) { if (event.key === 'Escape') PRA.closeDrawer(); }

  PRA.closeDrawer = function () {
    var overlay = document.getElementById('adminDrawer');
    if (overlay) overlay.remove();
    if (drawerTimer) { clearInterval(drawerTimer); drawerTimer = null; }
    document.removeEventListener('keydown', escClose);
  };

  /* ------------------------------------------------------------------ utils */
  PRA.skeleton = function (rows) {
    var out = '';
    for (var i = 0; i < (rows || 6); i++) out += '<div class="skeleton-row"></div>';
    return out;
  };

  PRA.empty = function (title, message, actionHtml) {
    return '<div class="empty"><h3>' + PR.esc(title) + '</h3><p>' + PR.esc(message) + '</p>' +
           (actionHtml || '') + '</div>';
  };

  PRA.errorPanel = function (message) {
    return '<div class="empty"><h3>Something went wrong</h3><p>' + PR.esc(message) + '</p>' +
           '<button class="btn" type="button" onclick="location.reload()">Try again</button></div>';
  };

  PRA.pill = function (value) {
    return '<span class="pill ' + PR.esc(value || '') + '">' + PR.esc(value || '-') + '</span>';
  };

  /* Filters a rendered table by free text. */
  PRA.bindSearch = function (inputId, tableId, countId) {
    var input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('input', function () {
      var query = input.value.toLowerCase();
      var shown = 0;
      document.querySelectorAll('#' + tableId + ' tbody tr').forEach(function (row) {
        var match = row.textContent.toLowerCase().indexOf(query) !== -1;
        row.style.display = match ? '' : 'none';
        if (match) shown++;
      });
      var count = countId && document.getElementById(countId);
      if (count) count.textContent = shown + ' shown';
    });
  };

  /* ------------------------------------------------------------- list page
   * Shared implementation for the enquiry/support pages (warranty, service,
   * dealer enquiries, customers). Each page supplies its own columns, detail
   * layout and status vocabulary.
   *
   * config = {
   *   key, title, table, select, idField, statuses, statusField,
   *   columns: [{ head, cell(row) }],
   *   detail(row) -> html,
   *   searchPlaceholder, emptyTitle, emptyMessage, badgeKey
   * }
   */
  PRA.recordPage = function (config) {
    var rows = [];
    var host = null;
    var filterStatus = '';

    async function load() {
      rows = await PR.call('load ' + config.table, function (sb) {
        return sb.from(config.table).select(config.select || '*')
          .order(config.orderBy || 'created_at', { ascending: false });
      }) || [];
    }

    function render() {
      var visible = filterStatus && config.statusField
        ? rows.filter(function (r) { return r[config.statusField] === filterStatus; })
        : rows;

      host.innerHTML =
        '<div class="panel">' +
          '<div class="panel-head"><h2>' + PR.esc(config.title) + '</h2>' +
            '<span class="hint">' + rows.length + ' total</span></div>' +
          '<div class="toolbar">' +
            '<input type="search" id="recordSearch" placeholder="' +
              PR.esc(config.searchPlaceholder || 'Search…') + '" aria-label="Search">' +
            (config.statuses
              ? '<select id="recordStatusFilter"><option value="">All statuses</option>' +
                config.statuses.map(function (s) {
                  return '<option value="' + s + '"' + (filterStatus === s ? ' selected' : '') + '>' +
                    s.replace(/_/g, ' ') + '</option>';
                }).join('') + '</select>'
              : '') +
            '<span class="count" id="recordCount">' + visible.length + ' shown</span>' +
          '</div>' +
          (visible.length
            ? '<div class="table-scroll"><table class="grid" id="recordTable"><thead><tr>' +
                config.columns.map(function (c) { return '<th>' + PR.esc(c.head) + '</th>'; }).join('') +
                (config.detail ? '<th></th>' : '') +
              '</tr></thead><tbody>' +
              visible.map(function (row) {
                return '<tr>' + config.columns.map(function (c) { return '<td>' + c.cell(row) + '</td>'; }).join('') +
                  (config.detail
                    ? '<td class="nowrap"><button class="btn ghost small" type="button" data-record="' +
                      PR.esc(row[config.idField || 'id']) + '">Open</button></td>'
                    : '') +
                '</tr>';
              }).join('') +
              '</tbody></table></div>'
            : PRA.empty(config.emptyTitle || 'Nothing here yet', config.emptyMessage || '')) +
        '</div>';

      PRA.bindSearch('recordSearch', 'recordTable', 'recordCount');
      var statusFilter = document.getElementById('recordStatusFilter');
      if (statusFilter) {
        statusFilter.addEventListener('change', function () {
          filterStatus = statusFilter.value;
          render();
        });
      }
    }

    async function updateStatus(row, patch, button, messageHostId) {
      var messageHost = document.getElementById(messageHostId);
      if (messageHost) messageHost.innerHTML = '';
      PR.setBusy(button, true, 'SAVING…');
      try {
        await PR.call('update ' + config.table, function (sb) {
          return sb.from(config.table).update(patch).eq('id', row.id);
        });
        PRA.closeDrawer();
        PR.toast('Saved.', 'success');
        await load();
        render();
        PRA.loadBadges();
      } catch (err) {
        PR.setBusy(button, false);
        if (messageHost) {
          messageHost.innerHTML = '<div class="form-message error" role="alert">' + PR.esc(err.message) + '</div>';
        }
        PR.toast(err.message, 'error');
      }
    }

    PRA.updateRecord = updateStatus;

    document.addEventListener('click', function (event) {
      var open = event.target.closest('[data-record]');
      if (!open) return;
      var id = open.getAttribute('data-record');
      var row = rows.find(function (r) { return String(r[config.idField || 'id']) === String(id); });
      if (row && config.detail) config.detail(row, updateStatus);
    });

    PRA.boot(config.key, config.title, async function (contentHost) {
      host = contentHost;
      filterStatus = PR.param('status') || '';
      host.innerHTML = '<div class="panel">' + PRA.skeleton(7) + '</div>';
      await load();
      render();
    });
  };

  /* Standard page bootstrap: guard, shell, then the page's own render(). */
  PRA.boot = function (key, title, render) {
    document.addEventListener('DOMContentLoaded', async function () {
      try {
        await PRA.requireAdmin();
      } catch (err) {
        return;  // requireAdmin has already redirected
      }
      var host = PRA.mountShell(key, title);
      try {
        await render(host);
      } catch (err) {
        console.error('[PowerRun] ' + key + ' page failed:', err);
        host.innerHTML = PRA.errorPanel(err.message);
        PR.toast(err.message, 'error');
      }
    });
  };
})();
