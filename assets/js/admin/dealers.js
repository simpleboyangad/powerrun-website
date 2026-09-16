/* Admin - dealer enquiries */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var STATUSES = ['new', 'contacted', 'qualified', 'approved', 'rejected', 'closed'];

  function detail(row, update) {
    PRA.openDrawer('Dealer Enquiry ' + (row.enquiry_number || ''),
      '<div id="recordMessage"></div>' +
      '<div class="form-grid">' +
        '<div><b style="font-size:12px;color:#6d6d6d">CONTACT</b>' +
          '<p style="margin:6px 0 0;line-height:1.8">' +
            '<b>' + PR.esc(row.name || '-') + '</b><br>' +
            '☎ <a href="tel:' + PR.esc(row.mobile) + '">' + PR.esc(row.mobile || '-') + '</a><br>' +
            (row.email ? '✉ <a href="mailto:' + PR.esc(row.email) + '">' + PR.esc(row.email) + '</a>' : '') +
          '</p></div>' +
        '<div><b style="font-size:12px;color:#6d6d6d">BUSINESS</b>' +
          '<p style="margin:6px 0 0;line-height:1.8">' +
            '<b>' + PR.esc(row.company_name || '-') + '</b><br>' +
            'Type: ' + PR.esc(row.business_type || '-') + '<br>' +
            'Location: ' + PR.esc([row.city, row.state].filter(Boolean).join(', ') || '-') +
          '</p></div>' +
      '</div>' +

      '<div style="margin-top:16px"><b style="font-size:12px;color:#6d6d6d">REQUIREMENT</b>' +
        '<p style="margin:6px 0 0;line-height:1.7;white-space:pre-wrap">' +
          PR.esc(row.message || 'No message provided.') + '</p></div>' +
      '<div class="hint" style="margin-top:12px">Received ' + PR.formatDateTime(row.created_at) + '</div>' +

      '<form class="form" id="dealerForm" style="margin-top:18px;border-top:1px solid #eef0f3;padding-top:18px">' +
        '<label>Status<select id="dl_status">' +
          STATUSES.map(function (s) {
            return '<option value="' + s + '"' + (row.status === s ? ' selected' : '') + '>' + s + '</option>';
          }).join('') +
        '</select></label>' +
        '<label>Internal Notes<textarea id="dl_notes" maxlength="2000">' +
          PR.esc(row.notes || '') + '</textarea></label>' +
        '<div class="page-actions" style="justify-content:flex-end">' +
          '<a class="btn gray" href="' + PR.esc(PR.whatsapp(
              'Hello ' + (row.name || '') + ', this is PowerRun Industries regarding your dealership enquiry ' +
              (row.enquiry_number || '') + '.')) + '" target="_blank" rel="noopener">WhatsApp Contact</a>' +
          '<button class="btn" type="submit" id="saveDealerBtn">SAVE</button>' +
        '</div>' +
      '</form>');

    document.getElementById('dealerForm').addEventListener('submit', function (event) {
      event.preventDefault();
      update(row, {
        status: document.getElementById('dl_status').value,
        notes: document.getElementById('dl_notes').value.trim() || null
      }, document.getElementById('saveDealerBtn'), 'recordMessage');
    });
  }

  PRA.recordPage({
    key: 'dealers',
    title: 'Dealer Enquiries',
    table: 'dealer_enquiries',
    statuses: STATUSES,
    statusField: 'status',
    searchPlaceholder: 'Search enquiry ID, name, company, mobile or city…',
    emptyTitle: 'No dealer enquiries yet',
    emptyMessage: 'Applications submitted at powerrun.in/dealer/ appear here.',
    columns: [
      { head: 'Enquiry ID', cell: function (r) { return '<b class="nowrap">' + PR.esc(r.enquiry_number || '-') + '</b>'; } },
      { head: 'Contact', cell: function (r) { return PR.esc(r.name || '-') + '<small>' + PR.esc(r.mobile || '') + '</small>'; } },
      { head: 'Company', cell: function (r) { return PR.esc(r.company_name || '-'); } },
      { head: 'Business Type', cell: function (r) { return PR.esc(r.business_type || '-'); } },
      { head: 'Location', cell: function (r) { return PR.esc([r.city, r.state].filter(Boolean).join(', ') || '-'); } },
      { head: 'Received', cell: function (r) { return '<span class="nowrap">' + PR.formatDate(r.created_at) + '</span>'; } },
      { head: 'Status', cell: function (r) { return PRA.pill(r.status); } }
    ],
    detail: detail
  });
})();
