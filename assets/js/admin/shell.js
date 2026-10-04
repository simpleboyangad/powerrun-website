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

    { key: 'crm-group', icon: '👥', label: 'CRM', children: [
      { key: 'crm',       href: '/admin/crm/',       icon: '📈', label: 'Overview' },
      { key: 'customers', href: '/admin/customers/', icon: '👥', label: 'Customers' },
      { key: 'quotations', href: '/admin/quotations/', icon: '📄', label: 'Quotations', badge: 'quotations_pending' },
      { key: 'leads',     href: '/admin/leads/',     icon: '🎯', label: 'Leads', badge: 'new_leads' },
      { key: 'followups', href: '/admin/followups/', icon: '⏰', label: 'Follow-ups', badge: 'followups_overdue' },
      { key: 'warranty',  href: '/admin/warranty/',  icon: '🛡', label: 'Warranty', badge: 'warranty_pending' },
      { key: 'service',   href: '/admin/service/',   icon: '🔧', label: 'Service Requests', badge: 'service_open' },
      { key: 'dealers',   href: '/admin/dealers/',   icon: '🤝', label: 'Dealer Enquiries', badge: 'dealer_new' }
    ] },

    { key: 'coupons',    href: '/admin/coupons/',    icon: '🎟', label: 'Coupons' },
    { key: 'reviews',    href: '/admin/reviews/',    icon: '⭐', label: 'Product Reviews', badge: 'reviews_pending' },
    { key: 'seo',        href: '/admin/seo/',        icon: '🔍', label: 'SEO Manager' },
    { key: 'calculator', href: '/admin/calculator/', icon: '📊', label: 'Profit & Loss Calculator' },
    { key: 'bom',        href: '/admin/bom/',        icon: '🔋', label: 'Battery BOM Calculator' },
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
            if (item.children) {
              return '<button type="button" class="nav-parent" data-toggle-group="' + item.key + '">' +
                  '<span class="ic" aria-hidden="true">' + item.icon + '</span>' + PR.esc(item.label) +
                  '<span class="nav-caret" aria-hidden="true">▸</span>' +
                '</button>' +
                '<div class="nav-children" id="navGroup-' + item.key + '" hidden>' +
                  item.children.map(function (c) {
                    return '<a href="' + c.href + '"' + (c.key === activeKey ? ' class="active"' : '') + '>' +
                      '<span class="ic" aria-hidden="true">' + c.icon + '</span>' + PR.esc(c.label) +
                      (c.badge ? '<span class="badge-count" data-badge="' + c.badge + '" hidden></span>' : '') +
                    '</a>';
                  }).join('') +
                '</div>';
            }
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
            '<div style="display:flex;align-items:center;gap:14px">' +
              '<div class="notify-wrap">' +
                '<button type="button" class="notify-bell" id="notifyBell" aria-label="Notifications">🔔' +
                  '<span class="notify-count" id="notifyCount" hidden>0</span></button>' +
                '<div class="notify-panel" id="notifyPanel" hidden></div>' +
              '</div>' +
              '<div class="who"><b>' + PR.esc(name) + '</b>' +
                PR.esc((PRA.admin && PRA.admin.role) || 'admin') + '</div>' +
            '</div>' +
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

    sidebar.querySelectorAll('[data-toggle-group]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var children = document.getElementById('navGroup-' + btn.getAttribute('data-toggle-group'));
        var nowOpen = children.hidden;
        children.hidden = !nowOpen;
        btn.classList.toggle('open', nowOpen);
        btn.querySelector('.nav-caret').textContent = nowOpen ? '▾' : '▸';
      });
    });

    PRA.loadBadges();
    PRA.startNotifier();
    return document.getElementById('adminContent');
  };

  /* --------------------------------------------------------- notifications */
  // Polls for records created since the last check and alerts the admin with
  // a popup, a short beep and (if allowed) a browser notification.
  var NOTIFY_SOURCES = [
    { table: 'orders', label: 'Naya order', select: 'id,order_number,customer_name,total_amount,created_at',
      text: function (r) { return r.order_number + ' · ' + r.customer_name + ' · ' + PR.money(r.total_amount); },
      link: function (r) { return '/admin/orders/?order=' + encodeURIComponent(r.id); } },
    { table: 'quotations', label: 'Nayi quote request', select: 'id,quote_number,customer_name,total_amount,created_at',
      filter: function (q) { return q.eq('created_by_name', 'Website enquiry'); },
      text: function (r) { return r.customer_name + ' · ' + PR.money(r.total_amount) + ' (approve karna hai)'; },
      link: function (r) { return '/admin/quotations/?id=' + encodeURIComponent(r.id); } },
    { table: 'leads', label: 'Nayi enquiry', select: 'id,name,mobile,created_at',
      filter: function (q) { return q.or('message.is.null,message.not.like.Quote requested*'); },
      text: function (r) { return r.name + ' · ' + (r.mobile || ''); },
      link: function () { return '/admin/leads/'; } },
    { table: 'service_tickets', label: 'Service request', select: 'id,ticket_number,name,created_at',
      text: function (r) { return (r.ticket_number || '') + ' · ' + r.name; },
      link: function () { return '/admin/service/'; } },
    { table: 'warranties', label: 'Warranty registration', select: 'id,warranty_number,name,created_at',
      text: function (r) { return (r.warranty_number || '') + ' · ' + r.name; },
      link: function () { return '/admin/warranty/'; } },
    { table: 'dealer_enquiries', label: 'Dealer enquiry', select: 'id,enquiry_number,name,created_at',
      text: function (r) { return (r.enquiry_number || '') + ' · ' + r.name; },
      link: function () { return '/admin/dealers/'; } }
  ];
  var SINCE_KEY = 'pra_notify_since';
  var LIST_KEY = 'pra_notify_list';
  var notifyTimer = null;
  var audioCtx = null;
  var baseTitle = '';

  function store(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* storage blocked */ } }
  function load(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }

  function notifyList() {
    try { return JSON.parse(load(LIST_KEY) || '[]'); } catch (e) { return []; }
  }

  function beep() {
    try {
      if (!audioCtx) return;
      [0, 0.18].forEach(function (offset) {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.18, audioCtx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + offset + 0.15);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + offset);
        osc.stop(audioCtx.currentTime + offset + 0.16);
      });
    } catch (e) { /* audio unavailable */ }
  }

  function renderNotifyUi() {
    var list = notifyList();
    var unseen = list.filter(function (n) { return !n.seen; }).length;
    var count = document.getElementById('notifyCount');
    if (count) { count.textContent = String(unseen); count.hidden = unseen === 0; }
    document.title = (unseen ? '(' + unseen + ') ' : '') + baseTitle;
    var panel = document.getElementById('notifyPanel');
    if (!panel) return;
    panel.innerHTML =
      '<div class="notify-head"><b>Notifications</b>' +
        ('Notification' in window && Notification.permission !== 'granted'
          ? '<button type="button" id="notifyEnable">Alerts on karein</button>' : '') +
      '</div>' +
      (list.length
        ? list.slice(0, 20).map(function (n) {
            return '<a class="notify-item' + (n.seen ? '' : ' unseen') + '" href="' + PR.esc(n.link) + '">' +
              '<b>' + PR.esc(n.label) + '</b><span>' + PR.esc(n.text) + '</span>' +
              '<small>' + PR.formatDateTime(n.at) + '</small></a>';
          }).join('') +
          '<button type="button" class="notify-clear" id="notifyClear">Sab clear karein</button>'
        : '<p class="notify-empty">Abhi koi naya alert nahi hai.</p>');
    var enable = document.getElementById('notifyEnable');
    if (enable) enable.addEventListener('click', function (e) {
      e.stopPropagation();
      Notification.requestPermission().then(renderNotifyUi);
    });
    var clear = document.getElementById('notifyClear');
    if (clear) clear.addEventListener('click', function (e) {
      e.stopPropagation();
      store(LIST_KEY, '[]');
      renderNotifyUi();
    });
  }

  function popup(n) {
    var el = document.createElement('a');
    el.className = 'notify-toast';
    el.href = n.link;
    el.innerHTML = '<b>🔔 ' + PR.esc(n.label) + '</b><span>' + PR.esc(n.text) + '</span>' +
      '<button type="button" aria-label="Close">×</button>';
    el.querySelector('button').addEventListener('click', function (e) { e.preventDefault(); el.remove(); });
    var stack = document.getElementById('notifyStack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'notifyStack';
      stack.className = 'notify-stack';
      document.body.appendChild(stack);
    }
    stack.appendChild(el);
    setTimeout(function () { el.remove(); }, 60000);
  }

  async function checkNew() {
    var since = load(SINCE_KEY);
    var now = new Date().toISOString();
    if (!since) { store(SINCE_KEY, now); return; }
    var fresh = [];
    var newest = since;
    await Promise.all(NOTIFY_SOURCES.map(async function (src) {
      try {
        var rows = await PR.call('check ' + src.table, function (sb) {
          var q = sb.from(src.table).select(src.select).gt('created_at', since).order('created_at').limit(10);
          return src.filter ? src.filter(q) : q;
        });
        (rows || []).forEach(function (r) {
          if (r.created_at > newest) newest = r.created_at;
          fresh.push({ key: src.table + ':' + r.id, label: src.label, text: src.text(r), link: src.link(r), at: r.created_at });
        });
      } catch (err) {
        console.warn('[PowerRun] notification check failed for ' + src.table + ':', err.message);
      }
    }));
    if (newest > since) store(SINCE_KEY, newest);
    if (!fresh.length) return;

    var list = notifyList();
    var known = {};
    list.forEach(function (n) { known[n.key] = true; });
    fresh = fresh.filter(function (n) { return !known[n.key]; })
      .sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    if (!fresh.length) return;
    store(LIST_KEY, JSON.stringify(fresh.concat(list).slice(0, 50)));

    fresh.forEach(function (n) {
      popup(n);
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          var bn = new Notification('PowerRun: ' + n.label, { body: n.text, tag: n.key });
          bn.onclick = function () { window.focus(); window.location.href = n.link; };
        } catch (e) { /* notification blocked */ }
      }
    });
    beep();
    renderNotifyUi();
    PRA.loadBadges();
  }

  PRA.startNotifier = function () {
    if (notifyTimer) return;
    baseTitle = document.title.replace(/^\(\d+\)\s*/, '');
    var bell = document.getElementById('notifyBell');
    var panel = document.getElementById('notifyPanel');
    if (bell && panel) {
      bell.addEventListener('click', function (e) {
        e.stopPropagation();
        panel.hidden = !panel.hidden;
        if (!panel.hidden) {
          var list = notifyList().map(function (n) { n.seen = true; return n; });
          store(LIST_KEY, JSON.stringify(list));
          renderNotifyUi();
        }
      });
      panel.addEventListener('click', function (e) { e.stopPropagation(); });
      document.addEventListener('click', function () { panel.hidden = true; });
    }
    // Browsers only allow sound after the admin has interacted with the page.
    document.addEventListener('click', function unlock() {
      try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ }
      document.removeEventListener('click', unlock);
    });
    window.addEventListener('storage', function (e) { if (e.key === LIST_KEY) renderNotifyUi(); });
    renderNotifyUi();
    checkNew();
    notifyTimer = setInterval(checkNew, 30000);
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

      // Deep-link support: /admin/<page>/?id=<row id> opens that row's detail
      // drawer directly, so other pages (follow-ups, customer profile, ...)
      // can link straight into a specific record.
      var deepId = PR.param('id');
      if (deepId && config.detail) {
        var match = rows.find(function (r) { return String(r[config.idField || 'id']) === String(deepId); });
        if (match) config.detail(match, updateStatus);
      }
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
