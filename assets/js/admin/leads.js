/* Admin - CRM leads */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var STATUSES = ['new', 'contacted', 'interested', 'quotation_sent', 'negotiation', 'converted', 'lost'];
  var SOURCES = ['website', 'whatsapp', 'indiamart', 'instagram', 'facebook', 'google', 'referral', 'phone', 'walk-in', 'other'];
  var PRIORITIES = ['low', 'medium', 'high'];

  var staffPromise = null;
  function loadStaff() {
    if (!staffPromise) {
      staffPromise = PR.call('load staff', function (sb) {
        return sb.from('admin_users').select('id,name').eq('is_active', true).order('name');
      }).catch(function () { return []; });
    }
    return staffPromise;
  }

  async function detail(row, update) {
    var staff = await loadStaff();
    var nextFollowUp = null;
    try {
      var rows = await PR.call('load next follow-up', function (sb) {
        return sb.from('follow_ups').select('id,due_at,title')
          .eq('lead_id', row.id).eq('status', 'pending')
          .order('due_at', { ascending: true }).limit(1);
      });
      nextFollowUp = rows && rows.length ? rows[0] : null;
    } catch (err) { /* non-fatal */ }

    var body = PRA.openDrawer('Lead — ' + (row.name || ''),
      '<div id="recordMessage"></div>' +
      '<div class="form-grid">' +
        '<div><b style="font-size:12px;color:#6d6d6d">CONTACT</b>' +
          '<p style="margin:6px 0 0;line-height:1.8">' +
            '<b>' + PR.esc(row.name || '-') + '</b><br>' +
            '☎ <a href="tel:' + PR.esc(row.mobile) + '">' + PR.esc(row.mobile || '-') + '</a><br>' +
            (row.email ? '✉ <a href="mailto:' + PR.esc(row.email) + '">' + PR.esc(row.email) + '</a><br>' : '') +
            PR.esc(row.city || '-') +
          '</p></div>' +
        '<div><b style="font-size:12px;color:#6d6d6d">REQUIREMENT</b>' +
          '<p style="margin:6px 0 0;line-height:1.8">' +
            'Source: ' + PR.esc(row.source) + '<br>' +
            (row.message ? PR.esc(row.message) : '<span class="hint">No message provided.</span>') +
          '</p></div>' +
      '</div>' +

      '<div style="margin-top:12px"><b style="font-size:12px;color:#6d6d6d">NEXT FOLLOW-UP</b>' +
        '<p style="margin:6px 0 0">' +
          (nextFollowUp
            ? PR.esc(nextFollowUp.title) + ' — ' + PR.formatDateTime(nextFollowUp.due_at)
            : '<span class="hint">None scheduled.</span>') +
          ' <a href="/admin/followups/?lead=' + PR.esc(row.id) + '">+ Add follow-up</a>' +
        '</p></div>' +

      '<div class="hint" style="margin-top:12px">Received ' + PR.formatDateTime(row.created_at) + '</div>' +

      '<form class="form" id="leadForm" style="margin-top:18px;border-top:1px solid #eef0f3;padding-top:18px">' +
        '<div class="form-grid">' +
          '<label>Status<select id="ld_status">' +
            STATUSES.map(function (s) {
              return '<option value="' + s + '"' + (row.status === s ? ' selected' : '') + '>' + s.replace(/_/g, ' ') + '</option>';
            }).join('') +
          '</select></label>' +
          '<label>Priority<select id="ld_priority">' +
            PRIORITIES.map(function (p) {
              return '<option value="' + p + '"' + (row.priority === p ? ' selected' : '') + '>' + p + '</option>';
            }).join('') +
          '</select></label>' +
        '</div>' +
        '<div class="form-grid">' +
          '<label>Estimated Value ₹<input id="ld_value" type="number" min="0" step="1" value="' +
            PR.esc(row.estimated_value == null ? '' : row.estimated_value) + '"></label>' +
          '<label>Assigned Staff<select id="ld_staff"><option value="">Unassigned</option>' +
            staff.map(function (s) {
              return '<option value="' + PR.esc(s.id) + '"' + (row.assigned_staff === s.id ? ' selected' : '') + '>' +
                PR.esc(s.name) + '</option>';
            }).join('') + '</select></label>' +
        '</div>' +
        '<div class="page-actions" style="justify-content:flex-end">' +
          '<a class="btn gray" href="' + PR.esc(PR.whatsapp(
              'Hello ' + (row.name || '') + ', this is PowerRun Industries regarding your enquiry.')) +
            '" target="_blank" rel="noopener">WhatsApp</a>' +
          (row.status !== 'converted'
            ? '<button class="btn gray" type="button" id="convertLeadBtn">Convert to Customer</button>'
            : '') +
          '<button class="btn" type="submit" id="saveLeadBtn">SAVE</button>' +
        '</div>' +
      '</form>');

    document.getElementById('leadForm').addEventListener('submit', function (event) {
      event.preventDefault();
      update(row, {
        status: document.getElementById('ld_status').value,
        priority: document.getElementById('ld_priority').value,
        estimated_value: document.getElementById('ld_value').value === '' ? null : Number(document.getElementById('ld_value').value),
        assigned_staff: document.getElementById('ld_staff').value || null
      }, document.getElementById('saveLeadBtn'), 'recordMessage');
    });

    var convertBtn = document.getElementById('convertLeadBtn');
    if (convertBtn) {
      convertBtn.addEventListener('click', async function () {
        PR.setBusy(convertBtn, true, 'CONVERTING…');
        try {
          var result = await PR.call('convert lead', function (sb) {
            return sb.rpc('convert_lead_to_customer', { p_lead_id: row.id });
          });
          PR.toast('Lead converted to customer.', 'success');
          window.location.href = '/admin/customer/?id=' + encodeURIComponent(result.customer_id);
        } catch (err) {
          PR.setBusy(convertBtn, false);
          PR.toast(err.message, 'error');
        }
      });
    }
    return body;
  }

  PRA.recordPage({
    key: 'leads',
    title: 'Leads',
    table: 'leads',
    statuses: STATUSES,
    statusField: 'status',
    searchPlaceholder: 'Search name, mobile, email or city…',
    emptyTitle: 'No leads yet',
    emptyMessage: 'Enquiries from the website and contact form appear here.',
    columns: [
      { head: 'Name', cell: function (r) { return PR.esc(r.name || '-') + '<small>' + PR.esc(r.mobile || '') + '</small>'; } },
      { head: 'Source', cell: function (r) { return PR.esc(r.source); } },
      { head: 'Priority', cell: function (r) { return PRA.pill(r.priority); } },
      { head: 'Est. Value', cell: function (r) { return r.estimated_value != null ? PR.money(r.estimated_value) : '-'; } },
      { head: 'Received', cell: function (r) { return '<span class="nowrap">' + PR.formatDate(r.created_at) + '</span>'; } },
      { head: 'Status', cell: function (r) { return PRA.pill(r.status); } }
    ],
    detail: detail
  });
})();
