/* Admin - Battery BOM (Bill of Materials) cost calculator */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var DEFAULT_ITEMS = [
    { component: 'LiFePO4 Cell', specification: '3.2V 100Ah Grade-A Prismatic', qty: 16, unit_cost: 0 },
    { component: 'Smart BMS', specification: '16S LiFePO4, suitable current rating, CAN/RS485', qty: 1, unit_cost: 0 },
    { component: 'Active Balancer', specification: 'BMS-integrated / external', qty: 1, unit_cost: 0 },
    { component: 'Cell Busbar', specification: 'Copper, suitable current rating', qty: 15, unit_cost: 0 },
    { component: 'Cell Terminal Hardware', specification: 'SS screw/nut/washer', qty: 1, unit_cost: 0 },
    { component: 'Cell Insulation Sheet', specification: 'Fish paper / insulating sheet', qty: 1, unit_cost: 0 },
    { component: 'Cell Side Insulation', specification: 'EVA/foam insulation', qty: 1, unit_cost: 0 },
    { component: 'Compression Plates', specification: 'Suitable for selected cells', qty: 1, unit_cost: 0 },
    { component: 'Main DC Fuse', specification: 'DC-rated, calculated for pack current', qty: 1, unit_cost: 0 },
    { component: 'DC Breaker/Isolator', specification: 'DC-rated', qty: 1, unit_cost: 0 },
    { component: 'Main Contactor', specification: 'DC-rated', qty: 1, unit_cost: 0 },
    { component: 'Pre-charge Relay', specification: 'DC-rated', qty: 1, unit_cost: 0 },
    { component: 'Pre-charge Resistor', specification: 'Calculated per inverter/DC-link capacitance', qty: 1, unit_cost: 0 },
    { component: 'Current Sensor/Shunt', specification: 'Compatible with BMS', qty: 1, unit_cost: 0 },
    { component: 'Temperature Sensor', specification: 'NTC/RTD compatible with BMS', qty: 2, unit_cost: 0 },
    { component: 'Main Power Cable', specification: 'Properly sized flexible DC cable', qty: 1, unit_cost: 0 },
    { component: 'Communication Cable', specification: 'CAN / RS485', qty: 1, unit_cost: 0 },
    { component: 'Communication Connector', specification: 'RJ45/terminal/aviation connector as required', qty: 1, unit_cost: 0 },
    { component: 'Power Terminals', specification: 'Positive/negative ESS terminals', qty: 2, unit_cost: 0 },
    { component: 'Service Disconnect', specification: 'DC service isolation', qty: 1, unit_cost: 0 },
    { component: 'Enclosure', specification: 'Metal ESS/rack enclosure', qty: 1, unit_cost: 0 },
    { component: 'Cooling Fan', specification: 'If required by thermal design', qty: 1, unit_cost: 0 },
    { component: 'Air Filter/Vent', specification: 'Enclosure ventilation', qty: 1, unit_cost: 0 },
    { component: 'LCD/HMI Display', specification: 'SOC, voltage, current, alarms', qty: 1, unit_cost: 0 },
    { component: 'LED Indicators', specification: 'Power/Run/Fault', qty: 1, unit_cost: 0 },
    { component: 'Emergency Stop', specification: 'ESS safety circuit, if applicable', qty: 1, unit_cost: 0 },
    { component: 'Earthing Hardware', specification: 'Earth stud/wire', qty: 1, unit_cost: 0 },
    { component: 'Cable Glands', specification: 'Suitable IP rating', qty: 1, unit_cost: 0 },
    { component: 'Internal Wiring Harness', specification: 'BMS/sensor/control wiring', qty: 1, unit_cost: 0 },
    { component: 'Labels & Warning Stickers', specification: 'Battery voltage, polarity, danger etc.', qty: 1, unit_cost: 0 }
  ];

  var calculations = [];
  var products = [];
  var contentHost = null;

  async function loadAll() {
    var results = await Promise.all([
      PR.call('load BOM calculations', function (sb) {
        return sb.from('bom_calculations').select('*').order('updated_at', { ascending: false });
      }),
      PR.call('load products for BOM', function (sb) {
        return sb.from('products').select('id,name,sku').order('name');
      })
    ]);
    calculations = results[0] || [];
    products = results[1] || [];
  }

  function productName(id) {
    var p = products.filter(function (x) { return x.id === id; })[0];
    return p ? p.name + ' (' + p.sku + ')' : '—';
  }

  function render(host) {
    host.innerHTML =
      '<div class="panel">' +
        '<div class="panel-head"><h2>Battery BOM Calculator</h2>' +
          '<div class="page-actions">' +
            '<button class="btn" type="button" data-new-bom>+ New Calculation</button>' +
          '</div>' +
        '</div>' +
        (calculations.length
          ? '<div class="table-scroll"><table class="grid"><thead><tr>' +
              '<th>Name</th><th>Total Cost</th><th>Linked Product</th><th>Updated</th><th></th>' +
            '</tr></thead><tbody>' +
            calculations.map(function (c) {
              return '<tr>' +
                '<td><b>' + PR.esc(c.name) + '</b></td>' +
                '<td class="nowrap">' + PR.money(c.total_cost) + '</td>' +
                '<td>' + PR.esc(productName(c.linked_product_id)) + '</td>' +
                '<td class="nowrap">' + PR.formatDate(c.updated_at) + '</td>' +
                '<td class="nowrap">' +
                  '<button class="btn ghost small" type="button" data-edit-bom="' + PR.esc(c.id) + '">Edit</button> ' +
                  '<button class="btn danger small" type="button" data-delete-bom="' + PR.esc(c.id) + '">Delete</button>' +
                '</td></tr>';
            }).join('') +
            '</tbody></table></div>'
          : PRA.empty('No BOM calculations yet', 'Start a new one to price out a battery build component by component.')) +
      '</div>';
  }

  function rowHtml(item, i) {
    var qty = item.qty == null ? 1 : item.qty;
    var cost = item.unit_cost == null ? 0 : item.unit_cost;
    return '<tr data-row="' + i + '">' +
      '<td><input class="bom-component" style="width:100%" value="' + PR.esc(item.component || '') + '"></td>' +
      '<td><input class="bom-spec" style="width:100%" value="' + PR.esc(item.specification || '') + '"></td>' +
      '<td><input class="bom-qty" type="number" min="0" step="1" style="width:70px" value="' + PR.esc(qty) + '"></td>' +
      '<td><input class="bom-cost" type="number" min="0" step="0.01" style="width:100px" value="' + PR.esc(cost) + '"></td>' +
      '<td class="nowrap bom-line-total">' + PR.money(qty * cost) + '</td>' +
      '<td><button class="btn danger small" type="button" data-remove-row="' + i + '">✕</button></td>' +
    '</tr>';
  }

  function readRows(tbody) {
    return Array.prototype.map.call(tbody.querySelectorAll('tr'), function (tr) {
      return {
        component: tr.querySelector('.bom-component').value.trim(),
        specification: tr.querySelector('.bom-spec').value.trim(),
        qty: Number(tr.querySelector('.bom-qty').value) || 0,
        unit_cost: Number(tr.querySelector('.bom-cost').value) || 0
      };
    });
  }

  function recompute(body) {
    var tbody = body.querySelector('#bomRows');
    var total = 0;
    Array.prototype.forEach.call(tbody.querySelectorAll('tr'), function (tr) {
      var qty = Number(tr.querySelector('.bom-qty').value) || 0;
      var cost = Number(tr.querySelector('.bom-cost').value) || 0;
      var lineTotal = qty * cost;
      tr.querySelector('.bom-line-total').textContent = PR.money(lineTotal);
      total += lineTotal;
    });
    body.querySelector('#bomGrandTotal').textContent = PR.money(total);
    return total;
  }

  function openForm(calc) {
    var c = calc || {};
    var items = (c.items && c.items.length ? c.items : DEFAULT_ITEMS);

    var body = PRA.openDrawer(
      calc ? 'Edit BOM Calculation' : 'New BOM Calculation',
      '<form class="form" id="bomForm" novalidate>' +
        '<div id="bomFormMessage"></div>' +
        '<label>Name <span class="req">*</span>' +
          '<input id="bf_name" required maxlength="160" value="' + PR.esc(c.name || '') +
          '" placeholder="e.g. 51.2V 100Ah Battery Pack"></label>' +
        '<label>Link to Product (optional)<select id="bf_product"><option value="">None</option>' +
          products.map(function (p) {
            return '<option value="' + PR.esc(p.id) + '"' +
              (c.linked_product_id === p.id ? ' selected' : '') + '>' +
              PR.esc(p.name) + ' (' + PR.esc(p.sku) + ')</option>';
          }).join('') + '</select>' +
          '<span class="hint">Lets you push the total below into that product\'s Purchase Cost.</span></label>' +

        '<div class="table-scroll"><table class="grid"><thead><tr>' +
          '<th>Component</th><th>Specification</th><th>Qty</th><th>Unit Cost ₹</th><th>Line Total</th><th></th>' +
        '</tr></thead><tbody id="bomRows">' +
          items.map(rowHtml).join('') +
        '</tbody></table></div>' +
        '<div class="page-actions" style="justify-content:flex-start;margin-top:10px">' +
          '<button class="btn gray small" type="button" id="bomAddRowBtn">+ Add Row</button>' +
        '</div>' +

        '<div class="stat-group-title" style="display:flex;justify-content:space-between;align-items:center">' +
          '<span>Grand Total</span><span id="bomGrandTotal" style="font-size:20px">' + PR.money(0) + '</span>' +
        '</div>' +

        '<div class="page-actions" style="justify-content:flex-end">' +
          (calc && calc.linked_product_id
            ? '<button class="btn gray" type="button" id="bomPushBtn">Push Total to Purchase Cost</button>'
            : '') +
          '<button class="btn gray" type="button" id="cancelBomBtn">Cancel</button>' +
          '<button class="btn" type="submit" id="saveBomBtn">SAVE</button>' +
        '</div>' +
      '</form>');

    recompute(body);

    body.addEventListener('input', function (e) {
      if (e.target.closest('#bomRows')) recompute(body);
    });

    document.getElementById('bomAddRowBtn').addEventListener('click', function () {
      var tbody = body.querySelector('#bomRows');
      var i = tbody.querySelectorAll('tr').length;
      tbody.insertAdjacentHTML('beforeend', rowHtml({ component: '', specification: '', qty: 1, unit_cost: 0 }, i));
      recompute(body);
    });

    body.addEventListener('click', function (e) {
      var rm = e.target.closest('[data-remove-row]');
      if (rm) { rm.closest('tr').remove(); recompute(body); }
    });

    document.getElementById('cancelBomBtn').addEventListener('click', PRA.closeDrawer);

    var pushBtn = document.getElementById('bomPushBtn');
    if (pushBtn) {
      pushBtn.addEventListener('click', function () {
        pushToProduct(calc.linked_product_id, recompute(body), pushBtn);
      });
    }

    document.getElementById('bomForm').addEventListener('submit', function (event) {
      save(event, calc, body);
    });
    return body;
  }

  async function pushToProduct(productId, total, button) {
    if (!productId) return;
    PR.setBusy(button, true, 'PUSHING…');
    try {
      await PR.call('push BOM total to product purchase cost', function (sb) {
        return sb.from('products').update({ purchase_cost: total }).eq('id', productId);
      });
      PR.toast('Purchase cost updated on the linked product.', 'success');
    } catch (err) {
      PR.toast(err.message, 'error');
    } finally {
      PR.setBusy(button, false);
    }
  }

  async function save(event, calc, body) {
    event.preventDefault();
    var form = event.target;
    var button = document.getElementById('saveBomBtn');
    var messageHost = document.getElementById('bomFormMessage');
    messageHost.innerHTML = '';

    var values = PR.validateForm(form, [
      { el: 'bf_name', name: 'name', label: 'Name', required: true }
    ]);
    if (!values) return;

    var items = readRows(body.querySelector('#bomRows'));
    var total = items.reduce(function (sum, it) { return sum + it.qty * it.unit_cost; }, 0);
    var productId = document.getElementById('bf_product').value || null;

    var payload = {
      name: values.name,
      linked_product_id: productId,
      items: items,
      total_cost: total
    };

    PR.setBusy(button, true, 'SAVING…');
    try {
      if (calc) {
        await PR.call('update BOM calculation', function (sb) {
          return sb.from('bom_calculations').update(payload).eq('id', calc.id);
        });
      } else {
        await PR.call('create BOM calculation', function (sb) {
          return sb.from('bom_calculations').insert(payload);
        });
      }
      PRA.closeDrawer();
      PR.toast('BOM calculation saved.', 'success');
      await refresh();
    } catch (err) {
      PR.setBusy(button, false);
      messageHost.innerHTML = '<div class="form-message error" role="alert">' + PR.esc(err.message) + '</div>';
      PR.toast(err.message, 'error');
    }
  }

  async function remove(id) {
    var calc = calculations.find(function (c) { return c.id === id; });
    if (!calc) return;
    if (!confirm('Delete "' + calc.name + '"?\n\nThis cannot be undone.')) return;
    try {
      await PR.call('delete BOM calculation', function (sb) {
        return sb.from('bom_calculations').delete().eq('id', id);
      });
      PR.toast('BOM calculation deleted.', 'success');
      await refresh();
    } catch (err) {
      PR.toast(err.message, 'error');
    }
  }

  async function refresh() {
    await loadAll();
    render(contentHost);
  }

  document.addEventListener('click', function (event) {
    if (event.target.closest('[data-new-bom]')) { openForm(null); return; }

    var edit = event.target.closest('[data-edit-bom]');
    if (edit) {
      var calc = calculations.find(function (c) { return c.id === edit.getAttribute('data-edit-bom'); });
      if (calc) openForm(calc);
      return;
    }
    var del = event.target.closest('[data-delete-bom]');
    if (del) remove(del.getAttribute('data-delete-bom'));
  });

  PRA.boot('bom', 'Battery BOM Calculator', async function (host) {
    contentHost = host;
    host.innerHTML = '<div class="panel">' + PRA.skeleton(6) + '</div>';
    await loadAll();
    render(host);
  });
})();
