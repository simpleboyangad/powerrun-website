/* Admin - printable GST credit note:  /admin/credit-notes/print/?id=<credit_notes.id> */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  document.addEventListener('DOMContentLoaded', async function () {
    var host = document.getElementById('invoiceContent');
    document.getElementById('printBtn').addEventListener('click', function () { window.print(); });

    try {
      await PRA.requireAdmin();
    } catch (err) {
      return; // requireAdmin already redirected to login
    }

    var id = PR.param('id');
    if (!id) {
      host.innerHTML = '<div class="invoice-sheet"><h2>No credit note selected</h2></div>';
      return;
    }
    try {
      var settings = await PR.getSettings();
      var company = Object.assign({}, settings.company || {}, settings.company_private || {});
      var rows = await PR.call('load credit note', function (sb) {
        return sb.from('credit_notes').select('*').eq('id', id).limit(1);
      });
      if (!rows || !rows.length) {
        host.innerHTML = '<div class="invoice-sheet"><h2>Credit note not found</h2></div>';
        return;
      }
      var cn = rows[0];
      var copySelect = document.getElementById('copySelect');
      var draw = function () { host.innerHTML = PR.creditNoteHtml(cn, company, { copy: copySelect.value }); };
      copySelect.hidden = false;
      copySelect.addEventListener('change', draw);
      draw();
      document.title = 'Credit Note ' + cn.cn_number + ' | PowerRun Admin';
    } catch (err) {
      host.innerHTML = '<div class="invoice-sheet"><h2>The credit note could not be loaded</h2><p>' +
        PR.esc(err.message) + '</p></div>';
    }
  });
})();
