/* Admin - CRM follow-ups */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var rows = [];
  var host = null;

  async function load() {
    rows = await PR.call('load follow-ups', function (sb) {
      return sb.from('follow_ups')
        .select('*, leads(name,mobile), customers(name,mobile)')
        .eq('status', 'pending')
        .order('due_at', { ascending: true });
    }) || [];
  }

  function targetName(r) {
    var t = r.leads || r.customers;
    return t ? PR.esc(t.name) + '<small>' + PR.esc(t.mobile || '') + '</small>' : '-';
  }

  function targetLink(r) {
    return r.lead_id
      ? '/admin/leads/?id=' + encodeURIComponent(r.lead_id)
      : '/admin/customer/?id=' + encodeURIComponent(r.customer_id);
  }

  function row(r) {
    return '<tr>' +
      '<td>' + targetName(r) + '</td>' +
      '<td><b>' + PR.esc(r.title) + '</b>' + (r.notes ? '<small>' + PR.esc(r.notes) + '</small>' : '') + '</td>' +
      '<td class="nowrap">' + PR.formatDateTime(r.due_at) + '</td>' +
      '<td class="nowrap">' +
        '<a class="btn ghost small" href="' + targetLink(r) + '">Open</a> ' +
        '<button class="btn gray small" type="button" data-done="' + PR.esc(r.id) + '">Mark Done</button>' +
      '</td>' +
    '</tr>';
  }

  function section(title, list) {
    return '<div class="panel" style="margin-bottom:16px">' +
      '<div class="panel-head"><h2>' + PR.esc(title) + '</h2><span class="hint">' + list.length + '</span></div>' +
      (list.length
        ? '<div class="table-scroll"><table class="grid"><thead><tr>' +
            '<th>Who</th><th>Follow-up</th><th>Due</th><th></th>' +
          '</tr></thead><tbody>' + list.map(row).join('') + '</tbody></table></div>'
        : PRA.empty('Nothing here', '')) +
    '</div>';
  }

  function render() {
    var now = new Date();
    var todayStr = now.toISOString().slice(0, 10);
    var overdue = [], today = [], upcoming = [];
    rows.forEach(function (r) {
      var due = new Date(r.due_at);
      if (due < now) overdue.push(r);
      else if (r.due_at.slice(0, 10) === todayStr) today.push(r);
      else upcoming.push(r);
    });

    var leadParam = PR.param('lead');
    var customerParam = PR.param('customer');

    host.innerHTML =
      '<div class="panel" style="margin-bottom:16px">' +
        '<div class="panel-head"><h2>New Follow-up</h2></div>' +
        '<form class="form" id="newFollowUpForm">' +
          '<div id="newFollowUpMessage"></div>' +
          '<div class="form-grid">' +
            '<label>Title <span class="req">*</span><input id="fu_title" required maxlength="160" placeholder="e.g. Call to confirm quotation"></label>' +
            '<label>Due <span class="req">*</span><input id="fu_due" type="datetime-local" required></label>' +
          '</div>' +
          '<label>Notes<textarea id="fu_notes" maxlength="500"></textarea></label>' +
          (leadParam ? '<input type="hidden" id="fu_lead" value="' + PR.esc(leadParam) + '">' +
            '<p class="hint">Against lead ' + PR.esc(leadParam) + '</p>' : '') +
          (customerParam ? '<input type="hidden" id="fu_customer" value="' + PR.esc(customerParam) + '">' +
            '<p class="hint">Against customer ' + PR.esc(customerParam) + '</p>' : '') +
          (!leadParam && !customerParam
            ? '<p class="hint">Open this page from a Lead or Customer Profile to attach the follow-up automatically.</p>' : '') +
          '<div class="page-actions" style="justify-content:flex-end">' +
            '<button class="btn" type="submit" id="saveFollowUpBtn"' + (!leadParam && !customerParam ? ' disabled' : '') + '>SAVE</button>' +
          '</div>' +
        '</form>' +
      '</div>' +
      section('Overdue', overdue) +
      section("Today's Follow-ups", today) +
      section('Upcoming', upcoming);

    document.getElementById('newFollowUpForm').addEventListener('submit', async function (event) {
      event.preventDefault();
      var messageHost = document.getElementById('newFollowUpMessage');
      messageHost.innerHTML = '';
      var title = document.getElementById('fu_title').value.trim();
      var due = document.getElementById('fu_due').value;
      if (!title || !due) { PR.toast('Title and due date/time are required.', 'error'); return; }

      var leadEl = document.getElementById('fu_lead');
      var customerEl = document.getElementById('fu_customer');
      var button = document.getElementById('saveFollowUpBtn');
      PR.setBusy(button, true, 'SAVING…');
      try {
        await PR.call('create follow-up', function (sb) {
          return sb.from('follow_ups').insert({
            title: title,
            notes: document.getElementById('fu_notes').value.trim() || null,
            due_at: new Date(due).toISOString(),
            lead_id: leadEl ? leadEl.value : null,
            customer_id: customerEl ? customerEl.value : null
          });
        });
        PR.toast('Follow-up scheduled.', 'success');
        await load();
        render();
      } catch (err) {
        PR.setBusy(button, false);
        messageHost.innerHTML = '<div class="form-message error" role="alert">' + PR.esc(err.message) + '</div>';
        PR.toast(err.message, 'error');
      }
    });
  }

  document.addEventListener('click', async function (event) {
    var done = event.target.closest('[data-done]');
    if (!done) return;
    try {
      await PR.call('complete follow-up', function (sb) {
        return sb.from('follow_ups').update({ status: 'done', completed_at: new Date().toISOString() })
          .eq('id', done.getAttribute('data-done'));
      });
      PR.toast('Marked done.', 'success');
      await load();
      render();
      PRA.loadBadges();
    } catch (err) {
      PR.toast(err.message, 'error');
    }
  });

  PRA.boot('followups', 'Follow-ups', async function (contentHost) {
    host = contentHost;
    host.innerHTML = '<div class="panel">' + PRA.skeleton(6) + '</div>';
    await load();
    render();
  });
})();
