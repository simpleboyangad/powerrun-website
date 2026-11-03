/* Admin - order management */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var ORDER_STATUSES = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];
  var PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];
  var PAY_REQUEST = {
    none: 'Nahi bheja',
    pi_sent: 'PI bheja - payment ka intezaar',
    advance: 'Advance mila',
    paid: 'Poora payment mila'
  };

  var orders = [];
  var bankReady = true;
  var contentHost = null;
  var filterStatus = '';

  async function loadAll() {
    orders = await PR.call('load orders', function (sb) {
      return sb.from('orders')
        .select('*, order_items(id,product_id,product_name,product_sku,hsn_code,quantity,unit_price,total_price,mrp,gst_rate,taxable_amount,gst_amount,products(warranty))')
        .order('created_at', { ascending: false });
    }) || [];
  }

  function itemCount(order) {
    return (order.order_items || []).reduce(function (sum, item) {
      return sum + Number(item.quantity || 0);
    }, 0);
  }

  function render(host) {
    var visible = filterStatus === 'pi_waiting'
      ? orders.filter(piWaiting)
      : filterStatus === 'ship_todo'
        ? orders.filter(function (o) { return 'awb_code' in o && shipReady(o); })
      : filterStatus === 'pi_todo'
        ? orders.filter(piTodo)
      : filterStatus
        ? orders.filter(function (o) { return o.order_status === filterStatus; })
        : orders;

    host.innerHTML =
      '<div class="panel">' +
        '<div class="panel-head"><h2>Orders</h2>' +
          '<span class="hint">' + orders.length + ' total</span></div>' +
        '<div class="toolbar">' +
          '<input type="search" id="orderSearch" placeholder="Search order ID, name, mobile or email…" aria-label="Search orders">' +
          '<select id="orderStatusFilter"><option value="">All statuses</option>' +
            ORDER_STATUSES.concat(['processing']).map(function (s) {
              return '<option value="' + s + '"' + (filterStatus === s ? ' selected' : '') + '>' +
                s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
            }).join('') +
            '<option value="pi_todo"' + (filterStatus === 'pi_todo' ? ' selected' : '') + '>PI bhejna baaki</option>' +
            '<option value="pi_waiting"' + (filterStatus === 'pi_waiting' ? ' selected' : '') + '>PI bheja, paisa baaki</option>' +
            '<option value="ship_todo"' + (filterStatus === 'ship_todo' ? ' selected' : '') + '>🚚 Ship karna baaki</option>' +
          '</select>' +
          '<span class="count" id="orderCount">' + visible.length + ' shown</span>' +
        '</div>' +
        (filterStatus === 'pi_todo' && !bankReady
          ? '<div class="form-message error" style="margin-bottom:12px">Pehle Admin → Settings mein bank details aur UPI ID bhariye - ' +
            'bina inke customer ko PI par payment ki jaankari nahi milegi.</div>'
          : '') +
        (filterStatus === 'pi_todo' && visible.length
          ? '<p class="hint">Har order ke aage <b>PI bhejo</b> dabayein: WhatsApp mein PI link wala message taiyaar milega, ' +
            'bas Send karein. Order par apne aap "PI bheja" lag jayega.</p>'
          : '') +
        (visible.length
          ? '<div class="table-scroll"><table class="grid" id="orderTable"><thead><tr>' +
              '<th>Order ID</th><th>Customer</th><th>Mobile</th><th>Email</th><th>Date</th>' +
              '<th>Items</th><th>Amount</th><th>Payment</th><th>Status</th><th></th>' +
            '</tr></thead><tbody>' + visible.map(row).join('') + '</tbody></table></div>'
          : PRA.empty(filterStatus ? 'No ' + filterStatus + ' orders' : 'No orders yet',
              filterStatus
                ? 'No orders currently have this status.'
                : 'Orders placed on powerrun.in will appear here as soon as they are created.')) +
      '</div>';

    PRA.bindSearch('orderSearch', 'orderTable', 'orderCount');
    var statusFilter = document.getElementById('orderStatusFilter');
    if (statusFilter) {
      statusFilter.addEventListener('change', function () {
        filterStatus = statusFilter.value;
        var url = filterStatus ? '?status=' + filterStatus : location.pathname;
        history.replaceState(null, '', url);
        render(host);
      });
    }
  }

  function piWaiting(o) {
    return o.order_status !== 'cancelled' && o.payment_status !== 'paid' &&
      (o.payment_request === 'pi_sent' || o.payment_request === 'advance');
  }

  function piTodo(o) {
    return !o.is_test && o.order_status !== 'cancelled' && o.order_status !== 'delivered' && o.payment_status !== 'paid' &&
      (o.payment_request || 'none') === 'none' && o.payment_method !== 'razorpay';
  }

  function piLink(order) {
    return PR.config.SITE_URL + '/pi/?t=' + order.pi_token;
  }

  function payBadge(o) {
    if (o.payment_status === 'paid') return '';
    if (o.pi_viewed_at) return ' <small class="pill delivered" title="Customer ne ' + PR.formatDateTime(o.pi_viewed_at) + ' ko PI dekha">PI DEKHA</small>' +
      (Number(o.advance_amount) > 0 ? ' <small class="pill sent">ADV ' + PR.money(o.advance_amount) + '</small>' : '');
    if (Number(o.advance_amount) > 0) return ' <small class="pill sent">ADV ' + PR.money(o.advance_amount) + '</small>';
    if (o.payment_request === 'pi_sent') return ' <small class="pill sent">PI SENT</small>';
    if (Number(o.advance_required) > 0 && Number(o.advance_required) < Number(o.total_amount))
      return ' <small class="pill pending" title="Is order par itna advance chahiye">ADV CHAHIYE ' + PR.money(o.advance_required) + '</small>';
    return '';
  }

  /* what the customer should pay now: the advance still owed (migration 48), else the balance */
  function payNow(order) {
    var adv = Number(order.advance_amount || 0), need = Number(order.advance_required || 0);
    return need > adv ? need - adv : Number(order.total_amount) - adv;
  }

  function piMessage(order) {
    var total = Number(order.total_amount), now = payNow(order);
    var advance = Number(order.advance_required || 0) > Number(order.advance_amount || 0) && now < total;
    return 'Namaste ' + (order.customer_name || '').split(' ')[0] + ' ji, PowerRun Industries se aapke order ' + order.order_number +
      ' (kul ' + PR.money(total) + ') ka Proforma Invoice (PI):\n' +
      (order.pi_token ? piLink(order) + '\n\n' : '\n') +
      (advance
        ? 'Order confirm karne ke liye ' + PR.money(now) + ' advance bhejein, baaki ' + PR.money(total - now) + ' saman milne par. '
        : 'Order confirm karne ke liye ' + PR.money(now) + ' ka payment bhejein. ') +
      'Link par UPI / bank se payment ho jayega. Payment karke screenshot is number par bhej dein, ' +
      'hum order turant dispatch kar denge. 🙏';
  }

  function row(order) {
    return '<tr>' +
      '<td class="nowrap"><b>' + PR.esc(order.order_number) + '</b></td>' +
      '<td>' + PR.esc(order.customer_name || '-') +
        (order.customer_gstin ? ' <small class="pill" title="GST invoice requested">GST</small>' : '') + '</td>' +
      '<td class="nowrap">' + PR.esc(order.customer_mobile || '-') + '</td>' +
      '<td>' + PR.esc(order.customer_email || '-') + '</td>' +
      '<td class="nowrap">' + PR.formatDate(order.created_at) + '</td>' +
      '<td>' + itemCount(order) + '</td>' +
      '<td class="nowrap"><b>' + PR.money(order.total_amount) + '</b></td>' +
      '<td class="nowrap">' + PRA.pill(order.payment_status) + payBadge(order) + '</td>' +
      '<td>' + PRA.pill(order.order_status) +
        ('awb_code' in order && shipReady(order) ? ' <small class="pill sent" title="Payment / advance mil gaya - ship karein">SHIP KARO</small>' : '') +
        (order.rto ? ' <small class="pill cancelled">RTO</small>' : '') + '</td>' +
      '<td class="nowrap">' +
        (filterStatus === 'pi_todo' && PR.whatsappTo(order.customer_mobile, '')
          ? '<a class="btn small" data-pi-send="' + PR.esc(order.id) + '" href="' +
              PR.esc(PR.whatsappTo(order.customer_mobile, piMessage(order))) + '" target="_blank" rel="noopener">📄 PI bhejo</a> '
          : '') +
        '<button class="btn ghost small" type="button" data-view-order="' +
        PR.esc(order.id) + '">Open</button></td>' +
    '</tr>';
  }

  function detail(order) {
    var items = order.order_items || [];
    var customerWa = PR.whatsappTo(order.customer_mobile,
      'Hello ' + (order.customer_name || '') + ', this is PowerRun Industries regarding your order ' +
      order.order_number + '.');
    // Only delivered orders can be reviewed (get_review_request enforces it too).
    var reviewWa = order.order_status === 'delivered' && order.review_token
      ? PR.whatsappTo(order.customer_mobile,
          'Namaste ' + (order.customer_name || '').split(' ')[0] + ' ji, PowerRun Industries se order ' +
          order.order_number + ' lene ke liye dhanyavaad! 🙏\n\n' +
          'Product kaisa laga? 1 minute nikaal kar apna review zaroor dein, isse doosre customers ki madad hogi:\n' +
          PR.config.SITE_URL + '/review/?t=' + order.review_token +
          (PR.config.GOOGLE_REVIEWS && PR.config.GOOGLE_REVIEWS.WRITE_URL
            ? '\n\nGoogle par bhi 5 ⭐ dein to bahut madad hogi:\n' + PR.config.GOOGLE_REVIEWS.WRITE_URL
            : '') +
          PRA.referralLine())
      : '';
    PRA.openDrawer('Order ' + order.order_number,
      '<div id="orderDetailMessage"></div>' +

      '<div class="form-grid">' +
        '<div><b style="font-size:12px;color:#6d6d6d">CUSTOMER</b>' +
          '<p style="margin:6px 0 0;line-height:1.7">' +
            '<b>' + PR.esc(order.customer_name || '-') + '</b><br>' +
            '☎ <a href="tel:' + PR.esc(order.customer_mobile) + '">' + PR.esc(order.customer_mobile || '-') + '</a><br>' +
            (order.customer_email
              ? '✉ <a href="mailto:' + PR.esc(order.customer_email) + '">' + PR.esc(order.customer_email) + '</a>'
              : '') +
            (order.customer_gstin
              ? '<br><span class="pill" style="background:#e7f6ed;color:#14663a">GST BILL</span> ' +
                '<b>' + PR.esc(order.customer_business_name || '') + '</b><br>GSTIN: <b>' +
                PR.esc(order.customer_gstin) + '</b>'
              : '') +
          '</p></div>' +
        '<div><b style="font-size:12px;color:#6d6d6d">BILLING ADDRESS</b>' +
          '<p style="margin:6px 0 0;line-height:1.7">' +
            PR.esc(order.address || '-') + '<br>' +
            PR.esc([order.city, order.state, order.pincode].filter(Boolean).join(', ')) +
          '</p>' +
          '<b style="font-size:12px;color:#6d6d6d;display:block;margin-top:10px">SHIPPING / DELIVERY ADDRESS</b>' +
          '<p style="margin:6px 0 0;line-height:1.7">' +
            PR.esc(order.shipping_address || order.address || '-') + '<br>' +
            PR.esc([order.shipping_city || order.city, order.shipping_state || order.state,
                    order.shipping_pincode || order.pincode].filter(Boolean).join(', ')) +
          '</p></div>' +
      '</div>' +

      '<div class="table-scroll" style="margin-top:18px"><table class="grid"><thead><tr>' +
        '<th>Product</th><th>SKU</th><th>Qty</th><th>Unit Price</th><th>Total</th>' +
      '</tr></thead><tbody>' +
      items.map(function (item) {
        return '<tr><td><b>' + PR.itemName(item) + '</b></td>' +
          '<td class="nowrap">' + PR.esc(item.product_sku || '-') + '</td>' +
          '<td>' + item.quantity + '</td>' +
          '<td class="nowrap">' + PR.money(item.unit_price) + '</td>' +
          '<td class="nowrap">' + PR.money(item.total_price) + '</td></tr>';
      }).join('') +
      '</tbody></table></div>' +

      '<div id="serialBox"></div>' +

      '<div style="margin-top:14px;display:grid;gap:6px;max-width:340px;margin-left:auto">' +
        (function () {
          var b = PR.orderBreakdown(Object.assign({}, order, { items: items }));
          var line = function (r) {
            var style = 'display:flex;justify-content:space-between' +
              (r.cls === 'total' ? ';border-top:1px solid #eee;padding-top:8px;font-size:17px' : '') +
              (r.cls === 'discount' ? ';color:#14663a' : '') +
              (r.cls === 'mrp' ? ';color:#888' : '') +
              (r.cls === 'sub' ? ';font-size:12px;color:#666;padding-left:12px' : '');
            return '<div style="' + style + '"><span>' + PR.esc(r.label) + '</span><b>' + r.value + '</b></div>';
          };
          return b.rows.map(line).join('') +
            (b.gstRows.length
              ? '<div style="margin-top:6px;padding-top:6px;border-top:1px dashed #ddd;display:grid;gap:4px">' +
                b.gstRows.map(line).join('') + '</div>'
              : '');
        })() +
      '</div>' +

      '<div id="shipBox"></div>' +

      '<div class="page-actions" style="margin-top:16px;padding:12px;border:1px solid #eef0f3;border-radius:10px;align-items:center">' +
        '<b style="font-size:12px;color:#6d6d6d;margin-right:auto">INVOICE' +
          (order.invoice_number
            ? ' · <span style="color:#14663a">' + PR.esc(order.invoice_number) + ' (' + PR.formatDate(order.invoice_date) + ')</span>'
            : ' · not issued yet') + '</b>' +
        '<a class="btn gray small" href="/admin/invoice/?type=proforma&id=' + encodeURIComponent(order.id) +
          '" target="_blank" rel="noopener" title="Advance payment / approval ke liye">Proforma Invoice</a>' +
        (order.order_status === 'cancelled' && !order.invoice_number
          ? ''
          : '<button class="btn small" type="button" id="taxInvoiceBtn">' +
              (order.invoice_number ? 'Print Tax Invoice' : 'Issue Tax Invoice') + '</button>') +
        (order.invoice_number
          ? ' <a class="btn gray small" href="/admin/credit-notes/?type=order&amp;id=' + encodeURIComponent(order.id) +
              '" title="Cancel / return / discount ke baad GST credit note">Credit Note</a>'
          : '') +
      '</div>' +

      '<div class="hint" style="margin-top:12px">' +
        'Placed ' + PR.formatDateTime(order.created_at) +
        ' · Payment method: ' + PR.esc(PR.paymentMethodLabel(order.payment_method)) +
        (Number(order.advance_required) > 0
          ? ' · Advance chahiye ' + PR.money(order.advance_required) + (Number(order.advance_amount) > 0 ? ', mila ' + PR.money(order.advance_amount) : ', abhi nahi mila')
          : '') +
        (order.razorpay_payment_id ? ' · Razorpay payment ' + PR.esc(order.razorpay_payment_id) : '') +
      '</div>' +

      '<form class="form" id="orderUpdateForm" style="margin-top:20px;border-top:1px solid #eef0f3;padding-top:18px">' +
        '<div class="form-grid">' +
          '<label>Order Status<select id="od_status">' +
            (ORDER_STATUSES.indexOf(order.order_status) < 0 ? [order.order_status] : []).concat(ORDER_STATUSES).map(function (s) {
              return '<option value="' + s + '"' + (order.order_status === s ? ' selected' : '') + '>' +
                s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
            }).join('') +
          '</select>' +
            '<span class="hint">Packed: battery/inverter ke serial pehle save karein. Shipped: courier ka naam zaroori.</span>' +
          '</label>' +
          '<label>Payment Status<select id="od_payment">' +
            PAYMENT_STATUSES.map(function (s) {
              return '<option value="' + s + '"' + (order.payment_status === s ? ' selected' : '') + '>' +
                s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
            }).join('') +
            '</select>' +
            '<span class="hint">Only mark as paid once you have confirmed the money was received.</span>' +
          '</label>' +
        '</div>' +
        ('payment_request' in order
          ? '<div style="margin:6px 0 14px;padding:12px;border:1px solid #eef0f3;border-radius:10px">' +
              '<b style="font-size:12px;color:#6d6d6d">PAYMENT REQUEST (PI / ADVANCE)</b>' +
              '<div class="form-grid" style="margin-top:8px">' +
                '<label>Status<select id="od_payreq">' + Object.keys(PAY_REQUEST).map(function (k) {
                  return '<option value="' + k + '"' + (order.payment_request === k ? ' selected' : '') + '>' + PAY_REQUEST[k] + '</option>';
                }).join('') + '</select>' +
                  (order.pi_sent_at ? '<span class="hint">PI bheja: ' + PR.formatDateTime(order.pi_sent_at) + '</span>' : '') + '</label>' +
                '<label>Advance mila (₹)<input id="od_advance" type="number" min="0" max="' + PR.esc(order.total_amount) +
                  '" step="1" inputmode="numeric" value="' + (Number(order.advance_amount) || '') + '" placeholder="0">' +
                  '<span class="hint">' + (Number(order.advance_amount) > 0
                    ? 'Baaki: ' + PR.money(Number(order.total_amount) - Number(order.advance_amount)) +
                      (order.advance_received_at ? ' · ' + PR.formatDate(order.advance_received_at) : '')
                    : 'Order total ' + PR.money(order.total_amount)) + '</span></label>' +
              '</div>' +
              (order.order_status !== 'cancelled' && order.payment_status !== 'paid'
                ? '<div class="page-actions" style="margin-top:4px">' +
                    (order.pi_token
                      ? '<a class="btn gray small" href="' + PR.esc(piLink(order)) + '" target="_blank" rel="noopener">PI dekho (customer wala)</a>'
                      : '<a class="btn gray small" href="/admin/invoice/?type=proforma&amp;id=' + encodeURIComponent(order.id) +
                        '" target="_blank" rel="noopener">PI kholo → Save as PDF</a>') +
                    (PR.whatsappTo(order.customer_mobile, '')
                      ? '<a class="btn small" id="piWaBtn" href="' + PR.esc(PR.whatsappTo(order.customer_mobile, piMessage(order))) +
                        '" target="_blank" rel="noopener">📄 WhatsApp par PI bhejo</a>'
                      : '') +
                  '</div><span class="hint">Message mein PI ka link hai (UPI / bank details ke saath) - bas Send karein. ' +
                    'Button dabate hi order par "PI bheja" lag jayega.' +
                    (order.pi_viewed_at ? ' Customer ne PI dekha: ' + PR.formatDateTime(order.pi_viewed_at) + '.' : '') + '</span>'
                : '') +
            '</div>'
          : '') +
        '<div class="form-grid">' +
          '<label>Courier Partner<input id="od_courier" maxlength="80" value="' +
            PR.esc(order.courier_partner || '') + '"></label>' +
          '<label>Tracking Number<input id="od_tracking" maxlength="80" value="' +
            PR.esc(order.tracking_number || '') + '"></label>' +
        '</div>' +
        '<label style="display:flex;gap:8px;align-items:center;flex-direction:row;font-weight:400">' +
          '<input type="checkbox" id="od_test" style="width:auto"' + (order.is_test ? ' checked' : '') + '> ' +
          'Test order (Reports mein nahi ginega)</label>' +
        '<label>Internal Notes<textarea id="od_notes" maxlength="1000">' +
          PR.esc(order.notes || '') + '</textarea></label>' +
        '<div class="page-actions" style="justify-content:flex-end">' +
          (customerWa
            ? '<a class="btn gray" href="' + PR.esc(customerWa) + '" target="_blank" rel="noopener">WhatsApp Customer</a>'
            : '') +
          (reviewWa
            ? '<a class="btn gray" href="' + PR.esc(reviewWa) + '" target="_blank" rel="noopener" ' +
                'title="Customer ko review link bhejein">⭐ Review Link Bhejein</a>'
            : '') +
          '<button class="btn" type="submit" id="saveOrderBtn">SAVE ORDER</button>' +
        '</div>' +
      '</form>' +
      '<div id="timelineBox"></div>');

    loadSerials(order);
    shipBox(order);
    loadTimeline(order);
    var piWa = document.getElementById('piWaBtn');
    if (piWa) piWa.addEventListener('click', function () { markPiSent(order); });
    document.getElementById('orderUpdateForm').addEventListener('submit', function (event) {
      saveOrder(event, order);
    });
    var taxBtn = document.getElementById('taxInvoiceBtn');
    if (taxBtn) taxBtn.addEventListener('click', function () { taxInvoice(order, taxBtn); });
  }

  async function markPiSent(order) {
    if (order.payment_request !== 'none') return;
    try {
      await PR.call('mark PI sent', function (sb) {
        return sb.from('orders').update({ payment_request: 'pi_sent' }).eq('id', order.id);
      });
      order.payment_request = 'pi_sent';
      var sel = document.getElementById('od_payreq');
      if (sel) sel.value = 'pi_sent';
      PR.toast('Order par "PI bheja" mark ho gaya.', 'success');
      refresh();
    } catch (err) {
      PR.toast(err.message, 'error');
    }
  }

  /* Warranty products need one serial number per unit before the order can be packed. */
  function needsSerial(item) {
    var w = item.products && item.products.warranty;
    return !!(w && String(w).trim() && !/^\s*no\s+warranty/i.test(w));
  }

  async function loadSerials(order) {
    var box = document.getElementById('serialBox');
    var items = (order.order_items || []).filter(needsSerial);
    if (!box || !items.length) return;
    var saved;
    try {
      saved = await PR.call('load serials', function (sb) {
        return sb.from('order_serials').select('order_item_id,serial_number,warranty_id').eq('order_id', order.id).order('created_at');
      }) || [];
    } catch (err) {
      return;   // serials not available (older database) - the rest of the drawer still works
    }
    var locked = order.order_status === 'delivered' || order.order_status === 'cancelled';
    box.innerHTML =
      '<div style="margin-top:16px;padding:12px;border:1px solid #eef0f3;border-radius:10px">' +
        '<b style="font-size:12px;color:#6d6d6d">SERIAL NUMBERS (warranty ke liye)</b>' +
        items.map(function (item) {
          var mine = saved.filter(function (x) { return x.order_item_id === item.id; });
          var inputs = '';
          for (var i = 0; i < item.quantity; i++) {
            inputs += '<input class="od-serial" data-item="' + PR.esc(item.id) + '" maxlength="60" autocapitalize="characters" ' +
              'placeholder="Unit ' + (i + 1) + ' serial" value="' + PR.esc(mine[i] ? mine[i].serial_number : '') + '"' +
              (locked ? ' disabled' : '') + '>';
          }
          return '<div style="margin-top:10px"><div style="font-size:13px;font-weight:700">' + PR.esc(item.product_name) +
            ' <small>(' + mine.length + '/' + item.quantity + ')</small></div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:6px;margin-top:6px">' +
            inputs + '</div></div>';
        }).join('') +
        (locked
          ? (order.order_status === 'delivered' ? '<p class="hint">Delivery par warranty apne aap register ho gayi.</p>' : '')
          : '<div class="page-actions" style="justify-content:flex-end;margin-top:10px">' +
              '<button class="btn small" type="button" id="saveSerialsBtn">SAVE SERIALS</button></div>') +
      '</div>';
    var btn = document.getElementById('saveSerialsBtn');
    if (btn) btn.addEventListener('click', async function () {
      var list = Array.prototype.map.call(box.querySelectorAll('.od-serial'), function (el) {
        return { order_item_id: el.getAttribute('data-item'), serial_number: el.value.trim() };
      }).filter(function (x) { return x.serial_number; });
      PR.setBusy(btn, true, 'SAVING…');
      try {
        var n = await PR.call('save serials', function (sb) {
          return sb.rpc('admin_save_order_serials', { p_order_id: order.id, p_serials: list });
        });
        PR.toast(n + ' serial number saved.', 'success');
        loadSerials(order);
      } catch (err) {
        PR.setBusy(btn, false);
        PR.toast(err.message, 'error');
      }
    });
  }

  /* ---------------------------------------------------- Shiprocket shipping
     supabase/functions/shiprocket books the courier; the amount the courier
     collects is worked out there from the order (total - advance, 0 if paid). */
  var shipError = {};   // last booking error per order, shown in the Ship box until the next try

  function shipReady(o) {
    return !o.awb_code && ['cancelled', 'shipped', 'delivered'].indexOf(o.order_status) < 0 &&
      (o.payment_status === 'paid' || Number(o.advance_amount) > 0);
  }

  function codAmount(o) {
    return o.payment_status === 'paid' ? 0 : Math.max(0, Number(o.total_amount) - Number(o.advance_amount || 0));
  }

  async function shiprocket(label, body) {
    var res = await PR.call(label, function (sb) { return sb.functions.invoke('shiprocket', { body: body }); });
    if (!res || !res.ok) throw new Error((res && res.error) || 'Shiprocket se jawab nahi aaya.');
    return res;
  }

  function shipBox(order) {
    var box = document.getElementById('shipBox');
    if (!box || !('awb_code' in order)) return;   // migration 50 not applied yet
    var wrap = function (html) {
      return '<div style="margin-top:16px;padding:12px;border:1px solid #eef0f3;border-radius:10px">' +
        '<b style="font-size:12px;color:#6d6d6d">SHIPPING (SHIPROCKET)</b>' + html + '</div>';
    };

    if (order.awb_code) {
      var cancellable = ['packed', 'confirmed', 'processing', 'pending'].indexOf(order.order_status) >= 0;
      box.innerHTML = wrap(
        '<p style="margin:8px 0;line-height:1.7"><b>' + PR.esc(order.courier_partner || 'Courier') + '</b> · AWB <b>' +
          PR.esc(order.awb_code) + '</b>' + (order.rto ? ' <span class="pill cancelled">RTO</span>' : '') +
          (order.ship_status ? '<br>Status: ' + PR.esc(order.ship_status) +
            (order.ship_status_at ? ' · ' + PR.formatDateTime(order.ship_status_at) : '') : '') +
          '<br>' + (Number(order.cod_to_collect) > 0
            ? 'Courier customer se lega: <b>' + PR.money(order.cod_to_collect) + '</b>'
            : 'Prepaid - courier kuch nahi lega') +
          (Number(order.ship_charge) > 0 ? ' · Bhada ' + PR.money(order.ship_charge) : '') + '</p>' +
        '<div class="page-actions">' +
          (order.label_url ? '<a class="btn small" href="' + PR.esc(order.label_url) + '" target="_blank" rel="noopener">🏷 Label print</a>' : '') +
          (order.invoice_number ? '<a class="btn small" href="/admin/invoice/?type=tax&amp;id=' + encodeURIComponent(order.id) +
            '" target="_blank" rel="noopener">🧾 Invoice print</a>' : '') +
          '<a class="btn gray small" href="https://shiprocket.co/tracking/' + encodeURIComponent(order.awb_code) +
            '" target="_blank" rel="noopener">📍 Track</a>' +
          (cancellable ? '<button class="btn gray small" type="button" id="shipCancelBtn">Shipment cancel karo</button>' : '') +
        '</div>');
      var cancelBtn = document.getElementById('shipCancelBtn');
      if (cancelBtn) cancelBtn.addEventListener('click', async function () {
        if (!confirm('Shiprocket shipment cancel karein? AWB aur label hat jayenge, order wapas "confirmed" ho jayega.')) return;
        PR.setBusy(cancelBtn, true, 'CANCEL HO RAHA…');
        try {
          await shiprocket('cancel shipment', { action: 'cancel', order_id: order.id });
          PR.toast('Shipment cancel ho gaya.', 'success');
          await reopen(order);
        } catch (err) {
          PR.setBusy(cancelBtn, false);
          PR.toast(err.message, 'error');
        }
      });
      return;
    }

    if (['cancelled', 'shipped', 'delivered'].indexOf(order.order_status) >= 0) return;
    if (!shipReady(order)) {
      box.innerHTML = wrap('<p class="hint" style="margin:8px 0 0">Payment ya advance milte hi yahan <b>🚚 Ship karo</b> aayega ' +
        '(label + invoice ek click mein).</p>');
      return;
    }

    var cod = codAmount(order);
    box.innerHTML = wrap(
      (shipError[order.id] ? '<div class="form-message error" style="margin:8px 0">' + PR.esc(shipError[order.id]) + '</div>' : '') +
      '<p style="margin:8px 0">' + (cod > 0
        ? 'Courier customer se lega: <b>' + PR.money(cod) + '</b>' +
          (Number(order.advance_amount) > 0 ? ' (advance ' + PR.money(order.advance_amount) + ' mil chuka)' : '') +
          ' <button class="btn gray small" type="button" id="shPaidBtn" title="Customer ne baaki paisa seedha UPI / bank se de diya">' +
            'Baaki paisa mil gaya? Paid karo</button>'
        : 'Prepaid - courier kuch nahi lega') + '</p>' +
      '<div style="display:grid;grid-template-columns:repeat(4,minmax(70px,1fr));gap:6px">' +
        '<label style="font-size:12px">Wazan (kg)<input id="sh_w" type="number" min="0.1" step="0.1" inputmode="decimal"></label>' +
        '<label style="font-size:12px">Lambai (cm)<input id="sh_l" type="number" min="1" step="1" inputmode="numeric"></label>' +
        '<label style="font-size:12px">Chaudai (cm)<input id="sh_b" type="number" min="1" step="1" inputmode="numeric"></label>' +
        '<label style="font-size:12px">Unchai (cm)<input id="sh_h" type="number" min="1" step="1" inputmode="numeric"></label>' +
      '</div>' +
      ((order.order_items || []).length === 1
        ? '<label style="display:flex;gap:8px;align-items:center;flex-direction:row;font-weight:400;font-size:13px;margin-top:6px">' +
            '<input type="checkbox" id="sh_save" style="width:auto" checked> Ye box size is product ke liye yaad rakho</label>'
        : '') +
      '<div class="page-actions" style="margin-top:8px"><button class="btn small" type="button" id="shQuoteBtn">🚚 Ship karo - courier rate dekho</button>' +
        '<span class="hint" id="shWallet"></span></div>' +
      '<div id="shQuotes"></div>');

    prefillBox(order);
    document.getElementById('shQuoteBtn').addEventListener('click', function (e) { loadQuotes(order, e.currentTarget); });
    var paidBtn = document.getElementById('shPaidBtn');
    if (paidBtn) paidBtn.addEventListener('click', async function () {
      if (!confirm('Customer ne poora ' + PR.money(order.total_amount) + ' de diya hai?\n\nOrder "Paid" ho jayega aur courier ' +
                   'customer se kuch nahi lega (prepaid). Paisa account mein aaya ho tabhi haan karein.')) return;
      PR.setBusy(paidBtn, true, 'SAVING…');
      try {
        await PR.call('mark paid', function (sb) {
          return sb.from('orders').update({ payment_status: 'paid' }).eq('id', order.id);
        });
        PR.toast('Order Paid ho gaya - ab courier kuch nahi lega.', 'success');
        await reopen(order);
      } catch (err) {
        PR.setBusy(paidBtn, false);
        PR.toast(err.message, 'error');
      }
    });
  }

  function boxInput() {
    var v = function (id) { return Number(document.getElementById(id).value); };
    return { weight: v('sh_w'), length: v('sh_l'), breadth: v('sh_b'), height: v('sh_h') };
  }

  /* the box size saved on the product (Ship karo remembers it); weight x quantity */
  async function prefillBox(order) {
    var items = order.order_items || [];
    var ids = items.map(function (i) { return i.product_id; }).filter(Boolean);
    if (!ids.length) return;
    try {
      var rows = await PR.call('load box sizes', function (sb) {
        return sb.from('products').select('id,ship_weight_kg,ship_length_cm,ship_breadth_cm,ship_height_cm').in('id', ids);
      }) || [];
      var byId = {};
      rows.forEach(function (r) { byId[r.id] = r; });
      var weight = 0, all = true;
      items.forEach(function (i) {
        var p = byId[i.product_id];
        if (p && Number(p.ship_weight_kg) > 0) weight += Number(p.ship_weight_kg) * Number(i.quantity);
        else all = false;
      });
      if (all && weight > 0) document.getElementById('sh_w').value = Math.round(weight * 100) / 100;
      var first = byId[items[0].product_id];
      if (items.length === 1 && Number(items[0].quantity) === 1 && first) {
        if (first.ship_length_cm) document.getElementById('sh_l').value = first.ship_length_cm;
        if (first.ship_breadth_cm) document.getElementById('sh_b').value = first.ship_breadth_cm;
        if (first.ship_height_cm) document.getElementById('sh_h').value = first.ship_height_cm;
      }
    } catch (err) { /* empty boxes: the admin types the size */ }
  }

  async function loadQuotes(order, button) {
    var b = boxInput();
    if (!(b.weight > 0 && b.length > 0 && b.breadth > 0 && b.height > 0)) {
      PR.toast('Pehle parcel ka wazan aur size bhariye (pack karke naapein).', 'error');
      return;
    }
    var host = document.getElementById('shQuotes');
    PR.setBusy(button, true, 'RATE AA RAHE HAIN…');
    try {
      var both = await Promise.all([
        shiprocket('courier rates', Object.assign({ action: 'quote', order_id: order.id }, b)),
        shiprocket('wallet', { action: 'status' }).catch(function () { return null; })
      ]);
      var q = both[0], st = both[1];
      PR.setBusy(button, false);
      if (st && st.wallet != null) {
        document.getElementById('shWallet').innerHTML = 'Wallet: <b>' + PR.money(st.wallet) + '</b> · Pickup: ' + PR.esc(q.pickup.name) + ' (' + PR.esc(q.pickup.pincode) + ')';
      }
      if (!q.couriers.length) {
        host.innerHTML = '<div class="form-message error" style="margin-top:8px">Is pincode par koi courier nahi mila' +
          (q.surface_only ? ' (battery - sirf road wale courier)' : '') + '.</div>';
        return;
      }
      var cheapest = q.couriers[0].id;
      var pick = q.couriers.some(function (c) { return c.id === q.recommended; }) ? q.recommended : cheapest;
      host.innerHTML =
        (q.surface_only ? '<p class="hint" style="margin:8px 0 0">🔋 Lithium battery: sirf Surface (road) courier dikhaye hain' +
          (q.hidden_air ? ' - ' + q.hidden_air + ' air courier chhupaye' : '') + '.</p>' : '') +
        '<p class="hint" style="margin:8px 0 0">' + q.couriers.length + ' courier mile (sabse saste pehle):</p>' +
        '<div style="display:grid;gap:6px;margin-top:6px;max-height:380px;overflow:auto">' + q.couriers.map(function (c) {
          var tags = (c.id === cheapest ? ' <span class="pill delivered">SABSE SASTA</span>' : '') +
            (c.id === q.recommended ? ' <span class="pill sent">SUGGESTED</span>' : '');
          return '<label style="display:flex;gap:10px;align-items:center;flex-direction:row;font-weight:400;padding:8px 10px;border:1px solid #eef0f3;border-radius:8px">' +
            '<input type="radio" name="sh_courier" value="' + c.id + '" data-rate="' + c.rate + '" style="width:auto"' + (c.id === pick ? ' checked' : '') + '>' +
            '<span style="flex:1"><b>' + PR.esc(c.name) + '</b>' + tags + '<br><small>' +
              (c.days ? c.days + ' din' : (c.etd ? 'ETD ' + PR.esc(c.etd) : '')) +
              (c.rating ? ' · ⭐ ' + c.rating : '') + (c.surface ? ' · Surface' : ' · Air') + '</small></span>' +
            '<b class="nowrap">' + PR.money(c.rate) + '</b></label>';
        }).join('') + '</div>' +
        '<div class="page-actions" style="justify-content:flex-end;margin-top:10px">' +
          '<button class="btn" type="button" id="shShipBtn">✅ CONFIRM: LABEL + INVOICE BANAO</button></div>' +
        '<p class="hint">Courier customer se ' + (q.cod > 0 ? '<b>' + PR.money(q.cod) + '</b> lega' : 'kuch nahi lega (prepaid)') +
          '. Bhada Shiprocket wallet se katega.</p>';
      document.getElementById('shShipBtn').addEventListener('click', function (e) { bookShipment(order, e.currentTarget); });
    } catch (err) {
      PR.setBusy(button, false);
      host.innerHTML = '<div class="form-message error" style="margin-top:8px">' + PR.esc(err.message) + '</div>';
    }
  }

  async function bookShipment(order, button) {
    var chosen = document.querySelector('input[name="sh_courier"]:checked');
    if (!chosen) { PR.toast('Courier chuniye.', 'error'); return; }
    var b = boxInput();
    // open the tab now (still inside the click) so pop-up blockers allow it
    var tab = window.open('', '_blank');
    if (tab) { try { tab.document.write('<p style="font:16px sans-serif;padding:40px">Label aur invoice ban rahe hain… is tab ko band mat karein.</p>'); } catch (e) { /* ignore */ } }
    delete shipError[order.id];
    PR.setBusy(button, true, 'LABEL BAN RAHA HAI…');
    try {
      var res = await shiprocket('book shipment', Object.assign({
        action: 'ship', order_id: order.id, courier_id: Number(chosen.value), rate: Number(chosen.getAttribute('data-rate'))
      }, b));
      var save = document.getElementById('sh_save');
      if (save && save.checked && order.order_items[0].product_id && Number(order.order_items[0].quantity) === 1) {
        PR.call('remember box size', function (sb) {
          return sb.from('products').update({ ship_weight_kg: b.weight, ship_length_cm: b.length,
            ship_breadth_cm: b.breadth, ship_height_cm: b.height }).eq('id', order.order_items[0].product_id);
        }).catch(function () {});
      }
      var invoiceNo = order.invoice_number;
      if (!invoiceNo) {
        try {
          var inv = await PR.call('issue tax invoice', function (sb) { return sb.rpc('issue_tax_invoice', { p_order_id: order.id }); });
          invoiceNo = inv.invoice_number;
        } catch (err) {
          PR.toast('Label ban gaya, par invoice nahi bana: ' + err.message, 'error');
        }
      }
      var url = '/admin/invoice/?type=tax&id=' + encodeURIComponent(order.id);
      if (tab) tab.location.href = invoiceNo ? url : (res.label_url || url);
      PR.toast('Ship ho gaya: ' + (res.courier || '') + ' · AWB ' + res.awb + (res.pickup ? ' · ' + res.pickup : ''), 'success');
      await reopen(order);
    } catch (err) {
      if (tab) tab.close();
      PR.setBusy(button, false);
      shipError[order.id] = 'Label nahi bana: ' + err.message;
      PR.toast(err.message, 'error');
      await reopen(order);
    }
  }

  async function reopen(order) {
    await refresh();
    detail(orders.find(function (o) { return o.id === order.id; }) || order);
  }

  async function loadTimeline(order) {
    var box = document.getElementById('timelineBox');
    if (!box) return;
    var rows;
    try {
      rows = await PR.call('load timeline', function (sb) {
        return sb.from('delivery_timeline').select('status,status_date,description').eq('order_id', order.id).order('status_date');
      }) || [];
    } catch (err) {
      return;
    }
    if (!rows.length) return;
    box.innerHTML = '<div style="margin-top:16px"><b style="font-size:12px;color:#6d6d6d">TIMELINE</b>' +
      rows.map(function (r) {
        return '<div style="display:flex;gap:10px;font-size:13px;margin-top:6px"><span class="nowrap" style="color:#6d6d6d">' +
          PR.formatDateTime(r.status_date + (/[zZ+]/.test(String(r.status_date).slice(19)) ? '' : 'Z')) + '</span><span>' +
          PR.esc(r.description || r.status) + '</span></div>';
      }).join('') + '</div>';
  }

  /* The invoice number is permanent: once issued it can't be reused or
     deleted (GST needs a continuous series), so ask before the first issue. */
  async function taxInvoice(order, button) {
    var url = '/admin/invoice/?type=tax&id=' + encodeURIComponent(order.id);
    if (order.invoice_number) { window.open(url, '_blank', 'noopener'); return; }
    if (!confirm('Issue a GST tax invoice for order ' + order.order_number + '?\n\n' +
                 'The next invoice number will be used permanently. Check the customer details, ' +
                 'GSTIN and HSN codes first. Usually issue it when the goods are dispatched.')) return;
    // open the tab now (still inside the click) so pop-up blockers allow it
    var tab = window.open('', '_blank');
    PR.setBusy(button, true, 'ISSUING…');
    try {
      var result = await PR.call('issue tax invoice', function (sb) {
        return sb.rpc('issue_tax_invoice', { p_order_id: order.id });
      });
      order.invoice_number = result.invoice_number;
      order.invoice_date = result.invoice_date;
      PR.toast('Tax invoice ' + result.invoice_number + ' issued.', 'success');
      if (tab) tab.location.href = url; else window.location.href = url;
      await refresh();
      detail(orders.find(function (o) { return o.id === order.id; }) || order);
    } catch (err) {
      if (tab) tab.close();
      PR.setBusy(button, false);
      PR.toast(err.message, 'error');
    }
  }

  async function saveOrder(event, order) {
    event.preventDefault();
    var button = document.getElementById('saveOrderBtn');
    var messageHost = document.getElementById('orderDetailMessage');
    messageHost.innerHTML = '';

    var status = document.getElementById('od_status').value;
    if (status === 'cancelled' && order.order_status !== 'cancelled') {
      if (!confirm('Cancel order ' + order.order_number + '?\n\n' +
                   'The stock reserved by this order will be returned to inventory.')) return;
    }

    var payload = {
      order_status: status,
      payment_status: document.getElementById('od_payment').value,
      courier_partner: document.getElementById('od_courier').value.trim() || null,
      tracking_number: document.getElementById('od_tracking').value.trim() || null,
      notes: document.getElementById('od_notes').value.trim() || null
    };
    var payReq = document.getElementById('od_payreq');
    if (payReq) {
      var adv = Number(document.getElementById('od_advance').value) || 0;
      if (adv < 0 || adv > Number(order.total_amount)) {
        PR.toast('Advance 0 se ' + PR.money(order.total_amount) + ' ke beech hona chahiye.', 'error');
        return;
      }
      payload.payment_request = payReq.value;
      payload.advance_amount = adv;
      if (payReq.value === 'paid') payload.payment_status = 'paid';
      if (adv > 0 && payReq.value === 'none') payload.payment_request = 'advance';
    }
    var testBox = document.getElementById('od_test');
    if (testBox && 'is_test' in order) payload.is_test = testBox.checked;

    PR.setBusy(button, true, 'SAVING…');
    try {
      await PR.call('update order', function (sb) {
        return sb.from('orders').update(payload).eq('id', order.id);
      });
      PRA.closeDrawer();
      PR.toast('Order ' + order.order_number + ' updated.', 'success');
      if (status === 'cancelled' && order.order_status !== 'cancelled' && order.invoice_number &&
          confirm('Is order ka Tax Invoice ' + order.invoice_number + ' ban chuka tha. GST ke liye Credit Note banana zaroori hai. Abhi banayein?')) {
        window.location.href = '/admin/credit-notes/?type=order&id=' + encodeURIComponent(order.id);
        return;
      }
      await refresh();
      PRA.loadBadges();
    } catch (err) {
      PR.setBusy(button, false);
      messageHost.innerHTML = '<div class="form-message error" role="alert">' + PR.esc(err.message) + '</div>';
      PR.toast(err.message, 'error');
    }
  }

  async function refresh() {
    await loadAll();
    render(contentHost);
  }

  document.addEventListener('click', function (event) {
    var send = event.target.closest('[data-pi-send]');
    if (send) {
      var o = orders.find(function (x) { return String(x.id) === send.getAttribute('data-pi-send'); });
      if (o) markPiSent(o);
      return;
    }
    var open = event.target.closest('[data-view-order]');
    if (!open) return;
    var order = orders.find(function (o) { return String(o.id) === String(open.getAttribute('data-view-order')); });
    if (order) detail(order);
  });

  PRA.boot('orders', 'Orders', async function (host) {
    contentHost = host;
    filterStatus = PR.param('status') || '';
    try {
      var st = await PR.getSettings();
      var priv = st.company_private || {};
      bankReady = !!(priv.bank_account_number || priv.upi_id);
    } catch (err) { bankReady = true; }
    host.innerHTML = '<div class="panel">' + PRA.skeleton(8) + '</div>';
    await loadAll();
    render(host);

    // Deep link from the dashboard: /admin/orders/?order=PR-2026-00001
    var target = PR.param('order');
    if (target) {
      var order = orders.find(function (o) { return o.order_number === target; });
      if (order) detail(order);
    }
  });
})();
