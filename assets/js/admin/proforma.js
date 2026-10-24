/* Admin - manual Proforma Invoices (PI) for dealers and customers.
 *
 * Not tied to a website order: pick products from the catalogue (or type any
 * item), set the dealer rate, discount and freight, save, then print or share.
 * Saved in proforma_invoices (sql/33); numbers come from admin_next_pi_number().
 * The printed document is PR.invoiceHtml (assets/js/invoice-doc.js), so the GST
 * maths is the same as on order invoices; PR.proformaOrder() converts a PI.
 */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var list = [];
  var products = [];
  var company = {};
  var contentHost = null;
  var editing = null;
  var search = '';

  var r2 = function (n) { return Math.round((Number(n) || 0) * 100) / 100; };
  var today = function () { return new Date().toISOString().slice(0, 10); };
  var plusDays = function (n) { var d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  var DEFAULT_TERMS = '100% advance before dispatch. Prices include GST.';

  async function loadAll() {
    var results = await Promise.all([
      PR.call('load proforma invoices', function (sb) {
        return sb.from('proforma_invoices').select('*').order('created_at', { ascending: false }).limit(500);
      }),
      PR.call('load products', function (sb) {
        return sb.from('products').select('id,name,sku,hsn_code,gst_rate,price,price_includes_gst,is_active')
          .eq('is_active', true).order('name');
      }),
      PR.getSettings()
    ]);
    list = results[0] || [];
    products = results[1] || [];
    company = Object.assign({}, results[2].company || {}, results[2].company_private || {});
  }

  function partyLabel(pi) {
    return pi.business_name ? pi.business_name + ' (' + pi.customer_name + ')' : pi.customer_name;
  }

  function actions(pi) {
    var printUrl = '/admin/proforma/print/?id=' + encodeURIComponent(pi.id);
    var wa = PR.whatsappTo(pi.mobile, '') ? '<button class="btn ghost small" type="button" data-wa-pi="' + PR.esc(pi.id) + '">WhatsApp</button> ' : '';
    var copy = '<button class="btn ghost small" type="button" data-copy-pi="' + PR.esc(pi.id) + '">Copy</button> ';
    if (pi.invoice_number) {
      return '<a class="btn small" href="' + printUrl + '" target="_blank" rel="noopener">Tax Invoice / PDF</a> ' + copy + wa +
        '<a class="btn gray small" href="/admin/credit-notes/?type=pi&amp;id=' + encodeURIComponent(pi.id) + '">Credit Note</a> ' +
        (pi.status === 'cancelled' ? '' : '<button class="btn danger small" type="button" data-cancel-pi="' + PR.esc(pi.id) + '">Cancel Invoice</button>');
    }
    return '<button class="btn ghost small" type="button" data-edit-pi="' + PR.esc(pi.id) + '">Edit / Rate</button> ' + copy +
      '<a class="btn small" href="' + printUrl + '" target="_blank" rel="noopener">PI / PDF</a> ' +
      (pi.status === 'cancelled' ? '' : '<a class="btn small" href="' + printUrl + '&amp;tax=preview" target="_blank" rel="noopener">Tax Invoice</a> ') +
      wa + '<button class="btn danger small" type="button" data-delete-pi="' + PR.esc(pi.id) + '">Delete</button>';
  }

  function numberCell(pi) {
    return '<b>' + PR.esc(pi.pi_number) + '</b>' +
      (pi.invoice_number ? '<small><span class="pill delivered">TAX INVOICE</span> ' + PR.esc(pi.invoice_number) + '</small>' : '');
  }

  function render(host) {
    var q = search.toLowerCase();
    var rows = list.filter(function (pi) {
      return !q || [pi.pi_number, pi.customer_name, pi.business_name, pi.mobile, pi.city]
        .join(' ').toLowerCase().indexOf(q) >= 0;
    });
    host.innerHTML =
      '<div class="panel">' +
        '<div class="panel-head"><h2>Proforma Invoices (PI)</h2>' +
          '<div class="page-actions">' +
            '<input type="search" id="piSearch" placeholder="Search PI no., name, mobile, city" value="' + PR.esc(search) + '" style="min-width:240px">' +
            '<button class="btn" type="button" id="newPiBtn">+ New PI</button>' +
          '</div>' +
        '</div>' +
        '<p class="hint" style="margin-top:-6px">Dealer ya customer ke liye alag se PI banayein - website order ki zaroorat nahi. ' +
          'Rate GST sahit daalein; print par GST alag dikhega.</p>' +
        (rows.length
          ? '<div class="table-scroll pi-table"><table class="grid"><thead><tr>' +
              '<th>PI No.</th><th>Date</th><th>Party</th><th>Mobile</th><th>Amount</th><th>Status</th><th></th>' +
            '</tr></thead><tbody>' +
            rows.map(function (pi) {
              return '<tr><td class="nowrap">' + numberCell(pi) + '</td>' +
                '<td class="nowrap">' + PR.formatDate(pi.pi_date) + '</td>' +
                '<td>' + PR.esc(partyLabel(pi)) + '<small>' + PR.esc(pi.party_type === 'dealer' ? 'Dealer' : 'Customer') +
                  (pi.city ? ' · ' + PR.esc(pi.city) : '') + '</small></td>' +
                '<td class="nowrap">' + PR.esc(pi.mobile || '-') + '</td>' +
                '<td class="nowrap"><b>' + PR.money(pi.total_amount) + '</b></td>' +
                '<td>' + PRA.pill(pi.status) + '</td>' +
                '<td class="nowrap">' + actions(pi) + '</td></tr>';
            }).join('') +
            '</tbody></table></div>' +
            '<div class="pi-cards">' + rows.map(function (pi) {
              return '<div class="pi-card">' +
                '<div class="pi-card-top"><div>' + numberCell(pi) + '</div>' + PRA.pill(pi.status) + '</div>' +
                '<div>' + PR.esc(partyLabel(pi)) + '</div>' +
                '<div class="hint">' + PR.formatDate(pi.pi_date) + (pi.city ? ' · ' + PR.esc(pi.city) : '') +
                  (pi.mobile ? ' · ' + PR.esc(pi.mobile) : '') + '</div>' +
                '<div class="pi-card-amt">' + PR.money(pi.total_amount) + '</div>' +
                '<div class="pi-card-actions">' + actions(pi) + '</div>' +
              '</div>';
            }).join('') + '</div>'
          : PRA.empty(list.length ? 'No PI matches your search' : 'No proforma invoice yet',
                      'Click "+ New PI" to make one for a dealer or customer.')) +
      '</div>';
  }

  /* ----------------------------------------------------------------- form */
  function productOptions() {
    return '<datalist id="piProducts">' + products.map(function (p) {
      return '<option value="' + PR.esc(p.name) + '"></option>';
    }).join('') + '</datalist>';
  }

  function grossPrice(p) {
    var price = Number(p.price) || 0;
    return p.price_includes_gst === false ? r2(price * (1 + (Number(p.gst_rate) || 0) / 100)) : price;
  }

  function itemRow(it) {
    it = it || {};
    var lab = function (t) { return '<span class="pi-lab">' + t + '</span>'; };
    return '<div class="pi-item">' +
      '<label class="pi-c-name">' + lab('Item') +
        '<input class="pi-name" list="piProducts" value="' + PR.esc(it.product_name || '') + '" placeholder="Product (type to search) or any item">' +
        '<input class="pi-sku" type="hidden" value="' + PR.esc(it.product_sku || '') + '">' +
        '<input class="pi-pid" type="hidden" value="' + PR.esc(it.product_id || '') + '"></label>' +
      '<label>' + lab('HSN') + '<input class="pi-hsn" value="' + PR.esc(it.hsn_code || '') + '"></label>' +
      '<label>' + lab('Qty') + '<input class="pi-qty" type="number" min="1" step="1" inputmode="numeric" value="' + PR.esc(it.quantity || 1) + '"></label>' +
      '<label class="pi-c-rate">' + lab('Rate incl. GST (₹)') + '<input class="pi-rate" type="number" min="0" step="0.01" inputmode="decimal" value="' + PR.esc(it.unit_price == null ? '' : it.unit_price) + '"></label>' +
      '<label>' + lab('GST') + '<select class="pi-gst">' + [0, 5, 12, 18, 28].map(function (g) {
        return '<option value="' + g + '"' + (Number(it.gst_rate == null ? 18 : it.gst_rate) === g ? ' selected' : '') + '>' + g + '%</option>';
      }).join('') + '</select></label>' +
      '<div class="pi-c-amt">' + lab('Amount') + '<b class="pi-line">-</b></div>' +
      '<button class="btn danger small pi-del" type="button" title="Remove item" aria-label="Remove item">×</button>' +
    '</div>';
  }

  function field(id, label, value, extra) {
    return '<label>' + label + '<input id="' + id + '" value="' + PR.esc(value == null ? '' : value) + '"' + (extra || '') + '></label>';
  }

  function stateSelect(id, value) {
    return '<select id="' + id + '"><option value="">Select state…</option>' + PR.INDIA_STATES.map(function (s) {
      return '<option' + (s === value ? ' selected' : '') + '>' + PR.esc(s) + '</option>';
    }).join('') + '</select>';
  }

  function openForm(pi, copy) {
    if (pi && pi.invoice_number && !copy) { PR.toast('Tax invoice ban chuka hai - badlav ke liye Copy karein.', 'error'); return; }
    editing = pi && !copy ? pi : null;
    var p = pi || {};
    var title = editing ? 'Edit ' + p.pi_number : (copy ? 'New PI (copy of ' + p.pi_number + ')' : 'New Proforma Invoice');
    var items = (p.items && p.items.length) ? p.items : [{}];
    PRA.openDrawer(title,
      '<form class="form" id="piForm" novalidate>' +
        '<div id="piFormMessage"></div>' +
        '<div class="form-grid three">' +
          '<label>Party Type<select id="pi_type">' +
            '<option value="dealer"' + (p.party_type !== 'customer' ? ' selected' : '') + '>Dealer</option>' +
            '<option value="customer"' + (p.party_type === 'customer' ? ' selected' : '') + '>Customer</option>' +
          '</select></label>' +
          '<label>PI Date<input id="pi_date" type="date" value="' + PR.esc(editing ? p.pi_date : today()) + '"></label>' +
          '<label>Valid Until<input id="pi_valid" type="date" value="' + PR.esc(editing ? (p.valid_until || '') : plusDays(7)) + '"></label>' +
        '</div>' +
        '<h3 style="margin:6px 0 0">Bill to</h3>' +
        '<div class="form-grid">' +
          field('pi_name', 'Contact Name <span class="req">*</span>', p.customer_name, ' required maxlength="120"') +
          field('pi_business', 'Business / Firm Name', p.business_name, ' maxlength="160"') +
        '</div>' +
        '<div class="form-grid three">' +
          field('pi_mobile', 'Mobile <span class="req">*</span>', p.mobile, ' required inputmode="numeric" maxlength="15"') +
          field('pi_email', 'Email', p.email, ' type="email" maxlength="160"') +
          field('pi_gstin', 'GSTIN', p.gstin, ' maxlength="15" style="text-transform:uppercase" placeholder="Unregistered if empty"') +
        '</div>' +
        field('pi_address', 'Address', p.address, ' maxlength="300"') +
        '<div class="form-grid three">' +
          field('pi_city', 'City', p.city, ' maxlength="80"') +
          '<label>State <span class="req">*</span>' + stateSelect('pi_state', p.state) + '</label>' +
          field('pi_pincode', 'Pincode', p.pincode, ' inputmode="numeric" maxlength="6"') +
        '</div>' +
        '<label class="inline"><input id="pi_ship_same" type="checkbox"' + (p.ship_same === false ? '' : ' checked') + '> Ship to the same address</label>' +
        '<div id="piShipBox"' + (p.ship_same === false ? '' : ' hidden') + '>' +
          field('pi_ship_address', 'Ship-to Address', p.shipping_address, ' maxlength="300"') +
          '<div class="form-grid three">' +
            field('pi_ship_city', 'City', p.shipping_city, ' maxlength="80"') +
            '<label>State' + stateSelect('pi_ship_state', p.shipping_state) + '</label>' +
            field('pi_ship_pincode', 'Pincode', p.shipping_pincode, ' inputmode="numeric" maxlength="6"') +
          '</div>' +
        '</div>' +
        '<h3 style="margin:10px 0 0">Items</h3>' +
        '<p class="hint" style="margin:0">Product chunne par HSN, GST aur website ki price apne-aap aa jaati hai. Dealer rate yahan badal dein (GST sahit, per piece).</p>' +
        productOptions() +
        '<div id="piItems" class="pi-items">' + items.map(itemRow).join('') + '</div>' +
        '<button class="btn ghost small" type="button" id="piAddItem">+ Add Item</button>' +
        '<div class="form-grid three" style="margin-top:12px">' +
          '<label>Discount (₹)<input id="pi_discount" type="number" min="0" step="0.01" value="' + PR.esc(p.discount_amount || 0) + '">' +
            '<span class="hint">Poore bill par, GST se pehle ghatega.</span></label>' +
          '<label>Freight / Delivery (₹, incl. GST)<input id="pi_freight" type="number" min="0" step="0.01" value="' + PR.esc(p.shipping_cost || 0) + '"></label>' +
          '<label>Status<select id="pi_status">' + ['draft', 'sent', 'paid', 'cancelled'].map(function (s) {
            return '<option value="' + s + '"' + ((p.status || 'draft') === s && !copy ? ' selected' : '') + '>' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
          }).join('') + '</select></label>' +
        '</div>' +
        '<label>Payment Terms<input id="pi_terms" maxlength="300" value="' + PR.esc(p.payment_terms || DEFAULT_TERMS) + '"></label>' +
        '<label>Notes (print par dikhega)<textarea id="pi_notes" rows="2" maxlength="1000">' + PR.esc(p.notes || '') + '</textarea></label>' +
        '<div class="panel" id="piTotals" style="margin:8px 0;padding:12px"></div>' +
        '<div class="page-actions" style="justify-content:flex-end">' +
          '<button class="btn gray" type="button" id="piCancel">Cancel</button>' +
          '<button class="btn ghost" type="submit" data-then="stay">SAVE</button>' +
          '<button class="btn" type="submit" data-then="print">SAVE &amp; PRINT</button>' +
        '</div>' +
      '</form>');

    var form = document.getElementById('piForm');
    document.getElementById('piCancel').addEventListener('click', PRA.closeDrawer);
    document.getElementById('piAddItem').addEventListener('click', function () {
      document.getElementById('piItems').insertAdjacentHTML('beforeend', itemRow({}));
      refreshTotals();
    });
    document.getElementById('pi_ship_same').addEventListener('change', function (e) {
      document.getElementById('piShipBox').hidden = e.target.checked;
      refreshTotals();
    });
    document.getElementById('pi_gstin').addEventListener('change', function (e) {
      var state = PR.gstinState(e.target.value);
      if (state && PR.isValidGstin(e.target.value)) document.getElementById('pi_state').value = state;
      refreshTotals();
    });
    form.addEventListener('input', onItemInput);
    form.addEventListener('change', onItemInput);
    form.addEventListener('click', function (e) {
      var del = e.target.closest('.pi-del');
      if (!del) return;
      var rowsLeft = document.querySelectorAll('#piItems .pi-item');
      if (rowsLeft.length > 1) del.closest('.pi-item').remove();
      else del.closest('.pi-item').outerHTML = itemRow({});
      refreshTotals();
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      save(e.submitter && e.submitter.getAttribute('data-then'));
    });
    refreshTotals();
    if (pi) {
      // Edit / Copy are mostly about changing the rate: go straight to it
      setTimeout(function () {
        var rate = document.querySelector('#piItems .pi-rate');
        if (!rate) return;
        rate.scrollIntoView({ block: 'center' });
        rate.focus();
        try { rate.select(); } catch (err) { /* number inputs on some phones */ }
      }, 150);
    }
  }

  function onItemInput(e) {
    var nameInput = e.target.closest && e.target.closest('.pi-name');
    if (nameInput && e.type === 'change') {
      var match = products.find(function (p) { return p.name === nameInput.value; });
      var row = nameInput.closest('.pi-item');
      if (match) {
        row.querySelector('.pi-sku').value = match.sku || '';
        row.querySelector('.pi-pid').value = match.id;
        row.querySelector('.pi-hsn').value = match.hsn_code || '';
        row.querySelector('.pi-gst').value = String(Math.round(Number(match.gst_rate == null ? 18 : match.gst_rate)));
        row.querySelector('.pi-rate').value = grossPrice(match);
      } else {
        row.querySelector('.pi-sku').value = '';
        row.querySelector('.pi-pid').value = '';
      }
    }
    refreshTotals();
  }

  function val(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }

  function collect() {
    var same = document.getElementById('pi_ship_same').checked;
    var items = Array.prototype.map.call(document.querySelectorAll('#piItems .pi-item'), function (row) {
      return {
        product_id: row.querySelector('.pi-pid').value || null,
        product_name: row.querySelector('.pi-name').value.trim(),
        product_sku: row.querySelector('.pi-sku').value || '',
        hsn_code: row.querySelector('.pi-hsn').value.trim(),
        quantity: Math.max(1, Math.round(Number(row.querySelector('.pi-qty').value) || 1)),
        unit_price: r2(row.querySelector('.pi-rate').value),
        gst_rate: Number(row.querySelector('.pi-gst').value) || 0
      };
    }).filter(function (it) { return it.product_name; });
    return {
      party_type: val('pi_type') || 'dealer',
      pi_date: val('pi_date') || today(),
      valid_until: val('pi_valid') || null,
      customer_name: val('pi_name'),
      business_name: val('pi_business') || null,
      gstin: PR.normalizeGstin(val('pi_gstin')) || null,
      mobile: val('pi_mobile').replace(/\D/g, '').slice(-10) || null,
      email: val('pi_email') || null,
      address: val('pi_address') || null,
      city: val('pi_city') || null,
      state: val('pi_state') || null,
      pincode: val('pi_pincode') || null,
      ship_same: same,
      shipping_address: same ? null : (val('pi_ship_address') || null),
      shipping_city: same ? null : (val('pi_ship_city') || null),
      shipping_state: same ? null : (val('pi_ship_state') || null),
      shipping_pincode: same ? null : (val('pi_ship_pincode') || null),
      items: items,
      discount_amount: Math.max(0, r2(val('pi_discount'))),
      shipping_cost: Math.max(0, r2(val('pi_freight'))),
      payment_terms: val('pi_terms') || null,
      notes: val('pi_notes') || null,
      status: val('pi_status') || 'draft'
    };
  }

  function refreshTotals() {
    var pi = collect();
    var order = PR.proformaOrder(pi);
    var f = PR.invoiceFigures(order, company);
    document.querySelectorAll('#piItems .pi-item').forEach(function (row) {
      var qty = Math.max(1, Math.round(Number(row.querySelector('.pi-qty').value) || 1));
      var rate = Number(row.querySelector('.pi-rate').value) || 0;
      row.querySelector('.pi-line').textContent = rate ? PR.money2(qty * rate) : '-';
    });
    var box = document.getElementById('piTotals');
    if (!box) return;
    box.innerHTML = order.order_items.length
      ? '<div class="summary-row"><span>Taxable value</span><b>' + PR.money2(f.totals.taxable) + '</b></div>' +
        (f.intra
          ? '<div class="summary-row"><span>CGST + SGST</span><b>' + PR.money2(f.totals.cgst + f.totals.sgst) + '</b></div>'
          : '<div class="summary-row"><span>IGST</span><b>' + PR.money2(f.totals.igst) + '</b></div>') +
        (order.coupon_discount ? '<div class="summary-row"><span>Discount (taxable value mein ghata)</span><b>- ' + PR.money2(order.coupon_discount) + '</b></div>' : '') +
        (order.shipping_cost ? '<div class="summary-row"><span>Freight (included)</span><b>' + PR.money2(order.shipping_cost) + '</b></div>' : '') +
        '<div class="summary-row" style="font-size:18px"><span><b>Grand Total</b></span><b>' + PR.money2(order.total_amount) + '</b></div>' +
        '<p class="hint" style="margin:6px 0 0">' + (f.intra ? 'Uttar Pradesh ke andar: CGST + SGST' : 'Doosra state: IGST') +
          (order.customer_gstin ? ' · GSTIN wala (B2B) bill' : ' · Unregistered party') + '</p>'
      : '<p class="hint" style="margin:0">Item jodne par total yahan dikhega.</p>';
  }

  async function save(then) {
    var host = document.getElementById('piFormMessage');
    host.innerHTML = '';
    var values = PR.validateForm(document.getElementById('piForm'), [
      { el: 'pi_name', label: 'Contact name', required: true },
      { el: 'pi_mobile', label: 'Mobile', required: true, type: 'mobile' },
      { el: 'pi_email', label: 'Email', type: 'email' },
      { el: 'pi_pincode', label: 'Pincode', type: 'pincode' },
      { el: 'pi_state', label: 'State', required: true }
    ]);
    if (!values) return;
    var pi = collect();
    var problem = '';
    if (!pi.items.length) problem = 'Kam se kam ek item jodein.';
    else if (pi.items.some(function (it) { return !(it.unit_price > 0); })) problem = 'Har item ka rate (₹) daalein.';
    else if (pi.gstin && !PR.isValidGstin(pi.gstin)) problem = 'GSTIN sahi nahi hai (15 akshar, check digit galat). Khaali chhodein ya sahi daalein.';
    else if (pi.gstin && PR.gstinState(pi.gstin) !== pi.state) problem = 'GSTIN ' + PR.gstinState(pi.gstin) + ' ka hai, lekin State ' + pi.state + ' chuna hai.';
    if (problem) {
      host.innerHTML = '<div class="form-message error" role="alert">' + PR.esc(problem) + '</div>';
      PR.toast(problem, 'error');
      return;
    }
    pi.total_amount = PR.proformaOrder(pi).total_amount;

    var buttons = document.querySelectorAll('#piForm button[type=submit]');
    buttons.forEach(function (b) { PR.setBusy(b, true, 'SAVING…'); });
    var printWin = then === 'print' ? window.open('about:blank', '_blank') : null;
    try {
      var id;
      if (editing) {
        await PR.call('update PI', function (sb) { return sb.from('proforma_invoices').update(pi).eq('id', editing.id); });
        id = editing.id;
      } else {
        pi.pi_number = await PR.call('PI number', function (sb) { return sb.rpc('admin_next_pi_number'); });
        pi.created_by = PRA.session && PRA.session.user ? PRA.session.user.id : null;
        pi.created_by_name = (PRA.admin && PRA.admin.name) || null;
        var saved = await PR.call('create PI', function (sb) {
          return sb.from('proforma_invoices').insert(pi).select('id').single();
        });
        id = saved.id;
      }
      PRA.closeDrawer();
      PR.toast('PI saved' + (pi.pi_number ? ': ' + pi.pi_number : '') + '.', 'success');
      if (printWin) printWin.location = '/admin/proforma/print/?id=' + encodeURIComponent(id);
      await refresh();
    } catch (err) {
      if (printWin) printWin.close();
      buttons.forEach(function (b) { PR.setBusy(b, false); });
      host.innerHTML = '<div class="form-message error" role="alert">' + PR.esc(err.message) + '</div>';
      PR.toast(err.message, 'error');
    }
  }

  function shareWhatsApp(pi) {
    var text = 'Namaste ' + (pi.customer_name || '') + ' ji, PowerRun Industries se.\n' +
      (pi.invoice_number
        ? 'Aapka Tax Invoice ' + pi.invoice_number + ' (' + PR.money(pi.total_amount) + ', GST sahit) taiyaar hai. Invoice ki PDF hum is chat mein bhej rahe hain.\n'
        : 'Aapka Proforma Invoice ' + pi.pi_number + ' taiyaar hai: ' + PR.money(pi.total_amount) + ' (GST sahit)' +
          (pi.valid_until ? ', ' + PR.formatDate(pi.valid_until) + ' tak valid' : '') + '.\n' +
          'PI ki PDF hum is chat mein bhej rahe hain. Payment ke baad order dispatch kar diya jayega.\n') +
      'Koi sawal ho to isi number par message karein.';
    var link = PR.whatsappTo(pi.mobile, text);
    if (link) window.open(link, '_blank', 'noopener');
  }

  async function cancelInvoice(pi) {
    if (!confirm('Tax Invoice ' + pi.invoice_number + ' cancel karein?\n\nInvoice number wahi rahega (GST series ke liye), ' +
        'lekin ise Cancelled mark kar diya jayega. Sahi bill ke liye "Copy" se naya PI aur naya Tax Invoice banayein.')) return;
    try {
      await PR.call('cancel tax invoice', function (sb) {
        return sb.from('proforma_invoices').update({ status: 'cancelled' }).eq('id', pi.id);
      });
      PR.toast('Invoice cancelled.', 'success');
      if (confirm('GST ke liye is cancelled invoice ka Credit Note banana zaroori hai. Abhi banayein?')) {
        window.location.href = '/admin/credit-notes/?type=pi&id=' + encodeURIComponent(pi.id);
        return;
      }
      await refresh();
    } catch (err) {
      PR.toast(err.message, 'error');
    }
  }

  async function remove(pi) {
    if (!confirm('Delete ' + pi.pi_number + '?\n\nThis cannot be undone. The number is not reused.')) return;
    try {
      await PR.call('delete PI', function (sb) { return sb.from('proforma_invoices').delete().eq('id', pi.id); });
      PR.toast('PI deleted.', 'success');
      await refresh();
    } catch (err) {
      PR.toast(err.message, 'error');
    }
  }

  async function refresh() {
    await loadAll();
    render(contentHost);
  }

  function byId(attr, el) {
    var id = el.getAttribute(attr);
    return list.find(function (p) { return p.id === id; });
  }

  document.addEventListener('click', function (event) {
    if (event.target.closest('#newPiBtn')) { openForm(null); return; }
    var t;
    if ((t = event.target.closest('[data-edit-pi]'))) { var a = byId('data-edit-pi', t); if (a) openForm(a); return; }
    if ((t = event.target.closest('[data-copy-pi]'))) { var b = byId('data-copy-pi', t); if (b) openForm(b, true); return; }
    if ((t = event.target.closest('[data-wa-pi]'))) { var c = byId('data-wa-pi', t); if (c) shareWhatsApp(c); return; }
    if ((t = event.target.closest('[data-delete-pi]'))) { var d = byId('data-delete-pi', t); if (d) remove(d); return; }
    if ((t = event.target.closest('[data-cancel-pi]'))) { var f = byId('data-cancel-pi', t); if (f) cancelInvoice(f); }
  });
  document.addEventListener('input', function (event) {
    if (event.target.id !== 'piSearch') return;
    search = event.target.value;
    var pos = event.target.selectionStart;
    render(contentHost);
    var input = document.getElementById('piSearch');
    input.focus();
    try { input.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
  });

  PRA.boot('proforma', 'Proforma Invoice (PI)', async function (host) {
    contentHost = host;
    host.innerHTML = '<div class="panel">' + PRA.skeleton(6) + '</div>';
    await loadAll();
    render(host);
    if (PR.param('new') === '1') openForm(null);
  });
})();
