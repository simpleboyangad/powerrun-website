/* Admin - customers and website enquiries */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var customers = [];
  var leads = [];
  var contentHost = null;

  async function loadAll() {
    var results = await Promise.all([
      PR.call('load customers', function (sb) {
        return sb.from('customers').select('*').order('created_at', { ascending: false });
      }),
      PR.call('load enquiries', function (sb) {
        return sb.from('leads').select('*').order('created_at', { ascending: false }).limit(200);
      })
    ]);
    customers = results[0] || [];
    leads = results[1] || [];
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
      '</div>' +

      '<div class="panel">' +
        '<div class="panel-head"><h2>Website Enquiries</h2>' +
          '<span class="hint">' + leads.length + ' most recent</span></div>' +
        '<div class="toolbar">' +
          '<input type="search" id="leadSearch" placeholder="Search enquiries…" aria-label="Search enquiries">' +
          '<span class="count" id="leadCount">' + leads.length + ' shown</span>' +
        '</div>' +
        (leads.length
          ? '<div class="table-scroll"><table class="grid" id="leadTable"><thead><tr>' +
              '<th>Name</th><th>Mobile</th><th>Email</th><th>City</th><th>Message</th>' +
              '<th>Received</th><th>Status</th><th></th>' +
            '</tr></thead><tbody>' +
            leads.map(function (l) {
              var message = String(l.message || '');
              return '<tr>' +
                '<td><b>' + PR.esc(l.name || '-') + '</b></td>' +
                '<td class="nowrap">' + PR.esc(l.mobile || '-') + '</td>' +
                '<td>' + PR.esc(l.email || '-') + '</td>' +
                '<td>' + PR.esc(l.city || '-') + '</td>' +
                '<td>' + PR.esc(message.slice(0, 90) + (message.length > 90 ? '…' : '')) + '</td>' +
                '<td class="nowrap">' + PR.formatDate(l.created_at) + '</td>' +
                '<td>' + PRA.pill(l.status) + '</td>' +
                '<td class="nowrap"><select class="lead-status" data-lead="' + PR.esc(l.id) + '" ' +
                    'aria-label="Update enquiry status">' +
                  ['new', 'contacted', 'qualified', 'closed'].map(function (s) {
                    return '<option value="' + s + '"' + (l.status === s ? ' selected' : '') + '>' + s + '</option>';
                  }).join('') +
                '</select></td>' +
              '</tr>';
            }).join('') +
            '</tbody></table></div>'
          : PRA.empty('No enquiries yet', 'Messages sent from the contact page appear here.')) +
      '</div>';

    PRA.bindSearch('customerSearch', 'customerTable', 'customerCount');
    PRA.bindSearch('leadSearch', 'leadTable', 'leadCount');
  }

  document.addEventListener('change', async function (event) {
    var select = event.target.closest('.lead-status');
    if (!select) return;
    var id = select.getAttribute('data-lead');
    select.disabled = true;
    try {
      await PR.call('update enquiry', function (sb) {
        return sb.from('leads').update({ status: select.value }).eq('id', id);
      });
      PR.toast('Enquiry status updated.', 'success');
      await loadAll();
      render(contentHost);
    } catch (err) {
      select.disabled = false;
      PR.toast(err.message, 'error');
    }
  });

  PRA.boot('customers', 'Customers', async function (host) {
    contentHost = host;
    host.innerHTML = '<div class="panel">' + PRA.skeleton(7) + '</div>';
    await loadAll();
    render(host);
  });
})();
