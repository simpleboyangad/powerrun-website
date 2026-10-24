/* Admin - Agent Report: the daily / weekly reports the AI agents write (sql/44).
 * The body is Markdown written by an agent, so it is escaped first and only a small,
 * safe subset is turned into HTML (headings, lists, quotes, bold, links to https / wa.me). */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var KINDS = { sales_support: '🧾 Sales + Support', seo: '🔍 SEO', instagram: '📸 Instagram', monthly: '📅 Mahine ki report', other: '🤖 Other' };
  var host = null;
  var list = [];

  function inline(text) {
    // text is already escaped
    return text
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, function (m, label, url) {
        var wa = /^https:\/\/wa\.me\//.test(url);
        return '<a ' + (wa ? 'class="btn small ar-wa" ' : '') + 'href="' + url + '" target="_blank" rel="noopener noreferrer">' +
          (wa ? '💬 ' : '') + label + '</a>';
      });
  }

  function markdown(md) {
    var out = [], inList = false, inQuote = false;
    var close = function () {
      if (inList) { out.push('</ul>'); inList = false; }
      if (inQuote) { out.push('</blockquote>'); inQuote = false; }
    };
    String(md || '').split(/\r?\n/).forEach(function (raw) {
      var line = PR.esc(raw);
      var m;
      if (!raw.trim()) { close(); return; }
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { close(); out.push('<h' + (m[1].length + 1) + '>' + inline(m[2]) + '</h' + (m[1].length + 1) + '>'); return; }
      if ((m = line.match(/^&gt;\s?(.*)$/))) {
        if (inList) { out.push('</ul>'); inList = false; }
        if (!inQuote) { out.push('<blockquote>'); inQuote = true; }
        var q = m[1].replace(/^#{1,4}\s+/, '');
        out.push(q ? '<p>' + inline(q) + '</p>' : '');
        return;
      }
      if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
        if (inQuote) { out.push('</blockquote>'); inQuote = false; }
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push('<li>' + inline(m[1]) + '</li>');
        return;
      }
      close();
      out.push('<p>' + inline(line) + '</p>');
    });
    close();
    return out.join('');
  }

  async function loadList() {
    list = await PR.call('load agent reports', function (sb) {
      return sb.from('agent_reports').select('id,report_date,kind,title,summary,updated_at').order('report_date', { ascending: false })
        .order('kind').limit(60);
    }) || [];
  }

  async function show(id) {
    var box = document.getElementById('arBody');
    box.innerHTML = PRA.skeleton(8);
    var rows = await PR.call('load report', function (sb) { return sb.from('agent_reports').select('*').eq('id', id).limit(1); });
    var r = rows && rows[0];
    if (!r) { box.innerHTML = PRA.empty('Report nahi mili', ''); return; }
    document.querySelectorAll('[data-report]').forEach(function (el) { el.classList.toggle('active', el.getAttribute('data-report') === id); });
    box.innerHTML = '<div class="panel ar-report">' +
      '<div class="hint">' + PR.esc(KINDS[r.kind] || r.kind) + ' · ' + PR.formatDate(r.report_date) +
        ' · updated ' + PR.formatDateTime(r.updated_at) + '</div>' +
      (r.summary ? '<div class="form-message success" style="margin:10px 0">' + PR.esc(r.summary) + '</div>' : '') +
      markdown(r.body_md) + '</div>';
    history.replaceState(null, '', '?id=' + encodeURIComponent(id));
  }

  function render() {
    host.innerHTML = list.length
      ? '<div class="ar-layout">' +
          '<div class="ar-list">' + list.map(function (r) {
            return '<button type="button" class="ar-item" data-report="' + PR.esc(r.id) + '">' +
              '<b>' + PR.esc(KINDS[r.kind] || r.kind) + '</b><span>' + PR.formatDate(r.report_date) + '</span>' +
              (r.summary ? '<small>' + PR.esc(r.summary) + '</small>' : '') + '</button>';
          }).join('') + '</div>' +
          '<div id="arBody"></div>' +
        '</div>'
      : PRA.empty('Abhi koi report nahi', 'AI agents roz subah (PC chalu ho to) yahan report daalenge.');
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-report]');
    if (t) { show(t.getAttribute('data-report')); if (window.innerWidth < 900) document.getElementById('arBody').scrollIntoView(); }
  });

  PRA.boot('agent-reports', 'Agent Report', async function (h) {
    host = h;
    host.innerHTML = PRA.skeleton(6);
    await loadList();
    render();
    var want = PR.param('id') || (list[0] && list[0].id);
    if (want) await show(want);
  });
})();
