/* Admin - GST / CA report: one month's tax invoices and credit notes for the CA.
 *
 * Sales register, HSN summary and credit-note register as Excel-ready CSV, plus a
 * ZIP with every invoice / credit note as PDF (made in the browser from the same
 * renderer as the printed copies, assets/js/invoice-doc.js). Figures come from
 * PR.invoiceFigures, so they match the invoices exactly. Tax invoices are those of
 * website orders (orders.invoice_number) and of manual PIs (proforma_invoices). */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var host = null;
  var month = '';
  var company = {};
  var data = null;   // { invoices: [...], credits: [...] } for the chosen month

  function ym(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function monthRange(key) {
    var y = Number(key.slice(0, 4)), m = Number(key.slice(5, 7));
    var last = new Date(y, m, 0).getDate();
    return { from: key + '-01', to: key + '-' + String(last).padStart(2, '0') };
  }
  function monthLabel(key) {
    var d = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1);
    return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }
  var r2 = function (v) { return Math.round((Number(v) || 0) * 100) / 100; };
  var stateCode = function (s) { return (PR.GST_STATE_CODES && PR.GST_STATE_CODES[s]) || ''; };

  async function load() {
    var r = monthRange(month);
    var res = await Promise.all([
      PR.call('load invoiced orders', function (sb) {
        return sb.from('orders')
          .select('*, order_items(id,product_id,product_name,product_sku,hsn_code,quantity,unit_price,mrp,gst_rate,taxable_amount,gst_amount,total_price)')
          .not('invoice_number', 'is', null).gte('invoice_date', r.from).lte('invoice_date', r.to)
          .order('invoice_number');
      }),
      PR.call('load PI invoices', function (sb) {
        return sb.from('proforma_invoices').select('*')
          .not('invoice_number', 'is', null).gte('invoice_date', r.from).lte('invoice_date', r.to)
          .order('invoice_number');
      }),
      PR.call('load credit notes', function (sb) {
        return sb.from('credit_notes').select('*').gte('cn_date', r.from).lte('cn_date', r.to).order('cn_number');
      })
    ]);
    var invoices = (res[0] || []).filter(function (o) { return !o.is_test; }).map(function (o) {
      return { kind: 'order', ref: o.order_number, doc: o, raw: o };
    }).concat((res[1] || []).map(function (pi) {
      var o = PR.proformaOrder(pi);
      o.invoice_number = pi.invoice_number;
      o.invoice_date = pi.invoice_date;
      return { kind: 'pi', ref: pi.pi_number, doc: o, raw: pi };
    }));
    invoices.forEach(function (x) { x.fig = PR.invoiceFigures(x.doc, company); });
    invoices.sort(function (a, b) { return String(a.doc.invoice_number).localeCompare(String(b.doc.invoice_number)); });
    data = { invoices: invoices, credits: res[2] || [] };
  }

  /* ------------------------------------------------------------- registers */
  function salesRows() {
    return data.invoices.map(function (x) {
      var o = x.doc, f = x.fig, raw = x.raw;
      var paid = o.payment_status === 'paid';
      var advance = x.kind === 'order' && !paid ? Number(raw.advance_amount || 0) : 0;
      return {
        'Invoice No': o.invoice_number, 'Invoice Date': o.invoice_date,
        'Source': x.kind === 'order' ? 'Website order' : 'Manual PI', 'Order / PI No': x.ref,
        'Customer': o.customer_name || '', 'Business Name': o.customer_business_name || '',
        'Customer GSTIN': o.customer_gstin || '', 'Type': o.customer_gstin ? 'B2B' : 'B2C',
        'Place of Supply': f.placeOfSupply, 'State Code': stateCode(f.placeOfSupply),
        'Taxable Value': f.totals.taxable, 'CGST': f.totals.cgst, 'SGST': f.totals.sgst, 'IGST': f.totals.igst,
        'Round Off': f.roundOff, 'Invoice Total': f.grand,
        'Payment Method': x.kind === 'order' ? PR.paymentMethodLabel(raw.payment_method) : (raw.status || ''),
        'Payment Status': paid ? 'Paid' : advance > 0 ? 'Advance paid' : 'Pending',
        'Paid Before Delivery': x.kind === 'order' ? (paid ? f.grand : advance) : '',
        'Razorpay Payment ID': (x.kind === 'order' && raw.razorpay_payment_id) || '',
        'Balance / COD': x.kind === 'order' ? (paid ? 0 : r2(f.grand - advance)) : '',
        'Order Status': x.kind === 'order' ? raw.order_status : '',
        'Courier': (x.kind === 'order' && raw.courier_partner) || '',
        'AWB': (x.kind === 'order' && (raw.awb_code || raw.tracking_number)) || '',
        'Delivered On': x.kind === 'order' && raw.delivered_at ? String(raw.delivered_at).slice(0, 10) : ''
      };
    });
  }

  function hsnRows() {
    var map = {};
    data.invoices.forEach(function (x) {
      x.fig.lines.forEach(function (l) {
        var key = (l.hsn || '-') + '|' + l.rate;
        var h = map[key] || (map[key] = { 'HSN': l.hsn || '-', 'Description': l.isCharge ? 'Freight & delivery' : l.name,
          'UQC': l.isCharge ? 'OTH' : 'NOS', 'Total Quantity': 0, 'GST Rate %': l.rate,
          'Taxable Value': 0, 'CGST': 0, 'SGST': 0, 'IGST': 0, 'Total Value': 0 });
        h['Total Quantity'] += l.qty;
        h['Taxable Value'] = r2(h['Taxable Value'] + l.taxable);
        h['CGST'] = r2(h['CGST'] + l.cgst); h['SGST'] = r2(h['SGST'] + l.sgst); h['IGST'] = r2(h['IGST'] + l.igst);
        h['Total Value'] = r2(h['Total Value'] + l.total);
      });
    });
    return Object.keys(map).sort().map(function (k) { return map[k]; });
  }

  function creditRows() {
    return data.credits.map(function (c) {
      return {
        'Credit Note No': c.cn_number, 'Credit Note Date': c.cn_date,
        'Against Invoice': c.invoice_number || '', 'Invoice Date': c.invoice_date || '',
        'Customer': c.customer_name || '', 'Business Name': c.business_name || '', 'Customer GSTIN': c.gstin || '',
        'Place of Supply': c.place_of_supply || '', 'State Code': stateCode(c.place_of_supply),
        'Taxable Value': r2(c.taxable_amount), 'CGST': r2(c.cgst_amount), 'SGST': r2(c.sgst_amount), 'IGST': r2(c.igst_amount),
        'Round Off': r2(c.round_off), 'Total': r2(c.total_amount), 'Reason': c.reason || ''
      };
    });
  }

  /* Excel opens this directly: UTF-8 BOM, quoted fields, CRLF */
  function csv(rows) {
    if (!rows.length) return '﻿No entries\r\n';
    var cols = Object.keys(rows[0]);
    var cell = function (v) {
      var s = v === null || v === undefined ? '' : String(v);
      return /[",\r\n]/.test(s) || /^[=+\-@]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return '﻿' + [cols.map(cell).join(',')].concat(rows.map(function (r) {
      return cols.map(function (c) { return cell(r[c]); }).join(',');
    })).join('\r\n') + '\r\n';
  }

  function sum(rows, key) { return r2(rows.reduce(function (s, r) { return s + Number(r[key] || 0); }, 0)); }

  /* ----------------------------------------------------------------- PDFs */
  async function renderPdf(html) {
    var stage = document.getElementById('gstStage');
    stage.innerHTML = html;
    await new Promise(function (r) { setTimeout(r, 60); });   // let the logo paint
    return PRA.pdfBlob(stage.querySelector('.invoice-sheet') || stage);
  }

  async function buildZip(button) {
    var label = monthLabel(month);
    var base = 'PowerRun-GST-' + month;
    var progress = document.getElementById('gstProgress');
    PR.setBusy(button, true, 'ZIP BAN RAHA HAI…');
    try {
      var zip = await PRA.zip();
      var folder = zip.folder(base);
      folder.file('Sales-Register-' + month + '.csv', csv(salesRows()));
      folder.file('HSN-Summary-' + month + '.csv', csv(hsnRows()));
      folder.file('Credit-Notes-' + month + '.csv', csv(creditRows()));
      var total = data.invoices.length + data.credits.length, n = 0;
      for (var i = 0; i < data.invoices.length; i++) {
        var x = data.invoices[i];
        progress.textContent = 'Invoice PDF ' + (++n) + ' / ' + total + '…';
        var opts = x.kind === 'pi'
          ? { type: 'tax', bank: true, proformaNo: x.raw.pi_number, proformaDate: x.raw.pi_date, paymentTerms: x.raw.payment_terms, notes: x.raw.notes }
          : { type: 'tax', bank: true };
        folder.file('Invoices/' + PRA.fileSafe(x.doc.invoice_number) + '_' + PRA.fileSafe(x.ref) + '.pdf',
          await renderPdf(PR.invoiceHtml(x.doc, company, opts)));
      }
      for (var j = 0; j < data.credits.length; j++) {
        var c = data.credits[j];
        progress.textContent = 'Credit note PDF ' + (++n) + ' / ' + total + '…';
        folder.file('Credit-Notes/' + PRA.fileSafe(c.cn_number) + '.pdf', await renderPdf(PR.creditNoteHtml(c, company, {})));
      }
      document.getElementById('gstStage').innerHTML = '';
      progress.textContent = 'ZIP file bana raha hoon…';
      PRA.saveBlob(await zip.generateAsync({ type: 'blob' }), base + '.zip');
      progress.innerHTML = '✓ <b>' + PR.esc(base) + '.zip</b> Downloads mein save ho gaya (' + label + '). Ise CA ko bhej dein.';
      PR.setBusy(button, false);
    } catch (err) {
      PR.setBusy(button, false);
      progress.innerHTML = '<span style="color:#b3261e">ZIP nahi bana: ' + PR.esc(err.message) + '</span>';
    }
  }

  /* ---------------------------------------------------------------- page */
  function render() {
    var sales = salesRows(), hsn = hsnRows(), credits = creditRows();
    var months = [];
    for (var d = new Date(), i = 0; i < 18; i++, d = new Date(d.getFullYear(), d.getMonth() - 1, 1)) months.push(ym(d));
    var stat = function (label, value) {
      return '<div class="stat"><small>' + label + '</small><strong style="font-size:20px">' + value + '</strong></div>';
    };
    host.innerHTML =
      '<div class="panel">' +
        '<div class="panel-head"><h2>GST / CA Report</h2><span class="hint">Har mahine CA ko ZIP bhejein</span></div>' +
        '<div class="toolbar"><label>Mahina <select id="gstMonth">' + months.map(function (k) {
          return '<option value="' + k + '"' + (k === month ? ' selected' : '') + '>' + monthLabel(k) + '</option>';
        }).join('') + '</select></label></div>' +
        '<div class="stat-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:12px 0">' +
          stat('Tax Invoices', sales.length) +
          stat('Taxable Value', PR.money2(sum(sales, 'Taxable Value'))) +
          stat('CGST + SGST', PR.money2(r2(sum(sales, 'CGST') + sum(sales, 'SGST')))) +
          stat('IGST', PR.money2(sum(sales, 'IGST'))) +
          stat('Invoice Total', PR.money2(sum(sales, 'Invoice Total'))) +
          stat('Credit Notes', credits.length + (credits.length ? ' · ' + PR.money2(sum(credits, 'Total')) : '')) +
        '</div>' +
        '<div class="page-actions">' +
          '<button class="btn" type="button" id="gstZip"' + (sales.length || credits.length ? '' : ' disabled') + '>📦 CA ke liye ZIP (PDF + Excel)</button>' +
          '<button class="btn gray" type="button" id="gstSales">Sales Register (Excel)</button>' +
          '<button class="btn gray" type="button" id="gstHsn">HSN Summary (Excel)</button>' +
          '<button class="btn gray" type="button" id="gstCn">Credit Notes (Excel)</button>' +
        '</div>' +
        '<p class="hint" id="gstProgress" style="margin-top:8px">ZIP mein: saare Tax Invoice aur Credit Note PDF, Sales Register, HSN Summary. ' +
          'Advance / COD wale columns se CA Razorpay aur Shiprocket ka paisa mila sakta hai.</p>' +
        (sales.length
          ? '<div class="table-scroll" style="margin-top:12px"><table class="grid"><thead><tr>' +
              '<th>Invoice</th><th>Date</th><th>Customer</th><th>GSTIN</th><th>State</th><th>Taxable</th><th>GST</th><th>Total</th><th>Payment</th>' +
            '</tr></thead><tbody>' + sales.map(function (r) {
              return '<tr><td class="nowrap"><b>' + PR.esc(r['Invoice No']) + '</b><br><small>' + PR.esc(r['Order / PI No']) + '</small></td>' +
                '<td class="nowrap">' + PR.formatDate(r['Invoice Date']) + '</td>' +
                '<td>' + PR.esc(r['Business Name'] || r['Customer']) + '</td><td>' + PR.esc(r['Customer GSTIN'] || '-') + '</td>' +
                '<td>' + PR.esc(r['Place of Supply']) + '</td><td class="nowrap">' + PR.money2(r['Taxable Value']) + '</td>' +
                '<td class="nowrap">' + PR.money2(r2(r['CGST'] + r['SGST'] + r['IGST'])) + '</td>' +
                '<td class="nowrap"><b>' + PR.money2(r['Invoice Total']) + '</b></td>' +
                '<td class="nowrap">' + PR.esc(r['Payment Status']) +
                  (Number(r['Balance / COD']) > 0 ? '<br><small>COD ' + PR.money(r['Balance / COD']) + '</small>' : '') + '</td></tr>';
            }).join('') + '</tbody></table></div>'
          : PRA.empty('Is mahine koi Tax Invoice nahi', 'Orders mein "Issue Tax Invoice" ya Ship karo se invoice banta hai.')) +
      '</div>' +
      // invoices are drawn here one by one while the ZIP is made
      '<div id="gstStage" style="position:absolute;left:0;top:0;width:210mm;z-index:-1;background:#fff" aria-hidden="true"></div>';

    document.getElementById('gstMonth').addEventListener('change', async function (e) {
      month = e.target.value;
      host.innerHTML = PRA.skeleton(4);
      await load();
      render();
    });
    var save = function (name, rows) { PRA.saveBlob(new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' }), name + '-' + month + '.csv'); };
    document.getElementById('gstSales').addEventListener('click', function () { save('Sales-Register', sales); });
    document.getElementById('gstHsn').addEventListener('click', function () { save('HSN-Summary', hsn); });
    document.getElementById('gstCn').addEventListener('click', function () { save('Credit-Notes', credits); });
    document.getElementById('gstZip').addEventListener('click', function (e) { buildZip(e.currentTarget); });
  }

  PRA.boot('gst', 'GST / CA Report', async function (h) {
    host = h;
    var now = new Date();
    // early in the month the CA wants last month
    month = PR.param('month') || ym(now.getDate() <= 10 ? new Date(now.getFullYear(), now.getMonth() - 1, 1) : now);
    var settings = await PR.getSettings();
    company = Object.assign({}, settings.company || {}, settings.company_private || {});
    await load();
    render();
  });
})();
