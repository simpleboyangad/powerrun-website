/* Admin - CRM overview dashboard */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  function stat(label, value, cls, hint, href) {
    var inner = '<small>' + PR.esc(label) + '</small><strong>' + PR.esc(String(value)) + '</strong>' +
      (hint ? '<span class="hint">' + PR.esc(hint) + '</span>' : '');
    return href
      ? '<a class="stat ' + (cls || '') + '" href="' + href + '">' + inner + '</a>'
      : '<div class="stat ' + (cls || '') + '">' + inner + '</div>';
  }

  function renderStats(s) {
    return '' +
      '<div class="stat-group-title">Customers</div>' +
      '<div class="stats">' +
        stat('Total Customers', s.total_customers, 'accent', null, '/admin/customers/') +
        stat('New This Month', s.new_customers_month, 'good', null, '/admin/customers/') +
      '</div>' +

      '<div class="stat-group-title">Leads</div>' +
      '<div class="stats">' +
        stat('Total Leads', s.total_leads, '', null, '/admin/leads/') +
        stat('New This Month', s.new_leads_month, s.new_leads_month > 0 ? 'warn' : '', null, '/admin/leads/?status=new') +
      '</div>' +

      '<div class="stat-group-title">Follow-ups</div>' +
      '<div class="stats">' +
        stat("Today's Follow-ups", s.followups_today, s.followups_today > 0 ? 'warn' : '', null, '/admin/followups/') +
        stat('Overdue', s.followups_overdue, s.followups_overdue > 0 ? 'bad' : 'good', null, '/admin/followups/') +
      '</div>' +

      '<div class="stat-group-title">Service &amp; Warranty</div>' +
      '<div class="stats">' +
        stat('Open Service Requests', s.service_open, s.service_open > 0 ? 'warn' : '', null, '/admin/service/') +
        stat('Active Warranties', s.warranties_active, 'good', null, '/admin/warranty/') +
        stat('Expiring in 30 Days', s.warranties_expiring_30d, s.warranties_expiring_30d > 0 ? 'warn' : '', null, '/admin/warranty/') +
      '</div>';
  }

  PRA.boot('crm', 'CRM Overview', async function (host) {
    host.innerHTML = '<div class="panel">' + PRA.skeleton(4) + '</div>';
    var stats = await PR.call('load CRM dashboard stats', function (sb) {
      return sb.rpc('crm_dashboard_stats');
    });
    host.innerHTML = '<div class="panel">' + renderStats(stats) + '</div>';
  });
})();
