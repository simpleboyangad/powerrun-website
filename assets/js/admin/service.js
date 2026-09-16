/* Admin - service requests */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var STATUSES = ['open', 'in_progress', 'resolved', 'closed', 'cancelled'];
  var PRIORITIES = ['low', 'normal', 'high', 'urgent'];

  function detail(row, update) {
    PRA.openDrawer('Service Request ' + (row.ticket_number || ''),
      '<div id="recordMessage"></div>' +
      '<div class="form-grid">' +
        '<div><b style="font-size:12px;color:#6d6d6d">CUSTOMER</b>' +
          '<p style="margin:6px 0 0;line-height:1.8">' +
            '<b>' + PR.esc(row.name || '-') + '</b><br>' +
            '☎ <a href="tel:' + PR.esc(row.mobile) + '">' + PR.esc(row.mobile || '-') + '</a><br>' +
            (row.email ? '✉ <a href="mailto:' + PR.esc(row.email) + '">' + PR.esc(row.email) + '</a><br>' : '') +
            PR.esc([row.address, row.city, row.state, row.pincode].filter(Boolean).join(', ')) +
          '</p></div>' +
        '<div><b style="font-size:12px;color:#6d6d6d">PRODUCT</b>' +
          '<p style="margin:6px 0 0;line-height:1.8">' +
            '<b>' + PR.esc(row.product_name || '-') + '</b><br>' +
            'Serial: ' + PR.esc(row.serial_number || '-') + '<br>' +
            'Purchased: ' + PR.formatDate(row.purchase_date) + '<br>' +
            'Issue type: ' + PR.esc(row.issue_type || '-') +
          '</p></div>' +
      '</div>' +

      '<div style="margin-top:16px"><b style="font-size:12px;color:#6d6d6d">REPORTED ISSUE</b>' +
        '<p style="margin:6px 0 0;line-height:1.7;white-space:pre-wrap">' +
          PR.esc(row.issue_description || '-') + '</p></div>' +
      (row.attachment_url
        ? '<p style="margin-top:10px"><a class="btn ghost small" href="' + PR.esc(row.attachment_url) +
          '" target="_blank" rel="noopener">View attachment</a></p>'
        : '') +
      '<div class="hint" style="margin-top:12px">Raised ' + PR.formatDateTime(row.created_at) + '</div>' +

      '<form class="form" id="serviceForm" style="margin-top:18px;border-top:1px solid #eef0f3;padding-top:18px">' +
        '<div class="form-grid">' +
          '<label>Status<select id="sv_status">' +
            STATUSES.map(function (s) {
              return '<option value="' + s + '"' + (row.status === s ? ' selected' : '') + '>' +
                s.replace(/_/g, ' ') + '</option>';
            }).join('') +
          '</select></label>' +
          '<label>Priority<select id="sv_priority">' +
            PRIORITIES.map(function (s) {
              return '<option value="' + s + '"' + ((row.priority || 'normal') === s ? ' selected' : '') + '>' +
                s + '</option>';
            }).join('') +
          '</select></label>' +
        '</div>' +
        '<label>Resolution / Internal Notes<textarea id="sv_resolution" maxlength="2000">' +
          PR.esc(row.resolution_notes || '') + '</textarea></label>' +
        '<div class="page-actions" style="justify-content:flex-end">' +
          '<a class="btn gray" href="' + PR.esc(PR.whatsapp(
              'Hello ' + (row.name || '') + ', this is PowerRun Industries service team regarding request ' +
              (row.ticket_number || '') + '.')) + '" target="_blank" rel="noopener">WhatsApp Customer</a>' +
          '<button class="btn" type="submit" id="saveServiceBtn">SAVE</button>' +
        '</div>' +
      '</form>');

    document.getElementById('serviceForm').addEventListener('submit', function (event) {
      event.preventDefault();
      update(row, {
        status: document.getElementById('sv_status').value,
        priority: document.getElementById('sv_priority').value,
        resolution_notes: document.getElementById('sv_resolution').value.trim() || null
      }, document.getElementById('saveServiceBtn'), 'recordMessage');
    });
  }

  PRA.recordPage({
    key: 'service',
    title: 'Service Requests',
    table: 'service_tickets',
    statuses: STATUSES,
    statusField: 'status',
    searchPlaceholder: 'Search request ID, name, mobile, serial or issue…',
    emptyTitle: 'No service requests yet',
    emptyMessage: 'Requests submitted at powerrun.in/service/ appear here.',
    columns: [
      { head: 'Request ID', cell: function (r) { return '<b class="nowrap">' + PR.esc(r.ticket_number || '-') + '</b>'; } },
      { head: 'Customer', cell: function (r) { return PR.esc(r.name || '-') + '<small>' + PR.esc(r.mobile || '') + '</small>'; } },
      { head: 'Product', cell: function (r) { return PR.esc(r.product_name || '-') + '<small>' + PR.esc(r.serial_number || '') + '</small>'; } },
      { head: 'Issue', cell: function (r) {
          var text = String(r.issue_description || '');
          return PR.esc(r.issue_type || '-') +
                 '<small>' + PR.esc(text.slice(0, 70) + (text.length > 70 ? '…' : '')) + '</small>';
        } },
      { head: 'Raised', cell: function (r) { return '<span class="nowrap">' + PR.formatDate(r.created_at) + '</span>'; } },
      { head: 'Priority', cell: function (r) { return PR.esc(r.priority || 'normal'); } },
      { head: 'Status', cell: function (r) { return PRA.pill(r.status); } }
    ],
    detail: detail
  });
})();
