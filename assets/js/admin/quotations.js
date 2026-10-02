/* Admin - CRM quotations */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired'];
  var EDITABLE_STATUSES = ['draft', 'sent'];

  var quotations = [];
  var products = [];
  var customers = [];
  var companyState = '';
  var host = null;
  var filterStatus = '';

  async function loadAll() {
    var results = await Promise.all([
      PR.call('load quotations', function (sb) {
        return sb.from('quotations').select('*, quotation_items(*)').order('created_at', { ascending: false });
      }),
      PR.call('load products for quotations', function (sb) {
        return sb.from('products').select('id,name,sku,price,mrp,gst_rate,price_includes_gst,hsn_code,stock,availability')
          .eq('is_active', true).order('name');
      }),
      PR.call('load customers for quotations', function (sb) {
        return sb.from('customers').select('id,name,mobile,email,address,city,state,pincode').order('name');
      }),
      PR.getSettings()
    ]);
    quotations = results[0] || [];
    products = results[1] || [];
    customers = results[2] || [];
    companyState = ((results[3] || {}).company || {}).state || '';
  }

  /* ----------------------------------------------------------------- math */
  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  function lineMath(item) {
    var qty = Number(item.quantity) || 0;
    var price = Number(item.unit_price) || 0;
    var rate = Number(item.gst_rate) || 0;
    var amount = price * qty;
    var incl = item.price_includes_gst !== false;
    var taxable, gst;
    if (rate === 0) { taxable = amount; gst = 0; }
    else if (incl) { taxable = amount / (1 + rate / 100); gst = amount - taxable; }
    else { taxable = amount; gst = amount * rate / 100; }
    return { taxable: round2(taxable), gst: round2(gst), total: round2(amount), inclusive: incl };
  }

  function computeTotals(items, shipping, customerState) {
    var subtotal = 0, mrpTotal = 0, taxable = 0, gst = 0, gstAdded = 0;
    items.forEach(function (item) {
      var m = lineMath(item);
      subtotal += Number(item.unit_price) * Number(item.quantity);
      mrpTotal += (Number(item.mrp) || Number(item.unit_price)) * Number(item.quantity);
      taxable += m.taxable;
      gst += m.gst;
      if (!m.inclusive) gstAdded += m.gst;
    });
    subtotal = round2(subtotal);
    mrpTotal = round2(mrpTotal);
    taxable = round2(taxable);
    gst = round2(gst);
    gstAdded = round2(gstAdded);
    var discount = Math.max(round2(mrpTotal - subtotal), 0);
    var shippingCost = round2(shipping);
    var total = round2(subtotal + gstAdded + shippingCost);
    var intra = !companyState || !customerState || companyState === customerState;
    var cgst = intra ? round2(gst / 2) : 0;
    var sgst = intra ? round2(gst - cgst) : 0;
    var igst = intra ? 0 : gst;
    return {
      subtotal: subtotal, mrp_total: mrpTotal, discount_amount: discount,
      taxable_amount: taxable, gst_amount: gst, cgst_amount: cgst, sgst_amount: sgst, igst_amount: igst,
      shipping_cost: shippingCost, total_amount: total
    };
  }

  /* ----------------------------------------------------------------- list */
  function render() {
    var visible = filterStatus ? quotations.filter(function (q) { return q.status === filterStatus; }) : quotations;
    host.innerHTML =
      '<div class="panel">' +
        '<div class="panel-head"><h2>Quotations</h2>' +
          '<div class="page-actions">' +
            '<button class="btn" type="button" data-new-quote>+ New Quotation</button>' +
          '</div></div>' +
        '<div class="toolbar">' +
          '<input type="search" id="quoteSearch" placeholder="Search quote #, customer name or mobile…">' +
          '<select id="quoteStatusFilter"><option value="">All statuses</option>' +
            STATUSES.map(function (s) {
              return '<option value="' + s + '"' + (filterStatus === s ? ' selected' : '') + '>' +
                s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
            }).join('') + '</select>' +
          '<span class="count" id="quoteCount">' + visible.length + ' shown</span>' +
        '</div>' +
        (visible.length
          ? '<div class="table-scroll"><table class="grid" id="quoteTable"><thead><tr>' +
              '<th>Quote #</th><th>Customer</th><th>Date</th><th>Valid Until</th><th>Total</th><th>Status</th><th></th>' +
            '</tr></thead><tbody>' + visible.map(row).join('') + '</tbody></table></div>'
          : PRA.empty('No quotations yet', 'Create a quotation for a customer to get started.')) +
      '</div>';

    PRA.bindSearch('quoteSearch', 'quoteTable', 'quoteCount');
    var statusFilter = document.getElementById('quoteStatusFilter');
    statusFilter.addEventListener('change', function () {
      filterStatus = statusFilter.value;
      var url = filterStatus ? '?status=' + filterStatus : location.pathname;
      history.replaceState(null, '', url);
      render();
    });
  }

  function row(q) {
    return '<tr>' +
      '<td class="nowrap"><b>' + PR.esc(q.quote_number || 'Draft') + '</b></td>' +
      '<td>' + PR.esc(q.customer_name) + '<small>' + PR.esc(q.customer_mobile || '') + '</small></td>' +
      '<td class="nowrap">' + PR.formatDate(q.created_at) + '</td>' +
      '<td class="nowrap">' + (q.valid_until ? PR.formatDate(q.valid_until) : '-') + '</td>' +
      '<td class="nowrap"><b>' + PR.money(q.total_amount) + '</b></td>' +
      '<td>' + PRA.pill(q.status) + (q.converted_order_id ? ' <small>Converted</small>' : '') + '</td>' +
      '<td class="nowrap"><button class="btn ghost small" type="button" data-open-quote="' + PR.esc(q.id) + '">Open</button></td>' +
    '</tr>';
  }

  /* --------------------------------------------------------------- drawer */
  function rowHtml(item, i) {
    return '<tr data-row="' + i + '">' +
      '<td><select class="qi-product" style="width:100%">' +
        '<option value="">Select product…</option>' +
        products.map(function (p) {
          return '<option value="' + PR.esc(p.id) + '"' + (item.product_id === p.id ? ' selected' : '') + '>' +
            PR.esc(p.name) + ' (' + PR.esc(p.sku) + ')</option>';
        }).join('') +
      '</select></td>' +
      '<td><input class="qi-qty" type="number" min="1" step="1" style="width:60px" value="' + PR.esc(item.quantity || 1) + '"></td>' +
      '<td><input class="qi-price" type="number" min="0" step="0.01" style="width:100px" value="' + PR.esc(item.unit_price || 0) + '"></td>' +
      '<td class="nowrap qi-line-total">' + PR.money(lineMath(item).total) + '</td>' +
      '<td><button class="btn danger small" type="button" data-remove-row="' + i + '">✕</button></td>' +
    '</tr>';
  }

  function readItems(tbody) {
    return Array.prototype.map.call(tbody.querySelectorAll('tr'), function (tr) {
      var productId = tr.querySelector('.qi-product').value;
      var product = products.filter(function (p) { return p.id === productId; })[0] || {};
      return {
        product_id: productId || null,
        product_name: product.name || '',
        product_sku: product.sku || '',
        hsn_code: product.hsn_code || '',
        quantity: Number(tr.querySelector('.qi-qty').value) || 1,
        unit_price: Number(tr.querySelector('.qi-price').value) || 0,
        mrp: product.mrp != null ? product.mrp : null,
        gst_rate: product.gst_rate || 0,
        price_includes_gst: product.price_includes_gst !== false
      };
    }).filter(function (item) { return item.product_id; });
  }

  function recompute(body) {
    var tbody = body.querySelector('#quoteItemRows');
    var items = readItems(tbody);
    Array.prototype.forEach.call(tbody.querySelectorAll('tr'), function (tr, i) {
      if (items[i]) tr.querySelector('.qi-line-total').textContent = PR.money(lineMath(items[i]).total);
    });
    var customerId = body.querySelector('#qf_customer').value;
    var customer = customers.filter(function (c) { return c.id === customerId; })[0];
    var shipping = Number(body.querySelector('#qf_shipping').value) || 0;
    var totals = computeTotals(items, shipping, customer && customer.state);

    body.querySelector('#quoteTotalsPanel').innerHTML =
      '<div style="display:flex;justify-content:space-between"><span>Subtotal</span><b>' + PR.money(totals.subtotal) + '</b></div>' +
      (totals.discount_amount > 0.5
        ? '<div style="display:flex;justify-content:space-between;color:#14663a"><span>Discount vs MRP</span><b>- ' + PR.money(totals.discount_amount) + '</b></div>'
        : '') +
      (totals.gst_amount > 0
        ? '<div style="display:flex;justify-content:space-between;font-size:12px;color:#666"><span>GST included (' + PR.money2(totals.gst_amount) + ')</span><span></span></div>'
        : '') +
      '<div style="display:flex;justify-content:space-between"><span>Shipping</span><b>' + (totals.shipping_cost > 0 ? PR.money(totals.shipping_cost) : 'Free') + '</b></div>' +
      '<div style="display:flex;justify-content:space-between;border-top:1px solid #eee;padding-top:8px;font-size:17px"><span>Total</span><b>' + PR.money(totals.total_amount) + '</b></div>';

    return totals;
  }

  function detail(q) {
    var editable = !q || EDITABLE_STATUSES.indexOf(q.status) !== -1;
    var items = q ? (q.quotation_items || []).sort(function (a, b) { return a.sort_order - b.sort_order; }) : [];
    var customer = q ? customers.filter(function (c) { return c.id === q.customer_id; })[0] : null;

    var body = PRA.openDrawer(q ? 'Quotation ' + (q.quote_number || '') : 'New Quotation',
      '<div id="quoteFormMessage"></div>' +
      (q ? '<div class="hint" style="margin-bottom:10px">Status: ' + PRA.pill(q.status) +
        (q.converted_order_id ? ' &middot; converted to an order' : '') + '</div>' : '') +

      (editable
        ? '<form id="quoteForm">' +
          '<div class="form-grid">' +
            '<label>Customer <span class="req">*</span><select id="qf_customer" required>' +
              '<option value="">Select customer…</option>' +
              customers.map(function (c) {
                return '<option value="' + PR.esc(c.id) + '"' + (q && q.customer_id === c.id ? ' selected' : '') + '>' +
                  PR.esc(c.name) + ' (' + PR.esc(c.mobile || 'no mobile') + ')</option>';
              }).join('') + '</select></label>' +
            '<label>Valid Until<input id="qf_valid_until" type="date" value="' + PR.esc(q && q.valid_until || '') + '"></label>' +
          '</div>' +

          '<div class="table-scroll"><table class="grid"><thead><tr>' +
            '<th>Product</th><th>Qty</th><th>Unit Price ₹</th><th>Line Total</th><th></th>' +
          '</tr></thead><tbody id="quoteItemRows">' +
            (items.length ? items.map(rowHtml).join('') : rowHtml({ quantity: 1, unit_price: 0 }, 0)) +
          '</tbody></table></div>' +
          '<div class="page-actions" style="justify-content:flex-start;margin-top:10px">' +
            '<button class="btn gray small" type="button" id="quoteAddRowBtn">+ Add Row</button>' +
          '</div>' +

          '<label>Shipping ₹<input id="qf_shipping" type="number" min="0" step="0.01" value="' + PR.esc(q && q.shipping_cost || 0) + '" style="max-width:160px"></label>' +
          '<label>Terms &amp; Conditions<textarea id="qf_terms" maxlength="1000">' + PR.esc(q && q.terms || '') + '</textarea></label>' +

          '<div class="stat-group-title">Totals</div>' +
          '<div id="quoteTotalsPanel" style="display:grid;gap:6px;max-width:340px"></div>' +

          '<div class="page-actions" style="justify-content:flex-end;margin-top:16px">' +
            '<button class="btn gray" type="button" id="cancelQuoteBtn">Cancel</button>' +
            '<button class="btn" type="submit" id="saveQuoteBtn">SAVE</button>' +
          '</div>' +
        '</form>'
        : '<div class="table-scroll"><table class="grid"><thead><tr>' +
            '<th>Product</th><th>Qty</th><th>Unit Price</th><th>Total</th>' +
          '</tr></thead><tbody>' + items.map(function (it) {
            return '<tr><td>' + PR.esc(it.product_name) + '</td><td>' + it.quantity + '</td>' +
              '<td class="nowrap">' + PR.money(it.unit_price) + '</td><td class="nowrap">' + PR.money(it.total_price) + '</td></tr>';
          }).join('') + '</tbody></table></div>' +
          '<div style="margin-top:14px;text-align:right;font-size:17px"><b>Total: ' + PR.money(q.total_amount) + '</b></div>') +

      (q
        ? '<div class="page-actions" style="justify-content:flex-end;margin-top:18px;border-top:1px solid #eef0f3;padding-top:16px">' +
            '<a class="btn gray" target="_blank" href="/admin/quotations/print/?id=' + encodeURIComponent(q.id) + '">Print / PDF</a> ' +
            (q.status === 'draft' ? '<button class="btn gray" type="button" data-set-status="sent">Mark Sent</button>' : '') +
            (q.status === 'sent' ? '<button class="btn gray" type="button" data-set-status="accepted">Mark Accepted</button> ' +
              '<button class="btn danger" type="button" data-set-status="rejected">Mark Rejected</button> ' +
              '<button class="btn gray" type="button" data-set-status="expired">Mark Expired</button>' : '') +
            (q.status === 'accepted' && !q.converted_order_id
              ? '<button class="btn orange" type="button" id="convertQuoteBtn">Convert to Order</button>' : '') +
            (q.converted_order_id
              ? '<a class="btn ghost" href="/admin/orders/?order=' + encodeURIComponent(q.converted_order_id) + '">View Order</a>' : '') +
          '</div>'
        : ''));

    if (editable) {
      recompute(body);
      body.addEventListener('input', function (e) { if (e.target.closest('#quoteItemRows, #qf_shipping, #qf_customer')) recompute(body); });
      body.addEventListener('change', function (e) { if (e.target.closest('#qf_customer')) recompute(body); });

      document.getElementById('quoteAddRowBtn').addEventListener('click', function () {
        var tbody = body.querySelector('#quoteItemRows');
        tbody.insertAdjacentHTML('beforeend', rowHtml({ quantity: 1, unit_price: 0 }, tbody.children.length));
        recompute(body);
      });
      body.addEventListener('click', function (e) {
        var rm = e.target.closest('[data-remove-row]');
        if (rm) { rm.closest('tr').remove(); recompute(body); }
      });
      document.getElementById('cancelQuoteBtn').addEventListener('click', PRA.closeDrawer);
      document.getElementById('quoteForm').addEventListener('submit', function (event) { save(event, q, body); });
    }

    body.addEventListener('click', function (e) {
      var statusBtn = e.target.closest('[data-set-status]');
      if (statusBtn) setStatus(q, statusBtn.getAttribute('data-set-status'), statusBtn);
    });
    var convertBtn = document.getElementById('convertQuoteBtn');
    if (convertBtn) convertBtn.addEventListener('click', function () { convertToOrder(q, convertBtn); });
  }

  async function save(event, existing, body) {
    event.preventDefault();
    var button = document.getElementById('saveQuoteBtn');
    var messageHost = document.getElementById('quoteFormMessage');
    messageHost.innerHTML = '';

    var customerId = document.getElementById('qf_customer').value;
    var customer = customers.filter(function (c) { return c.id === customerId; })[0];
    if (!customerId || !customer) { PR.toast('Please select a customer.', 'error'); return; }

    var items = readItems(body.querySelector('#quoteItemRows'));
    if (!items.length) { PR.toast('Add at least one product line.', 'error'); return; }

    var shipping = Number(document.getElementById('qf_shipping').value) || 0;
    var totals = computeTotals(items, shipping, customer.state);

    PR.setBusy(button, true, 'SAVING…');
    try {
      var quoteNumber = existing && existing.quote_number;
      if (!quoteNumber) {
        quoteNumber = await PR.call('generate quote number', function (sb) { return sb.rpc('admin_next_quote_number'); });
      }

      var header = Object.assign({
        quote_number: quoteNumber,
        customer_id: customerId,
        customer_name: customer.name,
        customer_mobile: customer.mobile,
        customer_email: customer.email,
        address: customer.address, city: customer.city, state: customer.state, pincode: customer.pincode,
        valid_until: document.getElementById('qf_valid_until').value || null,
        terms: document.getElementById('qf_terms').value.trim() || null,
        place_of_supply: customer.state || null
      }, totals);

      var quotationId = existing ? existing.id : null;
      if (existing) {
        await PR.call('update quotation', function (sb) { return sb.from('quotations').update(header).eq('id', existing.id); });
        await PR.call('clear quotation items', function (sb) { return sb.from('quotation_items').delete().eq('quotation_id', existing.id); });
      } else {
        var adminName = (PRA.admin && PRA.admin.name) ||
          (PRA.session && PRA.session.user && PRA.session.user.email) || 'Admin';
        var createHeader = Object.assign({
          created_by: PRA.session && PRA.session.user && PRA.session.user.id,
          created_by_name: adminName
        }, header);
        var created = await PR.call('create quotation', function (sb) {
          return sb.from('quotations').insert(createHeader).select('id').single();
        });
        quotationId = created.id;
      }

      var itemRows = items.map(function (item, i) {
        var m = lineMath(item);
        return Object.assign({}, item, {
          quotation_id: quotationId, sort_order: i,
          taxable_amount: m.taxable, gst_amount: m.gst, total_price: m.total
        });
      });
      await PR.call('save quotation items', function (sb) { return sb.from('quotation_items').insert(itemRows); });

      PRA.closeDrawer();
      PR.toast('Quotation saved.', 'success');
      await refresh();
    } catch (err) {
      PR.setBusy(button, false);
      messageHost.innerHTML = '<div class="form-message error" role="alert">' + PR.esc(err.message) + '</div>';
      PR.toast(err.message, 'error');
    }
  }

  async function setStatus(q, status, button) {
    PR.setBusy(button, true, 'SAVING…');
    try {
      await PR.call('update quotation status', function (sb) {
        return sb.from('quotations').update({ status: status }).eq('id', q.id);
      });
      PRA.closeDrawer();
      PR.toast('Quotation marked ' + status + '.', 'success');
      await refresh();
      PRA.loadBadges();
    } catch (err) {
      PR.setBusy(button, false);
      PR.toast(err.message, 'error');
    }
  }

  async function convertToOrder(q, button) {
    if (!confirm('Convert quotation ' + q.quote_number + ' into a real order?')) return;
    PR.setBusy(button, true, 'CONVERTING…');
    try {
      var result = await PR.call('convert quotation to order', function (sb) {
        return sb.rpc('admin_convert_quotation_to_order', { p_quotation_id: q.id });
      });
      PRA.closeDrawer();
      PR.toast('Converted to order ' + result.order_number + '.', 'success');
      await refresh();
    } catch (err) {
      PR.setBusy(button, false);
      PR.toast(err.message, 'error');
    }
  }

  async function refresh() {
    await loadAll();
    render();
  }

  document.addEventListener('click', function (event) {
    if (event.target.closest('[data-new-quote]')) { detail(null); return; }
    var open = event.target.closest('[data-open-quote]');
    if (open) {
      var q = quotations.find(function (x) { return String(x.id) === String(open.getAttribute('data-open-quote')); });
      if (q) detail(q);
    }
  });

  PRA.boot('quotations', 'Quotations', async function (contentHost) {
    host = contentHost;
    filterStatus = PR.param('status') || '';
    host.innerHTML = '<div class="panel">' + PRA.skeleton(7) + '</div>';
    await loadAll();
    render();

    var deepId = PR.param('id');
    if (deepId) {
      var q = quotations.find(function (x) { return String(x.id) === String(deepId); });
      if (q) detail(q);
    }
  });
})();
