/* Admin - printable Tax Invoice / Proforma Invoice for a website order.
 *
 *   /admin/invoice/?id=<order uuid>&type=proforma   proforma (with bank details)
 *   /admin/invoice/?id=<order uuid>&type=tax        tax invoice - the order must
 *                                                   already have a number from
 *                                                   issue_tax_invoice()
 *   ...&save=1                                      (Ship karo) also download the
 *                                                   invoice PDF and the courier label
 *
 * The document itself comes from assets/js/invoice-doc.js, the same renderer
 * the customer sees in My Account.
 */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  /* invoice + label as files: PR-2026-00064_Invoice_PR-26-27-0001.pdf, PR-2026-00064_Label.pdf */
  async function saveFiles(order, withLabel) {
    var status = document.getElementById('saveStatus');
    var say = function (html, cls) {
      status.innerHTML = '<div class="form-message ' + (cls || 'info') + '">' + html + '</div>';
    };
    var sheet = document.querySelector('#invoiceContent .invoice-sheet') || document.getElementById('invoiceContent');
    try {
      say('Invoice PDF ban raha hai…');
      var name = PR.esc(order.order_number) + '_Invoice_' + PRA.fileSafe(order.invoice_number) + '.pdf';
      PRA.saveBlob(await PRA.pdfBlob(sheet), order.order_number + '_Invoice_' + PRA.fileSafe(order.invoice_number) + '.pdf');
      var done = '✓ ' + name;
      if (withLabel) {
        say(done + '<br>Label download ho raha hai…');
        var res = await PR.call('label pdf', function (sb) {
          return sb.functions.invoke('shiprocket', { body: { action: 'label_pdf', order_id: order.id } });
        });
        if (!res || !res.ok) throw new Error((res && res.error) || 'Label nahi mila');
        PRA.saveBlob(PRA.base64Blob(res.pdf_base64), res.file);
        done += '<br>✓ ' + PR.esc(res.file);
      }
      say(done + '<br>Files aapke <b>Downloads</b> folder mein save ho gayi.', 'success');
    } catch (err) {
      say('PDF save nahi hua: ' + PR.esc(err.message) + ' - "PRINT / SAVE AS PDF" se save kar lein.', 'error');
    }
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
      // booked through Admin > Orders > Ship karo: the courier label is one click away
      var labelBtn = document.getElementById('labelBtn');
      if (labelBtn && order.label_url && /^https:\/\//.test(order.label_url)) {
        labelBtn.href = order.label_url;
        labelBtn.textContent = 'SHIPPING LABEL' + (order.awb_code ? ' (' + order.awb_code + ')' : '');
        labelBtn.style.display = '';
      }
      if (type === 'tax') {
        var pdfBtn = document.getElementById('pdfBtn');
        pdfBtn.style.display = '';
        pdfBtn.addEventListener('click', function () { saveFiles(order, false); });
        if (PR.param('save') === '1') saveFiles(order, !!order.label_url || !!order.sr_shipment_id);
      }
      document.title = (type === 'tax' ? 'Tax Invoice ' + order.invoice_number : 'Proforma PI-' + order.order_number) +
        ' | PowerRun Admin';
    } catch (err) {
      host.innerHTML = '<div class="invoice-sheet"><h2>The invoice could not be loaded</h2><p>' +
        PR.esc(err.message) + '</p></div>';
    }
  });
})();
