/* Admin - printable Tax Invoice / Proforma Invoice for a website order.
 *
 *   /admin/invoice/?id=<order uuid>&type=proforma   proforma (with bank details)
 *   /admin/invoice/?id=<order uuid>&type=tax        tax invoice - the order must
 *                                                   already have a number from
 *                                                   issue_tax_invoice()
 *
 * The document itself comes from assets/js/invoice-doc.js, the same renderer
 * the customer sees in My Account.
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
    var type = PR.param('type') === 'tax' ? 'tax' : 'proforma';
    if (!id) {
      host.innerHTML = '<div class="invoice-sheet"><h2>No order selected</h2></div>';
      return;
    }

    try {
      var settings = await PR.getSettings();
      var company = Object.assign({}, settings.company || {}, settings.company_private || {});
      var rows = await PR.call('load order', function (sb) {
        return sb.from('orders')
          .select('*, order_items(id,product_name,product_sku,hsn_code,quantity,unit_price,mrp,gst_rate,taxable_amount,gst_amount,total_price)')
          .eq('id', id).limit(1);
      });
      if (!rows || !rows.length) {
        host.innerHTML = '<div class="invoice-sheet"><h2>Order not found</h2></div>';
        return;
      }
      var order = rows[0];
      document.getElementById('backLink').href = '/admin/orders/?order=' + encodeURIComponent(order.order_number);

      if (type === 'tax' && !order.invoice_number) {
        host.innerHTML = '<div class="invoice-sheet"><h2>No tax invoice yet</h2>' +
          '<p>Open the order in Admin → Orders and click <b>Tax Invoice</b> to issue the invoice number first.</p></div>';
        return;
      }

      var copySelect = document.getElementById('copySelect');
      var draw = function () {
        host.innerHTML = PR.invoiceHtml(order, company, { type: type, bank: true, copy: copySelect.value });
      };
      if (type === 'tax') {
        copySelect.hidden = false;
        copySelect.addEventListener('change', draw);
      }
      draw();
      document.title = (type === 'tax' ? 'Tax Invoice ' + order.invoice_number : 'Proforma PI-' + order.order_number) +
        ' | PowerRun Admin';
    } catch (err) {
      host.innerHTML = '<div class="invoice-sheet"><h2>The invoice could not be loaded</h2><p>' +
        PR.esc(err.message) + '</p></div>';
    }
  });
})();
