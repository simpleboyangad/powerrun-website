/* Admin - CRM quotations */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired'];
  var EDITABLE_STATUSES = ['draft', 'sent'];
  var TYPES = ['customer', 'dealer', 'project'];
  var PAYMENT_PRESETS = ['100% Advance', '50% Advance / 50% Before Dispatch',
    '30% Advance / Balance Before Dispatch', 'Credit'];

  var quotations = [];
  var products = [];
  var customers = [];
  var categories = [];
  var staff = [];
  var companyState = '';
  var quoteDefaults = {};
  var host = null;
  var filterStatus = '';
  var filterType = '';
  var filterStaff = '';
  var filterFrom = '';
  var filterTo = '';

  async function loadAll() {
    var results = await Promise.all([
      PR.call('load quotations', function (sb) {
        return sb.from('quotations').select('*, quotation_items(*)').order('created_at', { ascending: false });
      }),
      PR.call('load products for quotations', function (sb) {
        return sb.from('products').select('id,name,sku,price,mrp,gst_rate,price_includes_gst,hsn_code,stock,availability,category_id')
          .eq('is_active', true).order('name');
      }),
      PR.call('load customers for quotations', function (sb) {
        return sb.from('customers').select('id,name,mobile,email,address,city,state,pincode,' +
          'company_name,contact_person,gstin,whatsapp,customer_type,' +
          'shipping_address,shipping_city,shipping_state,shipping_pincode').order('name');
      }),
      PR.call('load categories for quotations', function (sb) {
        return sb.from('categories').select('id,name');
      }),
      PR.call('load staff for quotations', function (sb) {
        return sb.from('admin_users').select('id,name,user_id').eq('is_active', true).order('name');
      }),
      PR.getSettings()
    ]);
    quotations = results[0] || [];
    products = results[1] || [];
    customers = results[2] || [];
    categories = results[3] || [];
    staff = results[4] || [];
    companyState = ((results[5] || {}).company || {}).state || '';
    quoteDefaults = (results[5] || {}).quotation_defaults || {};
  }

  function categoryName(id) {
    var c = categories.filter(function (x) { return x.id === id; })[0];
    return c ? c.name : '';
  }

  /* ----------------------------------------------------------------- math */
  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  function lineMath(item) {
    var qty = Number(item.quantity) || 0;
    var price = Number(item.unit_price) || 0;
    var rate = Number(item.gst_rate) || 0;
    var gross = price * qty;
    var pct = Math.min(Math.max(Number(item.discount_percent) || 0, 0), 100);
    var lineDiscount = round2(gross * pct / 100);
    var amount = Math.max(round2(gross - lineDiscount), 0);
    var incl = item.price_includes_gst !== false;
    var taxable, gst;
    if (rate === 0) { taxable = amount; gst = 0; }
    else if (incl) { taxable = amount / (1 + rate / 100); gst = amount - taxable; }
    else { taxable = amount; gst = amount * rate / 100; }
    return { gross: round2(gross), discount_percent: pct, discount_amount: lineDiscount,
      taxable: round2(taxable), gst: round2(gst), total: round2(amount), inclusive: incl };
  }

  function computeTotals(items, header, customerState) {
    header = header || {};
    var grossTotal = 0, subtotal = 0, mrpTotal = 0, taxable = 0, gst = 0, gstAdded = 0, itemDiscount = 0;
    items.forEach(function (item) {
      var m = lineMath(item);
      grossTotal += m.gross;
      subtotal += m.total;
      mrpTotal += (Number(item.mrp) || Number(item.unit_price)) * Number(item.quantity);
      itemDiscount += m.discount_amount;
      taxable += m.taxable;
      gst += m.gst;
      if (!m.inclusive) gstAdded += m.gst;
    });
    grossTotal = round2(grossTotal);
    subtotal = round2(subtotal);
    mrpTotal = round2(mrpTotal);
    itemDiscount = round2(itemDiscount);
    taxable = round2(taxable);
    gst = round2(gst);
    gstAdded = round2(gstAdded);
    var discount = Math.max(round2(mrpTotal - grossTotal), 0);
    var shippingCost = round2(header.shipping_cost || 0);
    var freightCost = round2(header.freight_cost || 0);
    var installationCost = round2(header.installation_cost || 0);
    var otherCharges = round2(header.other_charges || 0);
    var roundOff = round2(header.round_off || 0);
    var total = round2(subtotal + gstAdded + shippingCost + freightCost + installationCost + otherCharges + roundOff);
    var intra = !companyState || !customerState || companyState === customerState;
    var cgst = intra ? round2(gst / 2) : 0;
    var sgst = intra ? round2(gst - cgst) : 0;
    var igst = intra ? 0 : gst;
    return {
      subtotal: subtotal, mrp_total: mrpTotal, discount_amount: discount, item_discount_amount: itemDiscount,
      taxable_amount: taxable, gst_amount: gst, cgst_amount: cgst, sgst_amount: sgst, igst_amount: igst,
      shipping_cost: shippingCost, freight_cost: freightCost, installation_cost: installationCost,
      other_charges: otherCharges, round_off: roundOff, total_amount: total
    };
  }

  /* -------------------------------------------------------------- helpers */
  function typeLabel(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Customer'; }
  function staffName(id) { var s = staff.filter(function (x) { return x.id === id; })[0]; return s ? s.name : ''; }

  async function writeAudit(quotationId, action, oldValue, newValue) {
    try {
      var adminName = (PRA.admin && PRA.admin.name) ||
        (PRA.session && PRA.session.user && PRA.session.user.email) || 'Admin';
      await PR.call('log quotation activity', function (sb) {
        return sb.from('quotation_audit_log').insert({
          quotation_id: quotationId,
          admin_user_id: PRA.session && PRA.session.user && PRA.session.user.id,
          admin_name_snapshot: adminName,
          action: action, old_value: oldValue || null, new_value: newValue || null
        });
      });
    } catch (err) {
      console.warn('[PowerRun] quotation audit log failed:', err.message);
    }
  }

  /* ----------------------------------------------------------------- list */
  function dashboardStats(all) {
    var counts = {};
    STATUSES.forEach(function (s) { counts[s] = 0; });
    var converted = 0, totalValue = 0;
    all.forEach(function (q) {
      counts[q.status] = (counts[q.status] || 0) + 1;
      if (q.converted_order_id) converted++;
      totalValue += Number(q.total_amount) || 0;
    });
    function tile(label, value) {
      return '<div class="stat"><small>' + PR.esc(label) + '</small><strong>' + PR.esc(String(value)) + '</strong></div>';
    }
    return '<div class="stats">' +
      tile('Total Quotations', all.length) +
      tile('Draft', counts.draft) + tile('Sent', counts.sent) + tile('Accepted', counts.accepted) +
      tile('Rejected', counts.rejected) + tile('Expired', counts.expired) +
      tile('Converted', converted) + tile('Total Value', PR.money(totalValue)) +
    '</div>';
  }

  function render() {
    var visible = quotations.filter(function (q) {
      if (filterStatus && q.status !== filterStatus) return false;
      if (filterType && q.quotation_type !== filterType) return false;
      if (filterStaff && q.sales_person !== filterStaff) return false;
      if (filterFrom && q.created_at < filterFrom) return false;
      if (filterTo && q.created_at > (filterTo + 'T23:59:59')) return false;
      return true;
    });
    host.innerHTML =
      '<div class="panel">' +
        '<div class="panel-head"><h2>Quotations</h2>' +
          '<div class="page-actions">' +
            '<button class="btn gray" type="button" id="quoteExportBtn">Export CSV</button> ' +
            '<button class="btn" type="button" data-new-quote>+ New Quotation</button>' +
          '</div></div>' +
        dashboardStats(quotations) +
        '<div class="toolbar" style="flex-wrap:wrap">' +
          '<input type="search" id="quoteSearch" placeholder="Search quote #, customer name or mobile…">' +
          '<select id="quoteStatusFilter"><option value="">All statuses</option>' +
            STATUSES.map(function (s) {
              return '<option value="' + s + '"' + (filterStatus === s ? ' selected' : '') + '>' +
                s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
            }).join('') + '</select>' +
          '<select id="quoteTypeFilter"><option value="">All types</option>' +
            TYPES.map(function (t) {
              return '<option value="' + t + '"' + (filterType === t ? ' selected' : '') + '>' + typeLabel(t) + '</option>';
            }).join('') + '</select>' +
          '<select id="quoteStaffFilter"><option value="">All sales people</option>' +
            staff.map(function (s) {
              return '<option value="' + PR.esc(s.id) + '"' + (filterStaff === s.id ? ' selected' : '') + '>' + PR.esc(s.name) + '</option>';
            }).join('') + '</select>' +
          '<input type="date" id="quoteFromFilter" value="' + PR.esc(filterFrom) + '" title="From date">' +
          '<input type="date" id="quoteToFilter" value="' + PR.esc(filterTo) + '" title="To date">' +
          '<span class="count" id="quoteCount">' + visible.length + ' shown</span>' +
        '</div>' +
        (visible.length
          ? '<div class="table-scroll"><table class="grid" id="quoteTable"><thead><tr>' +
              '<th>Quote #</th><th>Type</th><th>Customer</th><th>Date</th><th>Valid Until</th><th>Total</th><th>Status</th><th></th>' +
            '</tr></thead><tbody>' + visible.map(row).join('') + '</tbody></table></div>'
          : PRA.empty('No quotations match these filters', 'Create a quotation for a customer to get started.')) +
      '</div>';

    PRA.bindSearch('quoteSearch', 'quoteTable', 'quoteCount');
    function onFilterChange() {
      filterStatus = document.getElementById('quoteStatusFilter').value;
      filterType = document.getElementById('quoteTypeFilter').value;
      filterStaff = document.getElementById('quoteStaffFilter').value;
      filterFrom = document.getElementById('quoteFromFilter').value;
      filterTo = document.getElementById('quoteToFilter').value;
      var url = filterStatus ? '?status=' + filterStatus : location.pathname;
      history.replaceState(null, '', url);
      render();
    }
    ['quoteStatusFilter', 'quoteTypeFilter', 'quoteStaffFilter', 'quoteFromFilter', 'quoteToFilter'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', onFilterChange);
    });
    document.getElementById('quoteExportBtn').addEventListener('click', function () { exportCsv(visible); });
  }

  function exportCsv(rows) {
    var header = ['Quote Number', 'Type', 'Customer', 'Mobile', 'Date', 'Valid Until', 'Status', 'Sales Person', 'Total'];
    var csvRows = [header.join(',')];
    rows.forEach(function (q) {
      var cells = [q.quote_number || 'Draft', typeLabel(q.quotation_type), q.customer_name, q.customer_mobile || '',
        PR.formatDate(q.created_at), q.valid_until ? PR.formatDate(q.valid_until) : '', q.status,
        staffName(q.sales_person), q.total_amount];
      csvRows.push(cells.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(','));
    });
    var blob = new Blob([csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'quotations-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function row(q) {
    return '<tr>' +
      '<td class="nowrap"><b>' + PR.esc(q.quote_number || 'Draft') + '</b></td>' +
      '<td>' + PRA.pill(q.quotation_type || 'customer') + '</td>' +
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
          var cat = categoryName(p.category_id);
          return '<option value="' + PR.esc(p.id) + '"' + (item.product_id === p.id ? ' selected' : '') + '>' +
            PR.esc(p.name) + ' (' + PR.esc(p.sku) + ')' + (cat ? ' · ' + PR.esc(cat) : '') + '</option>';
        }).join('') +
      '</select></td>' +
      '<td><input class="qi-qty" type="number" min="1" step="1" style="width:60px" value="' + PR.esc(item.quantity || 1) + '"></td>' +
      '<td><input class="qi-price" type="number" min="0" step="0.01" style="width:100px" value="' + PR.esc(item.unit_price || 0) + '"></td>' +
      '<td><input class="qi-discount" type="number" min="0" max="100" step="0.1" style="width:70px" value="' + PR.esc(item.discount_percent || 0) + '" title="Discount %"></td>' +
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
        category_snapshot: categoryName(product.category_id) || null,
        quantity: Number(tr.querySelector('.qi-qty').value) || 1,
        unit_price: Number(tr.querySelector('.qi-price').value) || 0,
        discount_percent: Number(tr.querySelector('.qi-discount').value) || 0,
        dealer_price: product.price != null ? product.price : null,
        mrp: product.mrp != null ? product.mrp : null,
        gst_rate: product.gst_rate || 0,
        price_includes_gst: product.price_includes_gst !== false
      };
    }).filter(function (item) { return item.product_id; });
  }

  function headerPricingFromForm(body) {
    return {
      shipping_cost: Number(body.querySelector('#qf_shipping').value) || 0,
      freight_cost: Number(body.querySelector('#qf_freight').value) || 0,
      installation_cost: Number(body.querySelector('#qf_installation').value) || 0,
      other_charges: Number(body.querySelector('#qf_other').value) || 0,
      round_off: Number(body.querySelector('#qf_roundoff').value) || 0
    };
  }

  function recompute(body) {
    var tbody = body.querySelector('#quoteItemRows');
    var items = readItems(tbody);
    Array.prototype.forEach.call(tbody.querySelectorAll('tr'), function (tr, i) {
      if (items[i]) tr.querySelector('.qi-line-total').textContent = PR.money(lineMath(items[i]).total);
    });
    var customerId = body.querySelector('#qf_customer').value;
    var customer = customers.filter(function (c) { return c.id === customerId; })[0];
    var totals = computeTotals(items, headerPricingFromForm(body), customer && customer.state);

    body.querySelector('#quoteTotalsPanel').innerHTML =
      '<div style="display:flex;justify-content:space-between"><span>Subtotal</span><b>' + PR.money(totals.subtotal) + '</b></div>' +
      (totals.discount_amount > 0.5
        ? '<div style="display:flex;justify-content:space-between;color:#14663a"><span>Discount vs MRP</span><b>- ' + PR.money(totals.discount_amount) + '</b></div>'
        : '') +
      (totals.item_discount_amount > 0.5
        ? '<div style="display:flex;justify-content:space-between;color:#14663a"><span>Item Discount</span><b>- ' + PR.money(totals.item_discount_amount) + '</b></div>'
        : '') +
      (totals.gst_amount > 0
        ? '<div style="display:flex;justify-content:space-between;font-size:12px;color:#666"><span>GST included (' + PR.money2(totals.gst_amount) + ')</span><span></span></div>'
        : '') +
      '<div style="display:flex;justify-content:space-between"><span>Shipping</span><b>' + (totals.shipping_cost > 0 ? PR.money(totals.shipping_cost) : 'Free') + '</b></div>' +
      (totals.freight_cost ? '<div style="display:flex;justify-content:space-between"><span>Freight</span><b>' + PR.money(totals.freight_cost) + '</b></div>' : '') +
      (totals.installation_cost ? '<div style="display:flex;justify-content:space-between"><span>Installation</span><b>' + PR.money(totals.installation_cost) + '</b></div>' : '') +
      (totals.other_charges ? '<div style="display:flex;justify-content:space-between"><span>Other Charges</span><b>' + PR.money(totals.other_charges) + '</b></div>' : '') +
      (totals.round_off ? '<div style="display:flex;justify-content:space-between"><span>Round Off</span><b>' + PR.money(totals.round_off) + '</b></div>' : '') +
      '<div style="display:flex;justify-content:space-between;border-top:1px solid #eee;padding-top:8px;font-size:17px"><span>Total</span><b>' + PR.money(totals.total_amount) + '</b></div>';

    return totals;
  }

  function applyTypeVisibility(body) {
    var checked = body.querySelector('input[name="qf_type"]:checked');
    var type = checked ? checked.value : 'customer';
    Array.prototype.forEach.call(body.querySelectorAll('[data-type-group]'), function (el) {
      el.hidden = el.getAttribute('data-type-group') !== type;
    });
  }

  async function renderActivity(body, quotationId) {
    var host = body.querySelector('#quoteActivityList');
    if (!host) return;
    try {
      var rows = await PR.call('load quotation activity', function (sb) {
        return sb.from('quotation_audit_log').select('*').eq('quotation_id', quotationId).order('created_at', { ascending: false });
      });
      host.innerHTML = rows.length ? rows.map(function (r) {
        var text = r.action === 'status_changed' ? ('Status changed ' + PR.esc(r.old_value || '') + ' → ' + PR.esc(r.new_value || '')) :
          r.action === 'created' ? 'Quotation created' :
          r.action === 'converted' ? ('Converted to order ' + PR.esc(r.new_value || '')) :
          PR.esc(r.new_value || 'Quotation edited');
        return '<div class="hint" style="padding:6px 0;border-bottom:1px solid #f1f1f1">' + text +
          ' <small>&middot; ' + PR.esc(r.admin_name_snapshot || '') + ', ' + PR.formatDate(r.created_at) + '</small></div>';
      }).join('') : '<p class="hint">No activity recorded yet.</p>';
    } catch (err) {
      host.innerHTML = '<p class="hint">Could not load activity.</p>';
    }
  }

  function detail(q, duplicateFrom) {
    var isNew = !q;
    var src = q || duplicateFrom || {};
    var editable = isNew || EDITABLE_STATUSES.indexOf(q.status) !== -1;
    var items = (duplicateFrom ? (duplicateFrom.quotation_items || []) : (q ? (q.quotation_items || []) : []))
      .slice().sort(function (a, b) { return a.sort_order - b.sort_order; });
    var customer = src.customer_id ? customers.filter(function (c) { return c.id === src.customer_id; })[0] : null;
    var type = src.quotation_type || 'customer';
    var validDays = src.valid_days || (quoteDefaults.valid_days || 15);
    var currentAuthId = PRA.session && PRA.session.user && PRA.session.user.id;
    var currentStaffRow = currentAuthId ? staff.filter(function (s) { return s.user_id === currentAuthId; })[0] : null;
    var salesPersonDefault = src.sales_person || (isNew && currentStaffRow && currentStaffRow.id) || '';

    var body = PRA.openDrawer(q ? 'Quotation ' + (q.quote_number || '') : (duplicateFrom ? 'Duplicate Quotation' : 'New Quotation'),
      '<div id="quoteFormMessage"></div>' +
      (q ? '<div class="hint" style="margin-bottom:10px">Status: ' + PRA.pill(q.status) +
        (q.converted_order_id ? ' &middot; converted to an order' : '') + '</div>' : '') +

      (editable
        ? '<form id="quoteForm" class="form">' +
          '<div class="form-grid">' +
            '<label>Quotation Type<span class="req">*</span><div class="inline" style="gap:14px;display:flex">' +
              TYPES.map(function (t) {
                return '<label class="inline" style="font-weight:normal"><input type="radio" name="qf_type" value="' + t + '"' +
                  (type === t ? ' checked' : '') + '> ' + typeLabel(t) + '</label>';
              }).join('') + '</div></label>' +
            '<label>Sales Person<select id="qf_sales_person">' +
              '<option value="">Unassigned</option>' +
              staff.map(function (s) {
                return '<option value="' + PR.esc(s.id) + '"' + (salesPersonDefault === s.id ? ' selected' : '') + '>' + PR.esc(s.name) + '</option>';
              }).join('') + '</select></label>' +
          '</div>' +

          '<div class="form-grid">' +
            '<label>Customer <span class="req">*</span><select id="qf_customer" required>' +
              '<option value="">Select customer…</option>' +
              '<option value="__new__">+ Add New Customer</option>' +
              customers.map(function (c) {
                return '<option value="' + PR.esc(c.id) + '"' + (src.customer_id === c.id ? ' selected' : '') + '>' +
                  PR.esc(c.name) + ' (' + PR.esc(c.mobile || 'no mobile') + ')</option>';
              }).join('') + '</select></label>' +
            '<label>Valid For<select id="qf_valid_days">' +
              [7, 15, 30].map(function (d) { return '<option value="' + d + '"' + (validDays === d ? ' selected' : '') + '>' + d + ' Days</option>'; }).join('') +
              '<option value="custom"' + ([7, 15, 30].indexOf(validDays) === -1 ? ' selected' : '') + '>Custom</option>' +
            '</select></label>' +
          '</div>' +
          '<div id="qf_new_customer_fields" hidden>' +
            '<div class="form-grid three">' +
              '<label>New Customer Name <span class="req">*</span><input id="nc_name" maxlength="120"></label>' +
              '<label>Mobile<input id="nc_mobile" maxlength="10"></label>' +
              '<label>Email<input id="nc_email" type="email" maxlength="160"></label>' +
            '</div>' +
            '<div class="form-grid three">' +
              '<label>Address<input id="nc_address" maxlength="200"></label>' +
              '<label>City<input id="nc_city" maxlength="80"></label>' +
              '<label>State<select id="nc_state"></select></label>' +
            '</div>' +
            '<label>Pincode<input id="nc_pincode" maxlength="6" style="max-width:160px"></label>' +
          '</div>' +
          '<div class="form-grid">' +
            '<label>Company Name<input id="qf_company" maxlength="160" value="' + PR.esc(src.company_name || (customer && customer.company_name) || '') + '"></label>' +
            '<label>Contact Person<input id="qf_contact" maxlength="120" value="' + PR.esc(src.contact_person || (customer && customer.contact_person) || '') + '"></label>' +
          '</div>' +
          '<div class="form-grid">' +
            '<label>GSTIN<input id="qf_gstin" maxlength="20" value="' + PR.esc(src.gstin || (customer && customer.gstin) || '') + '"></label>' +
            '<label>Valid Until<input id="qf_valid_until" type="date" value="' + PR.esc((q && q.valid_until) || '') + '"></label>' +
          '</div>' +

          '<label class="inline"><input type="checkbox" id="qf_ship_same"' +
            (src.shipping_address && customer && src.shipping_address !== customer.address ? '' : ' checked') +
            '> Shipping address same as billing</label>' +
          '<div id="qf_ship_fields"' +
            (src.shipping_address && customer && src.shipping_address !== customer.address ? '' : ' hidden') +
            ' class="form-grid">' +
            '<label>Shipping Address<input id="qf_ship_address" value="' + PR.esc(src.shipping_address || (customer && customer.shipping_address) || '') + '"></label>' +
            '<label>Shipping City<input id="qf_ship_city" value="' + PR.esc(src.shipping_city || (customer && customer.shipping_city) || '') + '"></label>' +
          '</div>' +

          '<div data-type-group="dealer" hidden>' +
            '<div class="stat-group-title">Dealer Details</div>' +
            '<div class="form-grid three">' +
              '<label>Dealer Discount %<input id="qf_dealer_discount" type="number" min="0" max="100" step="0.1" value="' + PR.esc(src.dealer_discount_percent || 0) + '"></label>' +
              '<label>Dealer Margin %<input id="qf_dealer_margin" type="number" min="0" max="100" step="0.1" value="' + PR.esc(src.dealer_margin_percent || 0) + '"></label>' +
              '<label>MOQ<input id="qf_moq" type="number" min="0" step="1" value="' + PR.esc(src.moq || '') + '"></label>' +
            '</div>' +
            '<div class="form-grid">' +
              '<label>Dealer Scheme<input id="qf_dealer_scheme" value="' + PR.esc(src.dealer_scheme || '') + '"></label>' +
              '<label>Credit Terms<input id="qf_credit_terms" value="' + PR.esc(src.credit_terms || '') + '"></label>' +
            '</div>' +
          '</div>' +

          '<div data-type-group="project" hidden>' +
            '<div class="stat-group-title">Project Details</div>' +
            '<div class="form-grid three">' +
              '<label>Project Name<input id="qf_project_name" value="' + PR.esc(src.project_name || '') + '"></label>' +
              '<label>Project Location<input id="qf_project_location" value="' + PR.esc(src.project_location || '') + '"></label>' +
              '<label>Client Name<input id="qf_client_name" value="' + PR.esc(src.client_name || '') + '"></label>' +
            '</div>' +
            '<div class="form-grid three">' +
              '<label>Consultant<input id="qf_consultant" value="' + PR.esc(src.consultant || '') + '"></label>' +
              '<label>Reference Number<input id="qf_reference_number" value="' + PR.esc(src.reference_number || '') + '"></label>' +
              '<label>Project Timeline<input id="qf_project_timeline" value="' + PR.esc(src.project_timeline || '') + '"></label>' +
            '</div>' +
            '<label>Scope of Work<textarea id="qf_scope_of_work" maxlength="2000">' + PR.esc(src.scope_of_work || '') + '</textarea></label>' +
            '<label>Delivery Schedule<input id="qf_delivery_schedule" value="' + PR.esc(src.delivery_schedule || '') + '"></label>' +
          '</div>' +

          '<div class="stat-group-title">Line Items</div>' +
          '<div class="table-scroll"><table class="grid"><thead><tr>' +
            '<th>Product</th><th>Qty</th><th>Unit Price ₹</th><th>Disc %</th><th>Line Total</th><th></th>' +
          '</tr></thead><tbody id="quoteItemRows">' +
            (items.length ? items.map(rowHtml).join('') : rowHtml({ quantity: 1, unit_price: 0 }, 0)) +
          '</tbody></table></div>' +
          '<div class="page-actions" style="justify-content:flex-start;margin-top:10px">' +
            '<button class="btn gray small" type="button" id="quoteAddRowBtn">+ Add Row</button>' +
          '</div>' +

          '<div class="stat-group-title">Pricing</div>' +
          '<div class="form-grid three">' +
            '<label>Shipping ₹<input id="qf_shipping" type="number" min="0" step="0.01" value="' + PR.esc(src.shipping_cost || 0) + '"></label>' +
            '<label>Freight ₹<input id="qf_freight" type="number" min="0" step="0.01" value="' + PR.esc(src.freight_cost || 0) + '"></label>' +
            '<label>Installation ₹<input id="qf_installation" type="number" min="0" step="0.01" value="' + PR.esc(src.installation_cost || 0) + '"></label>' +
          '</div>' +
          '<div class="form-grid">' +
            '<label>Other Charges ₹<input id="qf_other" type="number" step="0.01" value="' + PR.esc(src.other_charges || 0) + '"></label>' +
            '<label>Round Off ₹<input id="qf_roundoff" type="number" step="0.01" value="' + PR.esc(src.round_off || 0) + '"></label>' +
          '</div>' +

          '<div class="stat-group-title">Payment &amp; Delivery</div>' +
          '<div class="form-grid">' +
            '<label>Payment Terms<select id="qf_payment_preset">' +
              '<option value="">Select…</option>' +
              PAYMENT_PRESETS.map(function (p) { return '<option' + (src.payment_terms === p ? ' selected' : '') + '>' + PR.esc(p) + '</option>'; }).join('') +
              '<option value="custom"' + (src.payment_terms && PAYMENT_PRESETS.indexOf(src.payment_terms) === -1 ? ' selected' : '') + '>Custom</option>' +
            '</select></label>' +
            '<label>Custom Payment Terms<input id="qf_payment_custom" value="' +
              PR.esc(PAYMENT_PRESETS.indexOf(src.payment_terms) === -1 ? (src.payment_terms || '') : '') + '"></label>' +
          '</div>' +
          '<div class="form-grid three">' +
            '<label>Estimated Delivery<input id="qf_est_delivery" value="' + PR.esc(src.estimated_delivery || (quoteDefaults.delivery_terms || '')) + '"></label>' +
            '<label>Dispatch From<input id="qf_dispatch_from" value="' + PR.esc(src.dispatch_from || '') + '"></label>' +
            '<label>Transportation<input id="qf_transportation" value="' + PR.esc(src.transportation || '') + '"></label>' +
          '</div>' +
          '<div class="form-grid three">' +
            '<label>Freight Terms<select id="qf_freight_terms">' +
              '<option value="">—</option>' +
              '<option value="paid"' + (src.freight_terms === 'paid' ? ' selected' : '') + '>Paid</option>' +
              '<option value="to_pay"' + (src.freight_terms === 'to_pay' ? ' selected' : '') + '>To Pay</option>' +
            '</select></label>' +
            '<label class="inline"><input type="checkbox" id="qf_installation_included"' + (src.installation_included ? ' checked' : '') + '> Installation Included</label>' +
            '<label class="inline"><input type="checkbox" id="qf_commissioning_included"' + (src.commissioning_included ? ' checked' : '') + '> Commissioning Included</label>' +
          '</div>' +

          '<label>Warranty Terms<textarea id="qf_warranty" maxlength="2000">' +
            PR.esc(isNew && !duplicateFrom ? (quoteDefaults.warranty_terms || '') : (src.warranty_terms || '')) + '</textarea></label>' +
          '<label>Terms &amp; Conditions (standard)<textarea readonly style="background:#f6f7f9;color:#666">' +
            PR.esc(quoteDefaults.terms || 'No default set — add one in Settings → Quotation Settings.') + '</textarea>' +
            '<span class="hint">Fixed — edit the default in Settings → Quotation Settings.</span></label>' +
          '<label>Additional Terms (optional)<textarea id="qf_additional_terms" maxlength="2000">' +
            PR.esc(src.additional_terms || '') + '</textarea>' +
            '<span class="hint">Any extra notes for this specific quotation, shown below the standard terms.</span></label>' +

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
            '<button class="btn gray" type="button" id="duplicateQuoteBtn">Duplicate</button> ' +
            (q.customer_mobile ? '<button class="btn gray" type="button" id="whatsappQuoteBtn">Send via WhatsApp</button> ' : '') +
            (q.status === 'draft' ? '<button class="btn gray" type="button" data-set-status="sent">Mark Sent</button>' : '') +
            (q.status === 'sent' ? '<button class="btn gray" type="button" data-set-status="accepted">Mark Accepted</button> ' +
              '<button class="btn danger" type="button" data-set-status="rejected">Mark Rejected</button> ' +
              '<button class="btn gray" type="button" data-set-status="expired">Mark Expired</button>' : '') +
            (q.status === 'accepted' && !q.converted_order_id
              ? '<button class="btn orange" type="button" id="convertQuoteBtn">Convert to Order</button>' : '') +
            (q.converted_order_id
              ? '<a class="btn ghost" href="/admin/orders/?order=' + encodeURIComponent(q.converted_order_id) + '">View Order</a>' : '') +
          '</div>' +
          '<div class="stat-group-title" style="margin-top:18px">Activity</div>' +
          '<div id="quoteActivityList"><p class="hint">Loading…</p></div>'
        : ''));

    if (editable) {
      applyTypeVisibility(body);
      PR.fillStates(body.querySelector('#nc_state'));
      recompute(body);
      Array.prototype.forEach.call(body.querySelectorAll('input[name="qf_type"]'), function (r) {
        r.addEventListener('change', function () { applyTypeVisibility(body); });
      });
      body.addEventListener('input', function (e) {
        if (e.target.closest('#quoteItemRows, #qf_shipping, #qf_freight, #qf_installation, #qf_other, #qf_roundoff, #qf_customer')) recompute(body);
      });
      body.addEventListener('change', function (e) {
        var productSel = e.target.closest('.qi-product');
        if (productSel) {
          var product = products.filter(function (p) { return p.id === productSel.value; })[0];
          var tr = productSel.closest('tr');
          tr.querySelector('.qi-price').value = product ? product.price : 0;
          recompute(body);
          return;
        }
        if (e.target.closest('#qf_ship_same')) {
          body.querySelector('#qf_ship_fields').hidden = body.querySelector('#qf_ship_same').checked;
          return;
        }
        if (e.target.closest('#qf_valid_days')) {
          var sel = body.querySelector('#qf_valid_days').value;
          if (sel !== 'custom') {
            var d = new Date();
            d.setDate(d.getDate() + Number(sel));
            body.querySelector('#qf_valid_until').value = d.toISOString().slice(0, 10);
          }
          return;
        }
        if (e.target.closest('#qf_customer')) {
          var custVal = body.querySelector('#qf_customer').value;
          body.querySelector('#qf_new_customer_fields').hidden = custVal !== '__new__';
          var c = customers.filter(function (x) { return x.id === custVal; })[0];
          if (c) {
            body.querySelector('#qf_company').value = c.company_name || '';
            body.querySelector('#qf_contact').value = c.contact_person || '';
            body.querySelector('#qf_gstin').value = c.gstin || '';
          }
          recompute(body);
        }
      });

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

      if (!body.querySelector('#qf_valid_until').value) {
        var dd = new Date(); dd.setDate(dd.getDate() + Number(validDays === 'custom' ? 15 : validDays));
        body.querySelector('#qf_valid_until').value = dd.toISOString().slice(0, 10);
      }
    }

    body.addEventListener('click', function (e) {
      var statusBtn = e.target.closest('[data-set-status]');
      if (statusBtn) setStatus(q, statusBtn.getAttribute('data-set-status'), statusBtn);
    });
    var convertBtn = document.getElementById('convertQuoteBtn');
    if (convertBtn) convertBtn.addEventListener('click', function () { convertToOrder(q, convertBtn); });
    var dupBtn = document.getElementById('duplicateQuoteBtn');
    if (dupBtn) dupBtn.addEventListener('click', function () { PRA.closeDrawer(); detail(null, q); });
    var waBtn = document.getElementById('whatsappQuoteBtn');
    if (waBtn) waBtn.addEventListener('click', function () { sendWhatsApp(q); });
    if (q) renderActivity(body, q.id);

    return body;
  }

  function sendWhatsApp(q) {
    var digits = (q.customer_mobile || '').replace(/\D/g, '').slice(-10);
    if (digits.length !== 10) { PR.toast('This customer has no valid mobile number on file.', 'error'); return; }
    if (q.status === 'draft') { PR.toast('Pehle "Mark Sent" se quotation approve karein, phir WhatsApp bhejein.', 'error'); return; }
    var link = PR.config.SITE_URL + '/quote/?no=' + encodeURIComponent(q.quote_number || '') + '&mobile=' + digits;
    var message = 'Dear ' + (q.customer_name || 'Customer') + ',\n' +
      'Thank you for your interest in PowerRun Industries.\n' +
      'Please find your quotation:\n' +
      'Quotation No: ' + (q.quote_number || '') + '\n' +
      'Total Amount: ' + PR.money(q.total_amount) + '\n' +
      (q.valid_until ? ('Valid Until: ' + PR.formatDate(q.valid_until) + '\n') : '') +
      'View / download: ' + link + '\n' +
      'Regards,\nPowerRun Industries';
    window.open('https://wa.me/91' + digits + '?text=' + encodeURIComponent(message), '_blank', 'noopener');
  }

  async function save(event, existing, body) {
    event.preventDefault();
    var button = document.getElementById('saveQuoteBtn');
    var messageHost = document.getElementById('quoteFormMessage');
    messageHost.innerHTML = '';

    var customerId = document.getElementById('qf_customer').value;
    var customer = customers.filter(function (c) { return c.id === customerId; })[0];
    if (!customerId) { PR.toast('Please select a customer.', 'error'); return; }

    if (customerId === '__new__') {
      var newName = document.getElementById('nc_name').value.trim();
      if (!newName) { PR.toast('Please enter the new customer’s name.', 'error'); return; }
      PR.setBusy(button, true, 'SAVING…');
      try {
        var createdCustomer = await PR.call('create customer', function (sb) {
          return sb.from('customers').insert({
            name: newName,
            mobile: document.getElementById('nc_mobile').value.trim() || null,
            email: document.getElementById('nc_email').value.trim() || null,
            address: document.getElementById('nc_address').value.trim() || null,
            city: document.getElementById('nc_city').value.trim() || null,
            state: document.getElementById('nc_state').value || null,
            pincode: document.getElementById('nc_pincode').value.trim() || null,
            customer_type: 'retail'
          }).select('*').single();
        });
        customers.push(createdCustomer);
        customerId = createdCustomer.id;
        customer = createdCustomer;
      } catch (err) {
        PR.setBusy(button, false);
        messageHost.innerHTML = '<div class="form-message error" role="alert">' + PR.esc(err.message) + '</div>';
        PR.toast(err.message, 'error');
        return;
      }
    }
    if (!customer) { PR.toast('Please select a customer.', 'error'); return; }

    var items = readItems(body.querySelector('#quoteItemRows'));
    if (!items.length) { PR.toast('Add at least one product line.', 'error'); return; }

    var typeChecked = body.querySelector('input[name="qf_type"]:checked');
    var quotationType = typeChecked ? typeChecked.value : 'customer';
    var shipSame = document.getElementById('qf_ship_same').checked;
    var paymentPreset = document.getElementById('qf_payment_preset').value;
    var paymentTerms = paymentPreset === 'custom' ? document.getElementById('qf_payment_custom').value.trim() :
      (paymentPreset || null);
    var validDaysSel = document.getElementById('qf_valid_days').value;

    var pricing = headerPricingFromForm(body);
    var totals = computeTotals(items, pricing, customer.state);

    PR.setBusy(button, true, 'SAVING…');
    try {
      var quoteNumber = existing && existing.quote_number;
      if (!quoteNumber) {
        quoteNumber = await PR.call('generate quote number', function (sb) { return sb.rpc('admin_next_quote_number'); });
      }

      var header = Object.assign({
        quote_number: quoteNumber,
        quotation_type: quotationType,
        sales_person: document.getElementById('qf_sales_person').value || null,
        customer_id: customerId,
        customer_name: customer.name,
        customer_mobile: customer.mobile,
        customer_email: customer.email,
        address: customer.address, city: customer.city, state: customer.state, pincode: customer.pincode,
        company_name: document.getElementById('qf_company').value.trim() || null,
        contact_person: document.getElementById('qf_contact').value.trim() || null,
        gstin: document.getElementById('qf_gstin').value.trim().toUpperCase() || null,
        customer_type: customer.customer_type || 'retail',
        shipping_address: shipSame ? customer.address : document.getElementById('qf_ship_address').value.trim() || null,
        shipping_city: shipSame ? customer.city : document.getElementById('qf_ship_city').value.trim() || null,
        shipping_state: shipSame ? customer.state : null,
        shipping_pincode: shipSame ? customer.pincode : null,
        valid_until: document.getElementById('qf_valid_until').value || null,
        valid_days: validDaysSel === 'custom' ? null : Number(validDaysSel),
        payment_terms: paymentTerms,
        estimated_delivery: document.getElementById('qf_est_delivery').value.trim() || null,
        dispatch_from: document.getElementById('qf_dispatch_from').value.trim() || null,
        transportation: document.getElementById('qf_transportation').value.trim() || null,
        freight_terms: document.getElementById('qf_freight_terms').value || null,
        installation_included: document.getElementById('qf_installation_included').checked,
        commissioning_included: document.getElementById('qf_commissioning_included').checked,
        warranty_terms: document.getElementById('qf_warranty').value.trim() || null,
        terms: quoteDefaults.terms || null,
        additional_terms: document.getElementById('qf_additional_terms').value.trim() || null,
        place_of_supply: customer.state || null,
        dealer_discount_percent: quotationType === 'dealer' ? (Number(document.getElementById('qf_dealer_discount').value) || 0) : null,
        dealer_margin_percent: quotationType === 'dealer' ? (Number(document.getElementById('qf_dealer_margin').value) || 0) : null,
        moq: quotationType === 'dealer' ? (Number(document.getElementById('qf_moq').value) || null) : null,
        dealer_scheme: quotationType === 'dealer' ? (document.getElementById('qf_dealer_scheme').value.trim() || null) : null,
        credit_terms: quotationType === 'dealer' ? (document.getElementById('qf_credit_terms').value.trim() || null) : null,
        project_name: quotationType === 'project' ? (document.getElementById('qf_project_name').value.trim() || null) : null,
        project_location: quotationType === 'project' ? (document.getElementById('qf_project_location').value.trim() || null) : null,
        client_name: quotationType === 'project' ? (document.getElementById('qf_client_name').value.trim() || null) : null,
        consultant: quotationType === 'project' ? (document.getElementById('qf_consultant').value.trim() || null) : null,
        reference_number: quotationType === 'project' ? (document.getElementById('qf_reference_number').value.trim() || null) : null,
        scope_of_work: quotationType === 'project' ? (document.getElementById('qf_scope_of_work').value.trim() || null) : null,
        project_timeline: quotationType === 'project' ? (document.getElementById('qf_project_timeline').value.trim() || null) : null,
        delivery_schedule: quotationType === 'project' ? (document.getElementById('qf_delivery_schedule').value.trim() || null) : null
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
          discount_percent: m.discount_percent, discount_amount: m.discount_amount,
          taxable_amount: m.taxable, gst_amount: m.gst, total_price: m.total
        });
      });
      await PR.call('save quotation items', function (sb) { return sb.from('quotation_items').insert(itemRows); });

      await writeAudit(quotationId, existing ? 'edited' : 'created', null,
        existing ? ('Updated — new total ' + PR.money(totals.total_amount)) : ('Total ' + PR.money(totals.total_amount)));

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
      await writeAudit(q.id, 'status_changed', q.status, status);
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
      await writeAudit(q.id, 'converted', null, result.order_number);
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
