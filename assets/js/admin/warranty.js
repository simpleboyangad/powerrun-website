/* Admin - warranty registrations */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var STATUSES = ['pending', 'approved', 'rejected', 'expired'];

  function detail(row, update) {
    PRA.openDrawer('Warranty ' + (row.warranty_number || ''),
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
            'Invoice: ' + PR.esc(row.invoice_number || '-') + '<br>' +
            'Purchased: ' + PR.formatDate(row.purchase_date) + '<br>' +
            'Dealer: ' + PR.esc(row.dealer_name || '-') +
          '</p></div>' +
      '</div>' +
      '<div class="hint" style="margin-top:12px">Registered ' + PR.formatDateTime(row.created_at) + '</div>' +

      '<form class="form" id="warrantyForm" style="margin-top:18px;border-top:1px solid #eef0f3;padding-top:18px">' +
        '<label>Status<select id="wa_status">' +
          STATUSES.map(function (s) {
            return '<option value="' + s + '"' + (row.status === s ? ' selected' : '') + '>' + s + '</option>';
          }).join('') +
        '</select></label>' +
        '<label>Internal Notes<textarea id="wa_notes" maxlength="1000">' +
          PR.esc(row.notes || '') + '</textarea></label>' +
        '<div class="page-actions" style="justify-content:flex-end">' +
          '<a class="btn gray" href="' + PR.esc(PR.whatsapp(
              'Hello ' + (row.name || '') + ', this is PowerRun Industries regarding warranty registration ' +
              (row.warranty_number || '') + '.')) + '" target="_blank" rel="noopener">WhatsApp Customer</a>' +
          '<button class="btn" type="submit" id="saveWarrantyBtn">SAVE</button>' +
        '</div>' +
      '</form>');

    document.getElementById('warrantyForm').addEventListener('submit', function (event) {
      event.preventDefault();
      update(row, {
        status: document.getElementById('wa_status').value,
        notes: document.getElementById('wa_notes').value.trim() || null
      }, document.getElementById('saveWarrantyBtn'), 'recordMessage');
    });
  }

  PRA.recordPage({
    key: 'warranty',
    title: 'Warranty Registrations',
    table: 'warranties',
    statuses: STATUSES,
    statusField: 'status',
    searchPlaceholder: 'Search warranty ID, name, mobile or serial number…',
    emptyTitle: 'No warranty registrations yet',
    emptyMessage: 'Registrations submitted at powerrun.in/warranty/ appear here.',
    columns: [
      { head: 'Warranty ID', cell: function (r) { return '<b class="nowrap">' + PR.esc(r.warranty_number || '-') + '</b>'; } },
      { head: 'Customer', cell: function (r) { return PR.esc(r.name || '-') + '<small>' + PR.esc(r.mobile || '') + '</small>'; } },
      { head: 'Product', cell: function (r) { return PR.esc(r.product_name || '-'); } },
      { head: 'Serial', cell: function (r) { return PR.esc(r.serial_number || '-'); } },
      { head: 'Purchased', cell: function (r) { return '<span class="nowrap">' + PR.formatDate(r.purchase_date) + '</span>'; } },
      { head: 'Registered', cell: function (r) { return '<span class="nowrap">' + PR.formatDate(r.created_at) + '</span>'; } },
      { head: 'Status', cell: function (r) { return PRA.pill(r.status); } }
    ],
    detail: detail
  });
})();
