/* Admin - Profit & Loss Calculator.
 *
 * Six tabs, all admin-only (RLS on calc_* tables allows no anon/customer access
 * at all, see sql/14_profit_loss_calculator.sql):
 *   Overview          dashboard stats + recent calculations
 *   Calculations      full history, search/filter/pagination, the calculator itself
 *   Default Settings  purchase/selling defaults (site_settings.calc_defaults)
 *   GST Rates         calc_gst_rates CRUD
 *   Selling Channels  calc_selling_channels CRUD
 *   Target Margins    calc_target_margins CRUD
 *
 * Every settings change (defaults / GST / channels / targets) writes rows to
 * calc_audit_log so there is a record of who changed what, from what, to what.
 */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var state = { tab: 'overview', page: 1, pageSize: 20, search: '', filterProduct: '', filterLoss: '', filterChannel: '', filterMinProfit: '', filterFrom: '', filterTo: '' };
  var host = null;

  var data = { products: [], channels: [], gstRates: [], targets: [], history: [], defaults: {} };
  var editingChannel = null;
  var editingGstRate = null;
  var editingTarget = null;

  /* ------------------------------------------------------------------ data */
  async function loadAll() {
    var results = await Promise.all([
      PR.call('load products', function (sb) {
        return sb.from('products')
          .select('id,name,sku,price,mrp,gst_rate,purchase_cost,purchase_gst_rate,default_freight,default_packaging_cost,default_other_cost')
          .eq('is_active', true).order('name');
      }),
      PR.call('load selling channels', function (sb) {
        return sb.from('calc_selling_channels').select('*').order('sort_order').order('name');
      }),
      PR.call('load gst rates', function (sb) {
        return sb.from('calc_gst_rates').select('*').order('sort_order');
      }),
      PR.call('load target margins', function (sb) {
        return sb.from('calc_target_margins').select('*').order('sort_order');
      }),
      PR.call('load calculation history', function (sb) {
        return sb.from('calc_history').select('*').order('created_at', { ascending: false });
      }),
      PR.call('load calc defaults', function (sb) {
        return sb.from('site_settings').select('value').eq('key', 'calc_defaults').maybeSingle();
      })
    ]);
    data.products = results[0] || [];
    data.channels = results[1] || [];
    data.gstRates = results[2] || [];
    data.targets = results[3] || [];
    data.history = results[4] || [];
    data.defaults = (results[5] && results[5].value) || {};
  }

  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function num(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }

  /* -------------------------------------------------------------- formulas
   * Follows the same GST convention as create_website_order() in
   * sql/09_gst_and_discount.sql: a rate is applied to a GST-inclusive price,
   * and the taxable value is separated from the GST portion. */
  function computeResult(i) {
    var qty = Math.max(1, num(i.quantity) || 1);

    var landedPerUnit = num(i.purchase_price)
      + num(i.purchase_price) * num(i.purchase_gst_rate) / 100
      + num(i.freight) + num(i.packaging_cost) + num(i.loading_unloading)
      + num(i.labour_cost) + num(i.manufacturing_cost)
      + num(i.warranty_provision) + num(i.other_purchase_cost);

    var sellingNet = Math.max(0, num(i.selling_price) - num(i.discount));
    var salesGst = num(i.sales_gst_rate);
    var netSalesPerUnit = salesGst > 0 ? sellingNet / (1 + salesGst / 100) : sellingNet;

    var pctExpenseRate = (num(i.commission_pct) + num(i.payment_gateway_pct) +
      num(i.dealer_commission_pct) + num(i.rto_provision_pct)) / 100;
    var pctExpensePerUnit = num(i.selling_price) * pctExpenseRate;
    var flatExpensePerUnit = num(i.shipping_cost) + num(i.cod_charge) + num(i.marketing_cost) + num(i.other_selling_cost);
    var expensesPerUnit = pctExpensePerUnit + flatExpensePerUnit;

    var grossProfitPerUnit = netSalesPerUnit - landedPerUnit;
    var netProfitPerUnit = grossProfitPerUnit - expensesPerUnit;
    var totalCostPerUnit = landedPerUnit + expensesPerUnit;

    var profitPercent = totalCostPerUnit > 0 ? (netProfitPerUnit / totalCostPerUnit) * 100 : 0;
    var marginPercent = netSalesPerUnit > 0 ? (netProfitPerUnit / netSalesPerUnit) * 100 : 0;
    var roiPercent = landedPerUnit > 0 ? (netProfitPerUnit / landedPerUnit) * 100 : 0;

    var gstFraction = salesGst > 0 ? (salesGst / 100) / (1 + salesGst / 100) : 0;
    var denom = 1 - pctExpenseRate - gstFraction;
    var breakeven = denom > 0.0001 ? (landedPerUnit + flatExpensePerUnit) / denom : 0;

    return {
      total_landed_cost: round2(landedPerUnit),
      net_sales: round2(netSalesPerUnit),
      total_cost: round2(totalCostPerUnit * qty),
      total_sales: round2(netSalesPerUnit * qty),
      gross_profit: round2(grossProfitPerUnit * qty),
      net_profit: round2(netProfitPerUnit * qty),
      profit_per_unit: round2(netProfitPerUnit),
      profit_percent: round2(profitPercent),
      margin_percent: round2(marginPercent),
      roi_percent: round2(roiPercent),
      breakeven_price: round2(breakeven)
    };
  }

  /* Selling price needed to hit a target Profit % (net profit / total cost).
   * Closed-form solve of the same model above, discount ignored (this answers
   * "what price should I set", not "what if I discount this price"). */
  function requiredSellingPrice(i, targetPercent) {
    var T = num(targetPercent) / 100;
    var landedPerUnit = num(i.purchase_price)
      + num(i.purchase_price) * num(i.purchase_gst_rate) / 100
      + num(i.freight) + num(i.packaging_cost) + num(i.loading_unloading)
      + num(i.labour_cost) + num(i.manufacturing_cost)
      + num(i.warranty_provision) + num(i.other_purchase_cost);
    var flatExpense = num(i.shipping_cost) + num(i.cod_charge) + num(i.marketing_cost) + num(i.other_selling_cost);
    var pctExpenseRate = (num(i.commission_pct) + num(i.payment_gateway_pct) +
      num(i.dealer_commission_pct) + num(i.rto_provision_pct)) / 100;
    var salesGst = num(i.sales_gst_rate);
    var gstFraction = salesGst > 0 ? (salesGst / 100) / (1 + salesGst / 100) : 0;

    var denom = (1 - gstFraction - pctExpenseRate) - T * pctExpenseRate;
    if (denom <= 0.0001) return 0;
    return round2((1 + T) * (landedPerUnit + flatExpense) / denom);
  }

  /* ------------------------------------------------------------------- audit */
  async function logAudit(settingType, changes) {
    if (!changes.length) return;
    var adminName = (PRA.admin && PRA.admin.name) ||
      (PRA.session && PRA.session.user && PRA.session.user.email) || 'Admin';
    var uid = PRA.session && PRA.session.user && PRA.session.user.id;
    var rows = changes.map(function (c) {
      return {
        admin_user_id: uid, admin_name_snapshot: adminName, setting_type: settingType,
        setting_label: c.label,
        old_value: c.oldValue === null || c.oldValue === undefined ? '' : String(c.oldValue),
        new_value: c.newValue === null || c.newValue === undefined ? '' : String(c.newValue)
      };
    });
    try {
      await PR.call('write audit log', function (sb) { return sb.from('calc_audit_log').insert(rows); });
    } catch (err) { console.error('[PowerRun] calculator audit log failed:', err); }
  }

  function diffFields(oldObj, newObj, labels) {
    var changes = [];
    Object.keys(labels).forEach(function (key) {
      var oldV = oldObj ? oldObj[key] : undefined;
      var newV = newObj[key];
      if (String(oldV == null ? '' : oldV) !== String(newV == null ? '' : newV)) {
        changes.push({ label: labels[key], oldValue: oldV, newValue: newV });
      }
    });
    return changes;
  }

  /* ------------------------------------------------------------------ tabs */
  var TABS = [
    ['overview', 'Overview'], ['calculations', 'Calculations'], ['defaults', 'Default Settings'],
    ['gst', 'GST Rates'], ['channels', 'Selling Channels'], ['targets', 'Target Margins']
  ];

  function render() {
    host.innerHTML =
      '<div class="tabs-row">' + TABS.map(function (t) {
        return '<button class="tab-btn' + (state.tab === t[0] ? ' active' : '') + '" type="button" data-tab="' +
          t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>' +
      (state.tab === 'overview' ? overviewTab()
        : state.tab === 'calculations' ? calculationsTab()
        : state.tab === 'defaults' ? defaultsTab()
        : state.tab === 'gst' ? gstTab()
        : state.tab === 'channels' ? channelsTab()
        : targetsTab());

    host.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () { state.tab = btn.getAttribute('data-tab'); render(); });
    });

    if (state.tab === 'overview') bindOverview();
    if (state.tab === 'calculations') bindCalculations();
    if (state.tab === 'defaults') bindDefaults();
    if (state.tab === 'gst') bindGst();
    if (state.tab === 'channels') bindChannels();
    if (state.tab === 'targets') bindTargets();
  }

  /* ---------------------------------------------------------------- overview */
  function overviewStats() {
    var rows = data.history;
    var now = new Date();
    var thisMonth = rows.filter(function (r) {
      var d = new Date(r.created_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    var products = {};
    rows.forEach(function (r) { if (r.product_id) products[r.product_id] = true; });
    var profitRows = rows.filter(function (r) { return !r.is_loss; });
    var lossRows = rows.filter(function (r) { return r.is_loss; });
    var avg = function (list, key) {
      if (!list.length) return 0;
      return list.reduce(function (s, r) { return s + num(r[key]); }, 0) / list.length;
    };

    return {
      total: rows.length,
      thisMonth: thisMonth.length,
      products: Object.keys(products).length,
      avgProfitPercent: round2(avg(rows, 'profit_percent')),
      avgMarginPercent: round2(avg(rows, 'margin_percent')),
      totalProfit: round2(profitRows.reduce(function (s, r) { return s + num(r.net_profit); }, 0)),
      totalLoss: round2(Math.abs(lossRows.reduce(function (s, r) { return s + num(r.net_profit); }, 0)))
    };
  }

  function overviewTab() {
    var s = overviewStats();
    var recent = data.history.slice(0, 10);
    return '<div class="panel">' +
        '<div class="panel-head"><h2>Overview</h2>' +
          '<button class="btn" type="button" id="ovNewCalcBtn">+ New Calculation</button></div>' +
        '<div class="stats">' +
          stat('Total Calculations', s.total) +
          stat('This Month', s.thisMonth) +
          stat('Products Calculated', s.products) +
          stat('Avg Profit %', s.avgProfitPercent + '%') +
          stat('Avg Margin %', s.avgMarginPercent + '%') +
          stat('Total Estimated Profit', PR.money(s.totalProfit), 'good') +
          stat('Total Estimated Loss', PR.money(s.totalLoss), s.totalLoss > 0 ? 'bad' : '') +
        '</div>' +
      '</div>' +
      '<div class="panel">' +
        '<div class="panel-head"><h2>Recent Calculations</h2></div>' +
        (recent.length ? historyTable(recent) : PRA.empty('No calculations yet', 'Run your first Profit & Loss calculation to see it here.')) +
      '</div>';
  }

  function stat(label, value, cls) {
    return '<div class="stat' + (cls ? ' ' + cls : '') + '"><small>' + PR.esc(label) + '</small><strong>' + value + '</strong></div>';
  }

  function bindOverview() {
    var btn = document.getElementById('ovNewCalcBtn');
    if (btn) btn.addEventListener('click', function () { openCalcForm(null, 'new'); });
  }

  /* ------------------------------------------------------------ calculations */
  function historyTable(rows) {
    return '<div class="table-scroll"><table class="grid"><thead><tr>' +
      '<th>Date</th><th>Product</th><th>Qty</th><th>Purchase Cost</th><th>Selling Price</th>' +
      '<th>Profit/Loss</th><th>Margin</th><th>User</th><th></th>' +
    '</tr></thead><tbody>' +
    rows.map(function (r) {
      var lossy = r.is_loss;
      return '<tr>' +
        '<td class="nowrap">' + PR.formatDate(r.created_at) + '</td>' +
        '<td><b>' + PR.esc(r.product_name_snapshot || 'Ad-hoc') + '</b>' +
          (r.sku_snapshot ? '<small>' + PR.esc(r.sku_snapshot) + '</small>' : '') + '</td>' +
        '<td>' + PR.esc(r.quantity) + '</td>' +
        '<td class="nowrap">' + PR.money(r.purchase_price) + '</td>' +
        '<td class="nowrap">' + PR.money(r.selling_price) + '</td>' +
        '<td class="nowrap" style="color:' + (lossy ? 'var(--red)' : 'var(--green)') + ';font-weight:800">' +
          PR.money(r.net_profit) + '</td>' +
        '<td>' + PR.esc(r.margin_percent) + '%</td>' +
        '<td>' + PR.esc(r.created_by_name || '-') + '</td>' +
        '<td class="nowrap">' +
          '<button class="btn ghost small" type="button" data-calc-view="' + PR.esc(r.id) + '">View</button> ' +
          '<button class="btn ghost small" type="button" data-calc-edit="' + PR.esc(r.id) + '">Edit</button> ' +
          '<button class="btn gray small" type="button" data-calc-dup="' + PR.esc(r.id) + '">Duplicate</button> ' +
          '<button class="btn danger small" type="button" data-calc-del="' + PR.esc(r.id) + '">Delete</button>' +
        '</td>' +
      '</tr>';
    }).join('') +
    '</tbody></table></div>';
  }

  function filteredHistory() {
    var q = state.search.trim().toLowerCase();
    return data.history.filter(function (r) {
      if (q) {
        var hay = [r.product_name_snapshot, r.sku_snapshot, r.created_by_name, r.calc_number]
          .filter(Boolean).join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      if (state.filterProduct && String(r.product_id) !== state.filterProduct) return false;
      if (state.filterLoss === 'profit' && r.is_loss) return false;
      if (state.filterLoss === 'loss' && !r.is_loss) return false;
      if (state.filterChannel && String(r.selling_channel_id) !== state.filterChannel) return false;
      if (state.filterMinProfit !== '' && num(r.profit_percent) < num(state.filterMinProfit)) return false;
      if (state.filterFrom && r.created_at < state.filterFrom) return false;
      if (state.filterTo && r.created_at > state.filterTo + 'T23:59:59') return false;
      return true;
    });
  }

  function historyProductOptions() {
    var seen = {};
    var out = [];
    data.history.forEach(function (r) {
      if (!r.product_id || seen[r.product_id]) return;
      seen[r.product_id] = true;
      out.push({ id: r.product_id, name: r.product_name_snapshot, sku: r.sku_snapshot });
    });
    out.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    return out;
  }

  function calculationsTab() {
    var all = filteredHistory();
    var totalPages = Math.max(1, Math.ceil(all.length / state.pageSize));
    state.page = Math.min(state.page, totalPages);
    var pageRows = all.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);

    return '<div class="panel">' +
        '<div class="panel-head"><h2>Calculations</h2>' +
          '<div class="page-actions">' +
            '<button class="btn ghost" type="button" id="exportCsvBtn">Export CSV</button>' +
            '<button class="btn ghost" type="button" id="exportExcelBtn">Export Excel</button>' +
            '<button class="btn ghost" type="button" id="exportPdfBtn">Export PDF</button>' +
            '<button class="btn ghost" type="button" id="printBtn">Print</button>' +
            '<button class="btn" type="button" id="newCalcBtn">+ New Calculation</button>' +
          '</div>' +
        '</div>' +
        '<div class="toolbar">' +
          '<input type="search" id="calcSearch" placeholder="Search user or calc #…" value="' + PR.esc(state.search) + '">' +
          '<select id="calcProductFilter"><option value="">All products / SKUs</option>' +
            historyProductOptions().map(function (p) {
              return '<option value="' + PR.esc(p.id) + '"' + (state.filterProduct === p.id ? ' selected' : '') + '>' +
                PR.esc(p.name) + (p.sku ? ' (' + PR.esc(p.sku) + ')' : '') + '</option>';
            }).join('') +
          '</select>' +
          '<select id="calcLossFilter">' +
            '<option value="">Profit &amp; Loss</option>' +
            '<option value="profit"' + (state.filterLoss === 'profit' ? ' selected' : '') + '>Profit only</option>' +
            '<option value="loss"' + (state.filterLoss === 'loss' ? ' selected' : '') + '>Loss only</option>' +
          '</select>' +
          '<select id="calcChannelFilter"><option value="">All channels</option>' +
            data.channels.map(function (c) {
              return '<option value="' + PR.esc(c.id) + '"' + (state.filterChannel === c.id ? ' selected' : '') + '>' + PR.esc(c.name) + '</option>';
            }).join('') +
          '</select>' +
          '<input type="number" id="calcMinProfit" placeholder="Min profit %" style="width:130px" value="' + PR.esc(state.filterMinProfit) + '">' +
          '<input type="date" id="calcFrom" value="' + PR.esc(state.filterFrom) + '" aria-label="From date">' +
          '<input type="date" id="calcTo" value="' + PR.esc(state.filterTo) + '" aria-label="To date">' +
          '<span class="count">' + all.length + ' shown</span>' +
        '</div>' +
        (pageRows.length ? historyTable(pageRows) : PRA.empty('No calculations match', 'Try clearing a filter, or run a new calculation.')) +
        (totalPages > 1
          ? '<div class="page-actions" style="justify-content:center;margin-top:14px">' +
              '<button class="btn gray small" type="button" id="calcPrevBtn"' + (state.page <= 1 ? ' disabled' : '') + '>&larr; Prev</button>' +
              '<span class="hint" style="margin:0 6px">Page ' + state.page + ' of ' + totalPages + '</span>' +
              '<button class="btn gray small" type="button" id="calcNextBtn"' + (state.page >= totalPages ? ' disabled' : '') + '>Next &rarr;</button>' +
            '</div>'
          : '') +
      '</div>';
  }

  function bindCalculations() {
    ['newCalcBtn'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', function () { openCalcForm(null, 'new'); });
    });
    document.getElementById('calcSearch').addEventListener('input', function (e) {
      state.search = e.target.value; state.page = 1; render();
    });
    document.getElementById('calcProductFilter').addEventListener('change', function (e) {
      state.filterProduct = e.target.value; state.page = 1; render();
    });
    document.getElementById('calcLossFilter').addEventListener('change', function (e) {
      state.filterLoss = e.target.value; state.page = 1; render();
    });
    document.getElementById('calcChannelFilter').addEventListener('change', function (e) {
      state.filterChannel = e.target.value; state.page = 1; render();
    });
    document.getElementById('calcMinProfit').addEventListener('input', function (e) {
      state.filterMinProfit = e.target.value; state.page = 1; render();
    });
    document.getElementById('calcFrom').addEventListener('change', function (e) {
      state.filterFrom = e.target.value; state.page = 1; render();
    });
    document.getElementById('calcTo').addEventListener('change', function (e) {
      state.filterTo = e.target.value; state.page = 1; render();
    });
    var prev = document.getElementById('calcPrevBtn');
    if (prev) prev.addEventListener('click', function () { state.page--; render(); });
    var next = document.getElementById('calcNextBtn');
    if (next) next.addEventListener('click', function () { state.page++; render(); });

    document.getElementById('exportCsvBtn').addEventListener('click', function () { exportCsv(filteredHistory()); });
    document.getElementById('exportExcelBtn').addEventListener('click', function () { exportExcel(filteredHistory()); });
    document.getElementById('exportPdfBtn').addEventListener('click', function () { exportPdf(filteredHistory()); });
    document.getElementById('printBtn').addEventListener('click', function () { printRows(filteredHistory()); });
  }

  /* ----------------------------------------------------------- calc drawer */
  function blankInputs() {
    var d = data.defaults;
    var gstDefault = (data.gstRates.filter(function (g) { return g.is_default; })[0] || {}).rate || 18;
    var channelDefault = data.channels.filter(function (c) { return c.is_default; })[0];
    return {
      product_id: '', quantity: 1, selling_channel_id: channelDefault ? channelDefault.id : '',
      purchase_price: 0, purchase_gst_rate: d.purchase_gst_rate != null ? d.purchase_gst_rate : gstDefault,
      freight: d.freight || 0, packaging_cost: d.packaging_cost || 0, loading_unloading: d.loading_unloading || 0,
      labour_cost: d.labour_cost || 0, manufacturing_cost: d.manufacturing_cost || 0,
      warranty_provision: d.warranty_provision || 0, other_purchase_cost: d.other_purchase_cost || 0,
      selling_price: 0, discount: 0, sales_gst_rate: d.sales_gst_rate != null ? d.sales_gst_rate : gstDefault,
      commission_pct: channelDefault ? channelDefault.commission_pct : (d.commission_pct || 0),
      payment_gateway_pct: channelDefault ? channelDefault.payment_gateway_pct : (d.payment_gateway_pct || 0),
      dealer_commission_pct: d.dealer_commission_pct || 0,
      shipping_cost: channelDefault ? channelDefault.shipping_cost : (d.shipping_cost || 0),
      cod_charge: channelDefault ? channelDefault.cod_fee : (d.cod_charge || 0),
      marketing_cost: d.marketing_cost || 0, rto_provision_pct: d.rto_provision_pct || 0,
      other_selling_cost: channelDefault ? (num(channelDefault.fixed_fee) + num(channelDefault.other_charges)) : (d.other_selling_cost || 0),
      notes: ''
    };
  }

  function inputsFromRow(row) {
    return {
      product_id: row.product_id || '', quantity: row.quantity,
      selling_channel_id: row.selling_channel_id || '',
      purchase_price: row.purchase_price, purchase_gst_rate: row.purchase_gst_rate,
      freight: row.freight, packaging_cost: row.packaging_cost, loading_unloading: row.loading_unloading,
      labour_cost: row.labour_cost, manufacturing_cost: row.manufacturing_cost,
      warranty_provision: row.warranty_provision, other_purchase_cost: row.other_purchase_cost,
      selling_price: row.selling_price, discount: row.discount, sales_gst_rate: row.sales_gst_rate,
      commission_pct: row.commission_pct, payment_gateway_pct: row.payment_gateway_pct,
      dealer_commission_pct: row.dealer_commission_pct, shipping_cost: row.shipping_cost,
      cod_charge: row.cod_charge, marketing_cost: row.marketing_cost, rto_provision_pct: row.rto_provision_pct,
      other_selling_cost: row.other_selling_cost, notes: row.notes || ''
    };
  }

  function numField(id, label, value, opts) {
    opts = opts || {};
    return '<label>' + PR.esc(label) +
      '<input id="' + id + '" type="number" min="0" step="' + (opts.step || '0.01') + '" value="' + PR.esc(value == null ? 0 : value) + '"></label>';
  }

  function gstSelect(id, value) {
    return '<select id="' + id + '">' +
      data.gstRates.map(function (g) {
        return '<option value="' + g.rate + '"' + (Number(value) === Number(g.rate) ? ' selected' : '') + '>' +
          PR.esc(g.label || (g.rate + '%')) + '</option>';
      }).join('') + '</select>';
  }

  function resultPanelHtml(result) {
    var lossy = result.net_profit < 0;
    var row = function (label, value, big) {
      return '<div class="calc-result-row' + (big ? ' big' : '') + '"><span>' + PR.esc(label) + '</span><b>' + value + '</b></div>';
    };
    return '<div class="calc-result' + (lossy ? ' loss' : ' profit') + '" id="calcResultPanel">' +
      '<div class="calc-result-title">' + (lossy ? 'LOSS' : 'PROFIT') + '</div>' +
      row('Total Landed Cost / unit', PR.money2(result.total_landed_cost)) +
      row('Net Sales / unit', PR.money2(result.net_sales)) +
      row('Total Cost (all units)', PR.money2(result.total_cost)) +
      row('Total Sales (all units)', PR.money2(result.total_sales)) +
      row('Gross Profit', PR.money2(result.gross_profit)) +
      row('Net Profit', PR.money2(result.net_profit), true) +
      row('Profit / unit', PR.money2(result.profit_per_unit)) +
      row('Profit %', result.profit_percent + '%') +
      row('Margin %', result.margin_percent + '%') +
      row('ROI %', result.roi_percent + '%') +
      row('Break-even Price', PR.money2(result.breakeven_price)) +
    '</div>';
  }

  function targetPriceTableHtml(inputs) {
    if (!data.targets.length) return '';
    return '<div class="hint" style="margin:10px 0 4px;font-weight:800">Required Selling Price by Target Profit %</div>' +
      '<div class="table-scroll"><table class="grid"><thead><tr><th>Target</th><th>Required Selling Price</th></tr></thead><tbody>' +
      data.targets.map(function (t) {
        return '<tr><td>' + PR.esc(t.label || (t.percent + '%')) + '</td><td>' +
          PR.money2(requiredSellingPrice(inputs, t.percent)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function readInputsFromForm() {
    var get = function (id) { var el = document.getElementById(id); return el ? el.value : ''; };
    return {
      product_id: get('cf_product'), quantity: Number(get('cf_qty')) || 1,
      selling_channel_id: get('cf_channel'),
      purchase_price: Number(get('cf_purchase_price')) || 0, purchase_gst_rate: Number(get('cf_purchase_gst')) || 0,
      freight: Number(get('cf_freight')) || 0, packaging_cost: Number(get('cf_packaging')) || 0,
      loading_unloading: Number(get('cf_loading')) || 0, labour_cost: Number(get('cf_labour')) || 0,
      manufacturing_cost: Number(get('cf_manufacturing')) || 0, warranty_provision: Number(get('cf_warranty_prov')) || 0,
      other_purchase_cost: Number(get('cf_other_purchase')) || 0,
      selling_price: Number(get('cf_selling_price')) || 0, discount: Number(get('cf_discount')) || 0,
      sales_gst_rate: Number(get('cf_sales_gst')) || 0, commission_pct: Number(get('cf_commission')) || 0,
      payment_gateway_pct: Number(get('cf_pg')) || 0, dealer_commission_pct: Number(get('cf_dealer_comm')) || 0,
      shipping_cost: Number(get('cf_shipping')) || 0, cod_charge: Number(get('cf_cod')) || 0,
      marketing_cost: Number(get('cf_marketing')) || 0, rto_provision_pct: Number(get('cf_rto')) || 0,
      other_selling_cost: Number(get('cf_other_selling')) || 0, notes: get('cf_notes')
    };
  }

  function refreshResultPanel() {
    var inputs = readInputsFromForm();
    var panel = document.getElementById('calcResultPanel');
    if (panel) panel.outerHTML = resultPanelHtml(computeResult(inputs));
    var targetHost = document.getElementById('calcTargetPanel');
    if (targetHost) targetHost.innerHTML = targetPriceTableHtml(inputs);
  }

  function applyProductDefaults(productId, inputsEl) {
    var p = data.products.filter(function (x) { return x.id === productId; })[0];
    if (!p) return;
    var set = function (id, v) { var el = document.getElementById(id); if (el && v != null) el.value = v; };
    if (p.purchase_cost != null) set('cf_purchase_price', p.purchase_cost);
    if (p.purchase_gst_rate != null) set('cf_purchase_gst', p.purchase_gst_rate);
    if (p.default_freight != null) set('cf_freight', p.default_freight);
    if (p.default_packaging_cost != null) set('cf_packaging', p.default_packaging_cost);
    if (p.default_other_cost != null) set('cf_other_purchase', p.default_other_cost);
    if (p.price != null) set('cf_selling_price', p.price);
    if (p.gst_rate != null) set('cf_sales_gst', p.gst_rate);
  }

  function applyChannelDefaults(channelId) {
    var c = data.channels.filter(function (x) { return x.id === channelId; })[0];
    if (!c) return;
    var set = function (id, v) { var el = document.getElementById(id); if (el) el.value = v; };
    set('cf_commission', c.commission_pct);
    set('cf_pg', c.payment_gateway_pct);
    set('cf_shipping', c.shipping_cost);
    set('cf_cod', c.cod_fee);
    set('cf_other_selling', round2(num(c.fixed_fee) + num(c.other_charges)));
  }

  function openCalcForm(sourceRow, mode) {
    var inputs = sourceRow ? inputsFromRow(sourceRow) : blankInputs();
    var isEdit = mode === 'edit' && sourceRow;
    var title = mode === 'edit' ? 'Edit Calculation' : mode === 'duplicate' ? 'Duplicate Calculation' : 'New Calculation';

    var body = PRA.openDrawer(title,
      '<form class="form" id="calcForm" novalidate>' +
        '<div id="calcFormMessage"></div>' +
        '<div class="form-grid">' +
          '<label>Product<select id="cf_product"><option value="">Ad-hoc (no product)</option>' +
            data.products.map(function (p) {
              return '<option value="' + PR.esc(p.id) + '"' + (inputs.product_id === p.id ? ' selected' : '') + '>' +
                PR.esc(p.name) + ' (' + PR.esc(p.sku) + ')</option>';
            }).join('') + '</select>' +
            '<span class="hint">Auto-fills costs below. Still fully editable for this one calculation.</span></label>' +
          '<label>Quantity<input id="cf_qty" type="number" min="1" step="1" value="' + PR.esc(inputs.quantity || 1) + '"></label>' +
        '</div>' +
        '<label>Selling Channel<select id="cf_channel"><option value="">None</option>' +
          data.channels.map(function (c) {
            return '<option value="' + PR.esc(c.id) + '"' + (inputs.selling_channel_id === c.id ? ' selected' : '') + '>' + PR.esc(c.name) + '</option>';
          }).join('') + '</select></label>' +

        '<div class="stat-group-title" style="margin-top:6px">Purchase</div>' +
        '<div class="form-grid three">' +
          numField('cf_purchase_price', 'Purchase Price (₹)', inputs.purchase_price) +
          '<label>Purchase GST (%)' + gstSelect('cf_purchase_gst', inputs.purchase_gst_rate) + '</label>' +
          numField('cf_freight', 'Freight (₹)', inputs.freight) +
        '</div>' +
        '<div class="form-grid three">' +
          numField('cf_packaging', 'Packaging Cost (₹)', inputs.packaging_cost) +
          numField('cf_loading', 'Loading/Unloading (₹)', inputs.loading_unloading) +
          numField('cf_labour', 'Labour Cost (₹)', inputs.labour_cost) +
        '</div>' +
        '<div class="form-grid three">' +
          numField('cf_manufacturing', 'Manufacturing Cost (₹)', inputs.manufacturing_cost) +
          numField('cf_warranty_prov', 'Warranty Provision (₹)', inputs.warranty_provision) +
          numField('cf_other_purchase', 'Other Cost (₹)', inputs.other_purchase_cost) +
        '</div>' +

        '<div class="stat-group-title">Selling</div>' +
        '<div class="form-grid three">' +
          numField('cf_selling_price', 'Selling Price (₹)', inputs.selling_price) +
          numField('cf_discount', 'Discount (₹)', inputs.discount) +
          '<label>Sales GST (%)' + gstSelect('cf_sales_gst', inputs.sales_gst_rate) + '</label>' +
        '</div>' +
        '<div class="form-grid three">' +
          numField('cf_commission', 'Marketplace Commission (%)', inputs.commission_pct) +
          numField('cf_pg', 'Payment Gateway (%)', inputs.payment_gateway_pct) +
          numField('cf_dealer_comm', 'Dealer Commission (%)', inputs.dealer_commission_pct) +
        '</div>' +
        '<div class="form-grid three">' +
          numField('cf_shipping', 'Shipping Cost (₹)', inputs.shipping_cost) +
          numField('cf_cod', 'COD Charge (₹)', inputs.cod_charge) +
          numField('cf_marketing', 'Marketing Cost (₹)', inputs.marketing_cost) +
        '</div>' +
        '<div class="form-grid three">' +
          numField('cf_rto', 'RTO / Return Provision (%)', inputs.rto_provision_pct) +
          numField('cf_other_selling', 'Other Selling Cost (₹)', inputs.other_selling_cost) +
          '<span></span>' +
        '</div>' +

        '<label>Notes<textarea id="cf_notes" rows="2">' + PR.esc(inputs.notes || '') + '</textarea></label>' +

        '<div class="stat-group-title">Result</div>' +
        resultPanelHtml(computeResult(inputs)) +
        '<div id="calcTargetPanel">' + targetPriceTableHtml(inputs) + '</div>' +

        '<div class="page-actions" style="justify-content:flex-end">' +
          '<button class="btn gray" type="button" id="cancelCalcBtn">Cancel</button>' +
          '<button class="btn" type="submit" id="saveCalcBtn">' + (isEdit ? 'SAVE CHANGES' : 'SAVE CALCULATION') + '</button>' +
        '</div>' +
      '</form>');

    document.getElementById('cancelCalcBtn').addEventListener('click', PRA.closeDrawer);
    document.getElementById('cf_product').addEventListener('change', function (e) {
      applyProductDefaults(e.target.value, body); refreshResultPanel();
    });
    document.getElementById('cf_channel').addEventListener('change', function (e) {
      applyChannelDefaults(e.target.value); refreshResultPanel();
    });
    body.addEventListener('input', refreshResultPanel);
    body.addEventListener('change', refreshResultPanel);
    document.getElementById('calcForm').addEventListener('submit', function (event) {
      saveCalc(event, isEdit ? sourceRow : null);
    });
  }

  async function saveCalc(event, editingRow) {
    event.preventDefault();
    var button = document.getElementById('saveCalcBtn');
    var messageHost = document.getElementById('calcFormMessage');
    messageHost.innerHTML = '';

    var inputs = readInputsFromForm();
    if (inputs.selling_price <= 0) {
      PR.toast('Enter a selling price greater than zero.', 'error');
      return;
    }
    var result = computeResult(inputs);
    var product = data.products.filter(function (p) { return p.id === inputs.product_id; })[0];
    var channel = data.channels.filter(function (c) { return c.id === inputs.selling_channel_id; })[0];
    var adminName = (PRA.admin && PRA.admin.name) || (PRA.session && PRA.session.user && PRA.session.user.email) || 'Admin';

    var payload = Object.assign({}, inputs, result, {
      product_id: inputs.product_id || null,
      product_name_snapshot: product ? product.name : null,
      sku_snapshot: product ? product.sku : null,
      selling_channel_id: inputs.selling_channel_id || null,
      channel_name_snapshot: channel ? channel.name : null,
      notes: inputs.notes || null,
      created_by: PRA.session && PRA.session.user && PRA.session.user.id,
      created_by_name: adminName
    });
    delete payload.category_snapshot;

    PR.setBusy(button, true, 'SAVING…');
    try {
      if (editingRow) {
        await PR.call('update calculation', function (sb) {
          return sb.from('calc_history').update(payload).eq('id', editingRow.id);
        });
      } else {
        payload.calc_number = await PR.call('generate calc number', function (sb) { return sb.rpc('calc_next_number'); });
        await PR.call('save calculation', function (sb) { return sb.from('calc_history').insert(payload); });
      }
      PRA.closeDrawer();
      PR.toast(editingRow ? 'Calculation updated.' : 'Calculation saved.', 'success');
      await refresh();
    } catch (err) {
      PR.setBusy(button, false);
      messageHost.innerHTML = '<div class="form-message error" role="alert">' + PR.esc(err.message) + '</div>';
      PR.toast(err.message, 'error');
    }
  }

  /* -------------------------------------------------------------- view / report */
  function viewCalc(row) {
    var reportRow = function (label, value) {
      return '<div class="calc-result-row"><span>' + PR.esc(label) + '</span><b>' + value + '</b></div>';
    };
    PRA.openDrawer('Calculation ' + (row.calc_number || ''),
      '<div class="stat-group-title" style="margin-top:0">Product Information</div>' +
      reportRow('Product Name', PR.esc(row.product_name_snapshot || 'Ad-hoc')) +
      reportRow('SKU', PR.esc(row.sku_snapshot || '-')) +
      reportRow('Quantity', PR.esc(row.quantity)) +
      reportRow('Selling Channel', PR.esc(row.channel_name_snapshot || '-')) +

      '<div class="stat-group-title">Purchase</div>' +
      reportRow('Purchase Price', PR.money2(row.purchase_price)) +
      reportRow('Purchase GST', row.purchase_gst_rate + '%') +
      reportRow('Freight', PR.money2(row.freight)) +
      reportRow('Packaging', PR.money2(row.packaging_cost)) +
      reportRow('Loading/Unloading', PR.money2(row.loading_unloading)) +
      reportRow('Labour', PR.money2(row.labour_cost)) +
      reportRow('Manufacturing', PR.money2(row.manufacturing_cost)) +
      reportRow('Warranty Provision', PR.money2(row.warranty_provision)) +
      reportRow('Other Cost', PR.money2(row.other_purchase_cost)) +
      reportRow('Total Landed Cost / unit', PR.money2(row.total_landed_cost)) +

      '<div class="stat-group-title">Selling</div>' +
      reportRow('Selling Price', PR.money2(row.selling_price)) +
      reportRow('Discount', PR.money2(row.discount)) +
      reportRow('Sales GST', row.sales_gst_rate + '%') +
      reportRow('Net Sales / unit', PR.money2(row.net_sales)) +

      '<div class="stat-group-title">Expenses</div>' +
      reportRow('Commission', row.commission_pct + '%') +
      reportRow('Payment Gateway', row.payment_gateway_pct + '%') +
      reportRow('Dealer Commission', row.dealer_commission_pct + '%') +
      reportRow('Shipping', PR.money2(row.shipping_cost)) +
      reportRow('COD Charge', PR.money2(row.cod_charge)) +
      reportRow('Marketing', PR.money2(row.marketing_cost)) +
      reportRow('RTO Provision', row.rto_provision_pct + '%') +
      reportRow('Other Expenses', PR.money2(row.other_selling_cost)) +

      '<div class="stat-group-title">Final Result</div>' +
      resultPanelHtml({
        total_landed_cost: row.total_landed_cost, net_sales: row.net_sales, total_cost: row.total_cost,
        total_sales: row.total_sales, gross_profit: row.gross_profit, net_profit: row.net_profit,
        profit_per_unit: row.profit_per_unit, profit_percent: row.profit_percent,
        margin_percent: row.margin_percent, roi_percent: row.roi_percent, breakeven_price: row.breakeven_price
      }) +
      (row.notes ? '<div class="stat-group-title">Notes</div><p class="hint">' + PR.esc(row.notes) + '</p>' : '') +
      '<div class="hint" style="margin-top:10px">Calculated by ' + PR.esc(row.created_by_name || '-') +
        ' on ' + PR.formatDateTime(row.created_at) + '</div>' +
      '<div class="page-actions" style="justify-content:flex-end;margin-top:16px">' +
        '<button class="btn gray" type="button" id="closeViewBtn">Close</button>' +
        '<button class="btn ghost" type="button" id="viewDupBtn">Duplicate</button>' +
        '<button class="btn" type="button" id="viewEditBtn">Edit</button>' +
      '</div>');

    document.getElementById('closeViewBtn').addEventListener('click', PRA.closeDrawer);
    document.getElementById('viewDupBtn').addEventListener('click', function () { openCalcForm(row, 'duplicate'); });
    document.getElementById('viewEditBtn').addEventListener('click', function () { openCalcForm(row, 'edit'); });
  }

  async function deleteCalc(id) {
    var row = data.history.filter(function (r) { return String(r.id) === String(id); })[0];
    if (!row) return;
    if (!confirm('Delete calculation ' + (row.calc_number || '') + '? This cannot be undone.')) return;
    try {
      await PR.call('delete calculation', function (sb) { return sb.from('calc_history').delete().eq('id', id); });
      PR.toast('Calculation deleted.', 'success');
      await refresh();
    } catch (err) { PR.toast(err.message, 'error'); }
  }

  document.addEventListener('click', function (event) {
    var view = event.target.closest('[data-calc-view]');
    if (view) { var r1 = findCalc(view.getAttribute('data-calc-view')); if (r1) viewCalc(r1); return; }
    var edit = event.target.closest('[data-calc-edit]');
    if (edit) { var r2 = findCalc(edit.getAttribute('data-calc-edit')); if (r2) openCalcForm(r2, 'edit'); return; }
    var dup = event.target.closest('[data-calc-dup]');
    if (dup) { var r3 = findCalc(dup.getAttribute('data-calc-dup')); if (r3) openCalcForm(r3, 'duplicate'); return; }
    var del = event.target.closest('[data-calc-del]');
    if (del) deleteCalc(del.getAttribute('data-calc-del'));
  });

  function findCalc(id) { return data.history.filter(function (r) { return String(r.id) === String(id); })[0]; }

  /* --------------------------------------------------------------- exports */
  var EXPORT_COLUMNS = [
    ['calc_number', 'Calc #'], ['created_at', 'Date'], ['product_name_snapshot', 'Product'],
    ['sku_snapshot', 'SKU'], ['quantity', 'Qty'], ['purchase_price', 'Purchase Cost'],
    ['selling_price', 'Selling Price'], ['net_profit', 'Profit/Loss'], ['margin_percent', 'Margin %'],
    ['created_by_name', 'User']
  ];

  function exportCsv(rows) {
    var lines = [EXPORT_COLUMNS.map(function (c) { return c[1]; }).join(',')];
    rows.forEach(function (r) {
      lines.push(EXPORT_COLUMNS.map(function (c) {
        var v = c[0] === 'created_at' ? PR.formatDate(r[c[0]]) : r[c[0]];
        v = v == null ? '' : String(v).replace(/"/g, '""');
        return /[",\n]/.test(v) ? '"' + v + '"' : v;
      }).join(','));
    });
    downloadBlob(lines.join('\n'), 'text/csv', 'powerrun-calculations.csv');
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) return resolve();
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function rowsAsAOA(rows) {
    var header = EXPORT_COLUMNS.map(function (c) { return c[1]; });
    var body = rows.map(function (r) {
      return EXPORT_COLUMNS.map(function (c) {
        return c[0] === 'created_at' ? PR.formatDate(r[c[0]]) : (r[c[0]] == null ? '' : r[c[0]]);
      });
    });
    return [header].concat(body);
  }

  async function exportExcel(rows) {
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
      var wb = window.XLSX.utils.book_new();
      var ws = window.XLSX.utils.aoa_to_sheet(rowsAsAOA(rows));
      window.XLSX.utils.book_append_sheet(wb, ws, 'Calculations');
      window.XLSX.writeFile(wb, 'powerrun-calculations.xlsx');
    } catch (err) {
      console.error('[PowerRun] Excel export failed:', err);
      PR.toast('Could not load the Excel export library. Try CSV instead.', 'error');
    }
  }

  async function exportPdf(rows) {
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
      var doc = new window.jspdf.jsPDF({ orientation: 'landscape' });
      doc.setFontSize(14);
      doc.text('PowerRun Industries - Profit & Loss Calculations', 14, 16);
      var aoa = rowsAsAOA(rows);
      doc.autoTable({ head: [aoa[0]], body: aoa.slice(1), startY: 22, styles: { fontSize: 8 } });
      doc.save('powerrun-calculations.pdf');
    } catch (err) {
      console.error('[PowerRun] PDF export failed:', err);
      PR.toast('Could not load the PDF export library. Try CSV instead.', 'error');
    }
  }

  function printRows(rows) {
    var win = window.open('', '_blank');
    if (!win) { PR.toast('Please allow pop-ups to print.', 'error'); return; }
    var aoa = rowsAsAOA(rows);
    win.document.write(
      '<html><head><title>PowerRun Calculations</title><style>' +
      'body{font-family:Arial,sans-serif;padding:20px} table{width:100%;border-collapse:collapse;font-size:12px}' +
      'th,td{border:1px solid #ccc;padding:6px 8px;text-align:left} th{background:#f2f2f2}' +
      '</style></head><body><h2>PowerRun Industries - Profit & Loss Calculations</h2><table><thead><tr>' +
      aoa[0].map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
      aoa.slice(1).map(function (r) { return '<tr>' + r.map(function (v) { return '<td>' + (v == null ? '' : v) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></body></html>');
    win.document.close();
    win.focus();
    setTimeout(function () { win.print(); }, 300);
  }

  function downloadBlob(content, type, filename) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  /* ---------------------------------------------------------- default settings */
  var DEFAULT_LABELS = {
    purchase_gst_rate: 'Default Purchase GST %', freight: 'Default Freight', packaging_cost: 'Default Packaging Cost',
    loading_unloading: 'Default Loading/Unloading', labour_cost: 'Default Labour Cost',
    manufacturing_cost: 'Default Manufacturing Cost', warranty_provision: 'Default Warranty Provision',
    other_purchase_cost: 'Default Other Cost',
    sales_gst_rate: 'Default Sales GST %', commission_pct: 'Default Marketplace Commission %',
    payment_gateway_pct: 'Default Payment Gateway %', dealer_commission_pct: 'Default Dealer Commission %',
    shipping_cost: 'Default Shipping Cost', cod_charge: 'Default COD Charge', marketing_cost: 'Default Marketing Cost',
    rto_provision_pct: 'Default RTO/Return Provision %', other_selling_cost: 'Default Other Cost (Selling)'
  };

  function defaultsTab() {
    var d = data.defaults;
    return '<div class="panel">' +
        '<h2>Purchase Defaults</h2>' +
        '<form class="form" id="purchaseDefaultsForm">' +
          '<div id="purchaseDefaultsMessage"></div>' +
          '<div class="form-grid three">' +
            numField('dd_purchase_gst', 'Default Purchase GST %', d.purchase_gst_rate) +
            numField('dd_freight', 'Default Freight (₹)', d.freight) +
            numField('dd_packaging', 'Default Packaging Cost (₹)', d.packaging_cost) +
          '</div>' +
          '<div class="form-grid three">' +
            numField('dd_loading', 'Default Loading/Unloading (₹)', d.loading_unloading) +
            numField('dd_labour', 'Default Labour Cost (₹)', d.labour_cost) +
            numField('dd_manufacturing', 'Default Manufacturing Cost (₹)', d.manufacturing_cost) +
          '</div>' +
          '<div class="form-grid">' +
            numField('dd_warranty_prov', 'Default Warranty Provision (₹)', d.warranty_provision) +
            numField('dd_other_purchase', 'Default Other Cost (₹)', d.other_purchase_cost) +
          '</div>' +
          '<div class="page-actions" style="justify-content:flex-end">' +
            '<button class="btn" type="submit" id="savePurchaseDefaultsBtn">SAVE PURCHASE DEFAULTS</button></div>' +
        '</form>' +
      '</div>' +
      '<div class="panel">' +
        '<h2>Selling Defaults</h2>' +
        '<form class="form" id="sellingDefaultsForm">' +
          '<div id="sellingDefaultsMessage"></div>' +
          '<div class="form-grid three">' +
            numField('dd_sales_gst', 'Default Sales GST %', d.sales_gst_rate) +
            numField('dd_commission', 'Default Marketplace Commission %', d.commission_pct) +
            numField('dd_pg', 'Default Payment Gateway %', d.payment_gateway_pct) +
          '</div>' +
          '<div class="form-grid three">' +
            numField('dd_dealer_comm', 'Default Dealer Commission %', d.dealer_commission_pct) +
            numField('dd_shipping', 'Default Shipping Cost (₹)', d.shipping_cost) +
            numField('dd_cod', 'Default COD Charge (₹)', d.cod_charge) +
          '</div>' +
          '<div class="form-grid three">' +
            numField('dd_marketing', 'Default Marketing Cost (₹)', d.marketing_cost) +
            numField('dd_rto', 'Default RTO/Return Provision %', d.rto_provision_pct) +
            numField('dd_other_selling', 'Default Other Cost (₹)', d.other_selling_cost) +
          '</div>' +
          '<div class="page-actions" style="justify-content:flex-end">' +
            '<button class="btn" type="submit" id="saveSellingDefaultsBtn">SAVE SELLING DEFAULTS</button></div>' +
        '</form>' +
      '</div>';
  }

  function bindDefaults() {
    document.getElementById('purchaseDefaultsForm').addEventListener('submit', async function (event) {
      event.preventDefault();
      var button = document.getElementById('savePurchaseDefaultsBtn');
      var newVals = {
        purchase_gst_rate: Number(document.getElementById('dd_purchase_gst').value) || 0,
        freight: Number(document.getElementById('dd_freight').value) || 0,
        packaging_cost: Number(document.getElementById('dd_packaging').value) || 0,
        loading_unloading: Number(document.getElementById('dd_loading').value) || 0,
        labour_cost: Number(document.getElementById('dd_labour').value) || 0,
        manufacturing_cost: Number(document.getElementById('dd_manufacturing').value) || 0,
        warranty_provision: Number(document.getElementById('dd_warranty_prov').value) || 0,
        other_purchase_cost: Number(document.getElementById('dd_other_purchase').value) || 0
      };
      await saveDefaults(newVals, button, 'purchaseDefaultsMessage');
    });
    document.getElementById('sellingDefaultsForm').addEventListener('submit', async function (event) {
      event.preventDefault();
      var button = document.getElementById('saveSellingDefaultsBtn');
      var newVals = {
        sales_gst_rate: Number(document.getElementById('dd_sales_gst').value) || 0,
        commission_pct: Number(document.getElementById('dd_commission').value) || 0,
        payment_gateway_pct: Number(document.getElementById('dd_pg').value) || 0,
        dealer_commission_pct: Number(document.getElementById('dd_dealer_comm').value) || 0,
        shipping_cost: Number(document.getElementById('dd_shipping').value) || 0,
        cod_charge: Number(document.getElementById('dd_cod').value) || 0,
        marketing_cost: Number(document.getElementById('dd_marketing').value) || 0,
        rto_provision_pct: Number(document.getElementById('dd_rto').value) || 0,
        other_selling_cost: Number(document.getElementById('dd_other_selling').value) || 0
      };
      await saveDefaults(newVals, button, 'sellingDefaultsMessage');
    });
  }

  async function saveDefaults(newVals, button, messageHostId) {
    var messageHost = document.getElementById(messageHostId);
    messageHost.innerHTML = '';
    var merged = Object.assign({}, data.defaults, newVals);
    var changes = diffFields(data.defaults, merged, DEFAULT_LABELS);
    PR.setBusy(button, true, 'SAVING…');
    try {
      await PR.call('save calc defaults', function (sb) {
        return sb.from('site_settings').upsert({ key: 'calc_defaults', value: merged }, { onConflict: 'key' });
      });
      await logAudit('default_settings', changes);
      PR.setBusy(button, false);
      PR.toast('Defaults saved.', 'success');
      messageHost.innerHTML = '<div class="form-message success" role="status">Saved.</div>';
      await refresh();
    } catch (err) {
      PR.setBusy(button, false);
      messageHost.innerHTML = '<div class="form-message error" role="alert">' + PR.esc(err.message) + '</div>';
      PR.toast(err.message, 'error');
    }
  }

  /* ---------------------------------------------------------------- GST rates */
  function gstTab() {
    return '<div class="panel">' +
        '<div class="panel-head"><h2>GST Rate Management</h2>' +
          '<button class="btn" type="button" id="addGstBtn">+ Add Rate</button></div>' +
        (data.gstRates.length
          ? '<div class="table-scroll"><table class="grid"><thead><tr><th>Rate</th><th>Label</th><th>Default</th><th>Status</th><th></th></tr></thead><tbody>' +
            data.gstRates.map(function (g) {
              return '<tr><td><b>' + g.rate + '%</b></td><td>' + PR.esc(g.label || '') + '</td>' +
                '<td>' + (g.is_default ? PRA.pill('active') : '<button class="btn ghost small" type="button" data-gst-default="' + PR.esc(g.id) + '">Set default</button>') + '</td>' +
                '<td>' + PRA.pill(g.is_active ? 'active' : 'inactive') + '</td>' +
                '<td class="nowrap"><button class="btn ghost small" type="button" data-gst-edit="' + PR.esc(g.id) + '">Edit</button> ' +
                  '<button class="btn danger small" type="button" data-gst-delete="' + PR.esc(g.id) + '">Delete</button></td></tr>';
            }).join('') + '</tbody></table></div>'
          : PRA.empty('No GST rates yet', 'Add at least one GST rate for the calculator to use.')) +
      '</div>';
  }

  function gstForm(row) {
    editingGstRate = row || null;
    var r = row || {};
    var body = PRA.openDrawer(row ? 'Edit GST Rate' : 'Add GST Rate',
      '<form class="form" id="gstForm" novalidate>' +
        '<div id="gstFormMessage"></div>' +
        numField('gf_rate', 'Rate (%)', r.rate, { step: '0.01' }) +
        '<label>Label<input id="gf_label" maxlength="40" value="' + PR.esc(r.label || '') + '"></label>' +
        '<label class="inline"><input id="gf_active" type="checkbox"' + (r.is_active === false ? '' : ' checked') + '> Active</label>' +
        '<div class="page-actions" style="justify-content:flex-end">' +
          '<button class="btn gray" type="button" id="cancelGstBtn">Cancel</button>' +
          '<button class="btn" type="submit" id="saveGstBtn">' + (row ? 'SAVE CHANGES' : 'ADD RATE') + '</button>' +
        '</div>' +
      '</form>');
    document.getElementById('cancelGstBtn').addEventListener('click', PRA.closeDrawer);
    document.getElementById('gstForm').addEventListener('submit', saveGst);
  }

  async function saveGst(event) {
    event.preventDefault();
    var button = document.getElementById('saveGstBtn');
    var messageHost = document.getElementById('gstFormMessage');
    var payload = {
      rate: Number(document.getElementById('gf_rate').value) || 0,
      label: document.getElementById('gf_label').value.trim() || null,
      is_active: document.getElementById('gf_active').checked
    };
    PR.setBusy(button, true, 'SAVING…');
    try {
      var changes = editingGstRate
        ? diffFields(editingGstRate, payload, { rate: 'GST Rate', label: 'GST Rate Label', is_active: 'GST Rate Active' })
        : [{ label: 'GST Rate Added', oldValue: '', newValue: payload.rate + '% (' + (payload.label || '') + ')' }];
      if (editingGstRate) {
        await PR.call('update gst rate', function (sb) { return sb.from('calc_gst_rates').update(payload).eq('id', editingGstRate.id); });
      } else {
        await PR.call('create gst rate', function (sb) { return sb.from('calc_gst_rates').insert(payload); });
      }
      await logAudit('gst_rate', changes);
      PRA.closeDrawer();
      PR.toast('GST rate saved.', 'success');
      await refresh();
    } catch (err) {
      PR.setBusy(button, false);
      messageHost.innerHTML = '<div class="form-message error" role="alert">' + PR.esc(err.message) + '</div>';
      PR.toast(err.message, 'error');
    }
  }

  async function setDefaultGst(id) {
    var row = data.gstRates.filter(function (g) { return String(g.id) === String(id); })[0];
    if (!row) return;
    try {
      await PR.call('clear default gst', function (sb) { return sb.from('calc_gst_rates').update({ is_default: false }).neq('id', id); });
      await PR.call('set default gst', function (sb) { return sb.from('calc_gst_rates').update({ is_default: true }).eq('id', id); });
      await logAudit('gst_rate', [{ label: 'Default GST Rate', oldValue: '', newValue: row.rate + '%' }]);
      PR.toast(row.rate + '% is now the default GST rate.', 'success');
      await refresh();
    } catch (err) { PR.toast(err.message, 'error'); }
  }

  async function deleteGst(id) {
    if (!confirm('Delete this GST rate?')) return;
    try {
      await PR.call('delete gst rate', function (sb) { return sb.from('calc_gst_rates').delete().eq('id', id); });
      PR.toast('GST rate deleted.', 'success');
      await refresh();
    } catch (err) { PR.toast(err.message, 'error'); }
  }

  function bindGst() {
    document.getElementById('addGstBtn').addEventListener('click', function () { gstForm(null); });
    document.querySelectorAll('[data-gst-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var row = data.gstRates.filter(function (g) { return String(g.id) === btn.getAttribute('data-gst-edit'); })[0];
        if (row) gstForm(row);
      });
    });
    document.querySelectorAll('[data-gst-default]').forEach(function (btn) {
      btn.addEventListener('click', function () { setDefaultGst(btn.getAttribute('data-gst-default')); });
    });
    document.querySelectorAll('[data-gst-delete]').forEach(function (btn) {
      btn.addEventListener('click', function () { deleteGst(btn.getAttribute('data-gst-delete')); });
    });
  }

  /* --------------------------------------------------------- selling channels */
  function channelsTab() {
    return '<div class="panel">' +
        '<div class="panel-head"><h2>Selling Channels</h2>' +
          '<button class="btn" type="button" id="addChannelBtn">+ Add Channel</button></div>' +
        (data.channels.length
          ? '<div class="table-scroll"><table class="grid"><thead><tr>' +
              '<th>Channel</th><th>Commission</th><th>Payment GW</th><th>Shipping</th><th>COD</th><th>Default</th><th>Status</th><th></th>' +
            '</tr></thead><tbody>' +
            data.channels.map(function (c) {
              return '<tr><td><b>' + PR.esc(c.name) + '</b></td>' +
                '<td>' + c.commission_pct + '%</td><td>' + c.payment_gateway_pct + '%</td>' +
                '<td>' + PR.money(c.shipping_cost) + '</td><td>' + PR.money(c.cod_fee) + '</td>' +
                '<td>' + (c.is_default ? PRA.pill('active') : '<button class="btn ghost small" type="button" data-channel-default="' + PR.esc(c.id) + '">Set default</button>') + '</td>' +
                '<td>' + PRA.pill(c.is_active ? 'active' : 'inactive') + '</td>' +
                '<td class="nowrap"><button class="btn ghost small" type="button" data-channel-edit="' + PR.esc(c.id) + '">Edit</button> ' +
                  '<button class="btn danger small" type="button" data-channel-delete="' + PR.esc(c.id) + '">Delete</button></td></tr>';
            }).join('') + '</tbody></table></div>'
          : PRA.empty('No selling channels yet', 'Add Direct Website, Amazon, Flipkart, Dealer or a custom channel.')) +
      '</div>';
  }

  function channelForm(row) {
    editingChannel = row || null;
    var c = row || {};
    var body = PRA.openDrawer(row ? 'Edit Selling Channel' : 'Add Selling Channel',
      '<form class="form" id="channelForm" novalidate>' +
        '<div id="channelFormMessage"></div>' +
        '<label>Channel Name<input id="chf_name" required maxlength="60" value="' + PR.esc(c.name || '') + '" placeholder="Amazon, Flipkart, Dealer, Distributor…"></label>' +
        '<div class="form-grid three">' +
          numField('chf_commission', 'Commission %', c.commission_pct) +
          numField('chf_pg', 'Payment Gateway %', c.payment_gateway_pct) +
          numField('chf_fixed', 'Fixed Fee (₹)', c.fixed_fee) +
        '</div>' +
        '<div class="form-grid three">' +
          numField('chf_shipping', 'Shipping Cost (₹)', c.shipping_cost) +
          numField('chf_cod', 'COD Fee (₹)', c.cod_fee) +
          numField('chf_other', 'Other Charges (₹)', c.other_charges) +
        '</div>' +
        '<label class="inline"><input id="chf_active" type="checkbox"' + (c.is_active === false ? '' : ' checked') + '> Active</label>' +
        '<div class="page-actions" style="justify-content:flex-end">' +
          '<button class="btn gray" type="button" id="cancelChannelBtn">Cancel</button>' +
          '<button class="btn" type="submit" id="saveChannelBtn">' + (row ? 'SAVE CHANGES' : 'ADD CHANNEL') + '</button>' +
        '</div>' +
      '</form>');
    document.getElementById('cancelChannelBtn').addEventListener('click', PRA.closeDrawer);
    document.getElementById('channelForm').addEventListener('submit', saveChannel);
  }

  async function saveChannel(event) {
    event.preventDefault();
    var button = document.getElementById('saveChannelBtn');
    var messageHost = document.getElementById('channelFormMessage');
    var name = document.getElementById('chf_name').value.trim();
    if (!name) { PR.toast('Enter a channel name.', 'error'); return; }
    var payload = {
      name: name,
      commission_pct: Number(document.getElementById('chf_commission').value) || 0,
      payment_gateway_pct: Number(document.getElementById('chf_pg').value) || 0,
      fixed_fee: Number(document.getElementById('chf_fixed').value) || 0,
      shipping_cost: Number(document.getElementById('chf_shipping').value) || 0,
      cod_fee: Number(document.getElementById('chf_cod').value) || 0,
      other_charges: Number(document.getElementById('chf_other').value) || 0,
      is_active: document.getElementById('chf_active').checked
    };
    PR.setBusy(button, true, 'SAVING…');
    try {
      var labels = { name: 'Channel Name', commission_pct: 'Marketplace Commission', payment_gateway_pct: 'Payment Gateway',
        fixed_fee: 'Fixed Fee', shipping_cost: 'Shipping Cost', cod_fee: 'COD Fee', other_charges: 'Other Charges', is_active: 'Active' };
      var changes = editingChannel ? diffFields(editingChannel, payload, labels)
        : [{ label: 'Selling Channel Added', oldValue: '', newValue: payload.name }];
      if (editingChannel) {
        await PR.call('update channel', function (sb) { return sb.from('calc_selling_channels').update(payload).eq('id', editingChannel.id); });
      } else {
        await PR.call('create channel', function (sb) { return sb.from('calc_selling_channels').insert(payload); });
      }
      await logAudit('selling_channel', changes);
      PRA.closeDrawer();
      PR.toast('Selling channel saved.', 'success');
      await refresh();
    } catch (err) {
      PR.setBusy(button, false);
      messageHost.innerHTML = '<div class="form-message error" role="alert">' + PR.esc(err.message) + '</div>';
      PR.toast(err.message, 'error');
    }
  }

  async function setDefaultChannel(id) {
    var row = data.channels.filter(function (c) { return String(c.id) === String(id); })[0];
    if (!row) return;
    try {
      await PR.call('clear default channel', function (sb) { return sb.from('calc_selling_channels').update({ is_default: false }).neq('id', id); });
      await PR.call('set default channel', function (sb) { return sb.from('calc_selling_channels').update({ is_default: true }).eq('id', id); });
      await logAudit('selling_channel', [{ label: 'Default Selling Channel', oldValue: '', newValue: row.name }]);
      PR.toast(row.name + ' is now the default channel.', 'success');
      await refresh();
    } catch (err) { PR.toast(err.message, 'error'); }
  }

  async function deleteChannel(id) {
    if (!confirm('Delete this selling channel?')) return;
    try {
      await PR.call('delete channel', function (sb) { return sb.from('calc_selling_channels').delete().eq('id', id); });
      PR.toast('Channel deleted.', 'success');
      await refresh();
    } catch (err) { PR.toast(err.message, 'error'); }
  }

  function bindChannels() {
    document.getElementById('addChannelBtn').addEventListener('click', function () { channelForm(null); });
    document.querySelectorAll('[data-channel-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var row = data.channels.filter(function (c) { return String(c.id) === btn.getAttribute('data-channel-edit'); })[0];
        if (row) channelForm(row);
      });
    });
    document.querySelectorAll('[data-channel-default]').forEach(function (btn) {
      btn.addEventListener('click', function () { setDefaultChannel(btn.getAttribute('data-channel-default')); });
    });
    document.querySelectorAll('[data-channel-delete]').forEach(function (btn) {
      btn.addEventListener('click', function () { deleteChannel(btn.getAttribute('data-channel-delete')); });
    });
  }

  /* ----------------------------------------------------------- target margins */
  function targetsTab() {
    return '<div class="panel">' +
        '<div class="panel-head"><h2>Target Profit Settings</h2>' +
          '<button class="btn" type="button" id="addTargetBtn">+ Add Target</button></div>' +
        '<p class="hint" style="margin-top:0">These presets power the "Required Selling Price" table inside every calculation.</p>' +
        (data.targets.length
          ? '<div class="table-scroll"><table class="grid"><thead><tr><th>Label</th><th>Percent</th><th>Default</th><th></th></tr></thead><tbody>' +
            data.targets.map(function (t) {
              return '<tr><td>' + PR.esc(t.label || '') + '</td><td><b>' + t.percent + '%</b></td>' +
                '<td>' + (t.is_default ? PRA.pill('active') : '<button class="btn ghost small" type="button" data-target-default="' + PR.esc(t.id) + '">Set default</button>') + '</td>' +
                '<td class="nowrap"><button class="btn ghost small" type="button" data-target-edit="' + PR.esc(t.id) + '">Edit</button> ' +
                  '<button class="btn danger small" type="button" data-target-delete="' + PR.esc(t.id) + '">Delete</button></td></tr>';
            }).join('') + '</tbody></table></div>'
          : PRA.empty('No target margins yet', 'Add standard targets like 5%, 10%, 15%, 20%, 25%.')) +
      '</div>';
  }

  function targetForm(row) {
    editingTarget = row || null;
    var t = row || {};
    var body = PRA.openDrawer(row ? 'Edit Target Margin' : 'Add Target Margin',
      '<form class="form" id="targetForm" novalidate>' +
        '<div id="targetFormMessage"></div>' +
        '<label>Label<input id="tf_label" maxlength="40" value="' + PR.esc(t.label || '') + '" placeholder="e.g. 20%"></label>' +
        numField('tf_percent', 'Target Profit %', t.percent) +
        '<div class="page-actions" style="justify-content:flex-end">' +
          '<button class="btn gray" type="button" id="cancelTargetBtn">Cancel</button>' +
          '<button class="btn" type="submit" id="saveTargetBtn">' + (row ? 'SAVE CHANGES' : 'ADD TARGET') + '</button>' +
        '</div>' +
      '</form>');
    document.getElementById('cancelTargetBtn').addEventListener('click', PRA.closeDrawer);
    document.getElementById('targetForm').addEventListener('submit', saveTarget);
  }

  async function saveTarget(event) {
    event.preventDefault();
    var button = document.getElementById('saveTargetBtn');
    var messageHost = document.getElementById('targetFormMessage');
    var percent = Number(document.getElementById('tf_percent').value);
    if (!Number.isFinite(percent)) { PR.toast('Enter a valid target percent.', 'error'); return; }
    var payload = { label: document.getElementById('tf_label').value.trim() || (percent + '%'), percent: percent };
    PR.setBusy(button, true, 'SAVING…');
    try {
      var changes = editingTarget
        ? diffFields(editingTarget, payload, { label: 'Target Margin Label', percent: 'Target Margin %' })
        : [{ label: 'Target Margin Added', oldValue: '', newValue: payload.percent + '%' }];
      if (editingTarget) {
        await PR.call('update target', function (sb) { return sb.from('calc_target_margins').update(payload).eq('id', editingTarget.id); });
      } else {
        await PR.call('create target', function (sb) { return sb.from('calc_target_margins').insert(payload); });
      }
      await logAudit('target_margin', changes);
      PRA.closeDrawer();
      PR.toast('Target margin saved.', 'success');
      await refresh();
    } catch (err) {
      PR.setBusy(button, false);
      messageHost.innerHTML = '<div class="form-message error" role="alert">' + PR.esc(err.message) + '</div>';
      PR.toast(err.message, 'error');
    }
  }

  async function setDefaultTarget(id) {
    var row = data.targets.filter(function (t) { return String(t.id) === String(id); })[0];
    if (!row) return;
    try {
      await PR.call('clear default target', function (sb) { return sb.from('calc_target_margins').update({ is_default: false }).neq('id', id); });
      await PR.call('set default target', function (sb) { return sb.from('calc_target_margins').update({ is_default: true }).eq('id', id); });
      await logAudit('target_margin', [{ label: 'Default Target Margin', oldValue: '', newValue: row.percent + '%' }]);
      PR.toast(row.percent + '% is now the default target.', 'success');
      await refresh();
    } catch (err) { PR.toast(err.message, 'error'); }
  }

  async function deleteTarget(id) {
    if (!confirm('Delete this target margin?')) return;
    try {
      await PR.call('delete target', function (sb) { return sb.from('calc_target_margins').delete().eq('id', id); });
      PR.toast('Target margin deleted.', 'success');
      await refresh();
    } catch (err) { PR.toast(err.message, 'error'); }
  }

  function bindTargets() {
    document.getElementById('addTargetBtn').addEventListener('click', function () { targetForm(null); });
    document.querySelectorAll('[data-target-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var row = data.targets.filter(function (t) { return String(t.id) === btn.getAttribute('data-target-edit'); })[0];
        if (row) targetForm(row);
      });
    });
    document.querySelectorAll('[data-target-default]').forEach(function (btn) {
      btn.addEventListener('click', function () { setDefaultTarget(btn.getAttribute('data-target-default')); });
    });
    document.querySelectorAll('[data-target-delete]').forEach(function (btn) {
      btn.addEventListener('click', function () { deleteTarget(btn.getAttribute('data-target-delete')); });
    });
  }

  /* ------------------------------------------------------------------- boot */
  async function refresh() { await loadAll(); render(); }

  PRA.boot('calculator', 'Profit & Loss Calculator', async function (contentHost) {
    host = contentHost;
    host.innerHTML = '<div class="panel">' + PRA.skeleton(6) + '</div>';
    await loadAll();
    render();
  });
})();
