/* Admin - printable manual Proforma Invoice, and the Tax Invoice made from it.
 *
 *   /admin/proforma/print/?id=<proforma_invoices.id>              proforma, or the
 *                                                                 tax invoice once issued
 *   /admin/proforma/print/?id=<proforma_invoices.id>&tax=preview  what the tax invoice
 *                                                                 will look like, with
 *                                                                 the number it will get
 *                                                                 and a Confirm button
 *
 * Same document as the order invoices (assets/js/invoice-doc.js), fed through
 * PR.proformaOrder(). Tax invoice numbers come from issue_pi_tax_invoice()
 * (sql/34) in the same series as website orders; an issued invoice is frozen.
 */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  function toolbarButton(html) {
    var bar = document.querySelector('.invoice-toolbar');
    bar.insertAdjacentHTML('beforeend', html);
  }

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
      var order = PR.proformaOrder(pi);
      var baseOpts = {
        bank: true, proformaNo: pi.pi_number, proformaDate: pi.pi_date,
        validUntil: pi.valid_until, paymentTerms: pi.payment_terms, notes: pi.notes
      };
      var copySelect = document.getElementById('copySelect');
      var nameFor = function (prefix) {
        return (prefix + ' ' + (pi.business_name || pi.customer_name)).replace(/\//g, '-');
      };

      if (pi.invoice_number) {
        // issued tax invoice (frozen)
        order.invoice_number = pi.invoice_number;
        order.invoice_date = pi.invoice_date;
        var drawTax = function () {
          host.innerHTML = PR.invoiceHtml(order, company, Object.assign({ type: 'tax', copy: copySelect.value }, baseOpts));
        };
        copySelect.hidden = false;
        copySelect.addEventListener('change', drawTax);
        drawTax();
        if (pi.status === 'cancelled') {
          host.insertAdjacentHTML('afterbegin', '<div class="invoice-sheet inv-preview">CANCELLED - ye tax invoice cancel kiya gaya hai.</div>');
        }
        document.title = nameFor(pi.invoice_number);
        return;
      }

      if (PR.param('tax') === 'preview') {
        if (pi.status === 'cancelled') {
          host.innerHTML = '<div class="invoice-sheet"><h2>Cancelled PI se tax invoice nahi ban sakta</h2></div>';
          return;
        }
        var next = await PR.call('next invoice number', function (sb) { return sb.rpc('peek_next_tax_invoice_number'); });
        order.invoice_number = next;
        order.invoice_date = new Date().toISOString().slice(0, 10);
        host.innerHTML = PR.invoiceHtml(order, company, Object.assign({ type: 'tax', preview: true }, baseOpts));
        document.getElementById('printBtn').style.display = 'none';  // a preview must not be printed as an invoice
        toolbarButton('<a class="outline" href="?id=' + encodeURIComponent(pi.id) + '">Back to PI</a>' +
          '<button class="btn orange" type="button" id="confirmTaxBtn">CONFIRM &amp; CREATE TAX INVOICE</button>');
        document.getElementById('confirmTaxBtn').addEventListener('click', async function () {
          if (!confirm('Tax Invoice banayein?\n\n' + pi.pi_number + ' · ' + PR.money(order.total_amount) +
              '\n\nIske baad rate, items ya amount nahi badal sakenge aur invoice delete nahi hoga ' +
              '(galti ho to Cancelled mark karna hoga).')) return;
          var button = this;
          PR.setBusy(button, true, 'CREATING…');
          try {
            var res = await PR.call('issue tax invoice', function (sb) {
              return sb.rpc('issue_pi_tax_invoice', { p_pi_id: pi.id });
            });
            PR.toast('Tax Invoice ' + res.invoice_number + ' ban gaya.', 'success');
            window.location.href = '?id=' + encodeURIComponent(pi.id);
          } catch (err) {
            PR.setBusy(button, false);
            PR.toast(err.message, 'error');
          }
        });
        document.title = 'Preview ' + nameFor('Tax Invoice');
        return;
      }

      // proforma
      host.innerHTML = PR.invoiceHtml(order, company, Object.assign({ type: 'proforma' }, baseOpts));
      if (pi.status !== 'cancelled') {
        toolbarButton('<a class="btn orange" href="?id=' + encodeURIComponent(pi.id) + '&amp;tax=preview">TAX INVOICE PREVIEW</a>');
      }
      document.title = nameFor(pi.pi_number);
    } catch (err) {
      host.innerHTML = '<div class="invoice-sheet"><h2>The invoice could not be loaded</h2><p>' +
        PR.esc(err.message) + '</p></div>';
    }
  });
})();
