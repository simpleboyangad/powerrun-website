/* Admin - printable manual Proforma Invoice.
 *
 *   /admin/proforma/print/?id=<proforma_invoices.id>
 *
 * Same document as the order invoices (assets/js/invoice-doc.js), fed through
 * PR.proformaOrder(); bank details are printed so the party can pay.
 */
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
      host.innerHTML = '<div class="invoice-sheet"><h2>No proforma invoice selected</h2></div>';
      return;
    }

    try {
      var settings = await PR.getSettings();
      var company = Object.assign({}, settings.company || {}, settings.company_private || {});
      var rows = await PR.call('load PI', function (sb) {
        return sb.from('proforma_invoices').select('*').eq('id', id).limit(1);
      });
      if (!rows || !rows.length) {
        host.innerHTML = '<div class="invoice-sheet"><h2>Proforma invoice not found</h2></div>';
        return;
      }
      var pi = rows[0];
      host.innerHTML = PR.invoiceHtml(PR.proformaOrder(pi), company, {
        type: 'proforma', bank: true, proformaNo: pi.pi_number, proformaDate: pi.pi_date,
        validUntil: pi.valid_until, paymentTerms: pi.payment_terms, notes: pi.notes
      });
      // the file name a browser suggests for "Save as PDF"
      document.title = pi.pi_number.replace(/\//g, '-') + ' ' + (pi.business_name || pi.customer_name);
    } catch (err) {
      host.innerHTML = '<div class="invoice-sheet"><h2>The proforma invoice could not be loaded</h2><p>' +
        PR.esc(err.message) + '</p></div>';
    }
  });
})();
