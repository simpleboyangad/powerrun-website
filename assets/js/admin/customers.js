/* Admin - customers (see /admin/leads/ for enquiries, /admin/customer/ for a single profile) */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var customers = [];

  async function loadAll() {
    customers = await PR.call('load customers', function (sb) {
      return sb.from('customers').select('*').order('created_at', { ascending: false });
    }) || [];
  }

  function render(host) {
    host.innerHTML =
      '<div class="panel">' +
        '<div class="panel-head"><h2>Customers</h2>' +
          '<span class="hint">' + customers.length + ' total</span></div>' +
        '<div class="toolbar">' +
          '<input type="search" id="customerSearch" placeholder="Search name, mobile or email…" aria-label="Search customers">' +
          '<span class="count" id="customerCount">' + customers.length + ' shown</span>' +
        '</div>' +
        (customers.length
          ? '<div class="table-scroll"><table class="grid" id="customerTable"><thead><tr>' +
              '<th>Name</th><th>Mobile</th><th>Email</th><th>Orders</th><th>Total Spent</th>' +
              '<th>Account</th><th>Since</th><th></th>' +
            '</tr></thead><tbody>' +
            customers.map(function (c) {
              return '<tr>' +
                '<td><b>' + PR.esc(c.name || '-') + '</b></td>' +
                '<td class="nowrap">' + PR.esc(c.mobile || '-') + '</td>' +
                '<td>' + PR.esc(c.email || '-') + '</td>' +
                '<td>' + (c.total_orders || 0) + '</td>' +
                '<td class="nowrap">' + PR.money(c.total_spent || 0) + '</td>' +
                '<td>' + (c.user_id ? PRA.pill('active') : '<span class="hint">Guest</span>') + '</td>' +
                '<td class="nowrap">' + PR.formatDate(c.created_at) + '</td>' +
                '<td class="nowrap">' +
                  '<a class="btn ghost small" href="/admin/customer/?id=' + encodeURIComponent(c.id) + '">Profile</a> ' +
                  '<a class="btn ghost small" href="/admin/orders/?q=' + encodeURIComponent(c.mobile || '') + '">Orders</a> ' +
                  '<a class="btn gray small" href="' + PR.esc(PR.whatsapp(
                      'Hello ' + (c.name || '') + ', this is PowerRun Industries.')) +
                    '" target="_blank" rel="noopener">WhatsApp</a>' +
                '</td>' +
              '</tr>';
            }).join('') +
            '</tbody></table></div>'
          : PRA.empty('No customers yet',
              'A customer record is created automatically the first time someone places an order.')) +
      '</div>';

    PRA.bindSearch('customerSearch', 'customerTable', 'customerCount');
  }

  PRA.boot('customers', 'Customers', async function (host) {
    host.innerHTML = '<div class="panel">' + PRA.skeleton(7) + '</div>';
    await loadAll();
    render(host);
  });
})();
