/* Admin - product review moderation */
(function () {
  'use strict';
  var PR = window.PR;
  var PRA = window.PRA;

  var STATUSES = ['pending', 'approved', 'rejected'];

  function stars(rating) {
    var n = Number(rating) || 0;
    return '★★★★★☆☆☆☆☆'.slice(5 - n, 10 - n);
  }

  function detail(row, update) {
    var product = row.products || {};
    PRA.openDrawer('Review — ' + (product.name || 'Product'),
      '<div id="recordMessage"></div>' +
      '<div class="form-grid">' +
        '<div><b style="font-size:12px;color:#6d6d6d">PRODUCT</b>' +
          '<p style="margin:6px 0 0"><b>' + PR.esc(product.name || '-') + '</b></p></div>' +
        '<div><b style="font-size:12px;color:#6d6d6d">CUSTOMER</b>' +
          '<p style="margin:6px 0 0">' + PR.esc(row.customer_name || '-') + '</p></div>' +
      '</div>' +

      '<div style="margin-top:16px"><b style="font-size:12px;color:#6d6d6d">RATING</b>' +
        '<p style="margin:6px 0 0;font-size:18px;color:#f5a623">' + stars(row.rating) +
        ' <span style="color:#6d6d6d;font-size:13px">(' + PR.esc(row.rating) + '/5)</span></p></div>' +

      (row.title ? '<div style="margin-top:12px"><b style="font-size:12px;color:#6d6d6d">TITLE</b>' +
        '<p style="margin:6px 0 0"><b>' + PR.esc(row.title) + '</b></p></div>' : '') +

      '<div style="margin-top:12px"><b style="font-size:12px;color:#6d6d6d">REVIEW</b>' +
        '<p style="margin:6px 0 0;line-height:1.7;white-space:pre-wrap">' + PR.esc(row.body) + '</p></div>' +
      '<div class="hint" style="margin-top:12px">Submitted ' + PR.formatDateTime(row.created_at) + '</div>' +

      '<form class="form" id="reviewForm" style="margin-top:18px;border-top:1px solid #eef0f3;padding-top:18px">' +
        '<label>Status<select id="rv_status">' +
          STATUSES.map(function (s) {
            return '<option value="' + s + '"' + (row.status === s ? ' selected' : '') + '>' + s + '</option>';
          }).join('') +
        '</select>' +
        '<span class="hint">Only approved reviews appear on the product page and in search results.</span></label>' +
        '<div class="page-actions" style="justify-content:flex-end">' +
          '<button class="btn" type="submit" id="saveReviewBtn">SAVE</button>' +
        '</div>' +
      '</form>');

    document.getElementById('reviewForm').addEventListener('submit', function (event) {
      event.preventDefault();
      update(row, { status: document.getElementById('rv_status').value },
        document.getElementById('saveReviewBtn'), 'recordMessage');
    });
  }

  PRA.recordPage({
    key: 'reviews',
    title: 'Product Reviews',
    table: 'product_reviews',
    select: 'id,rating,title,body,status,customer_name,created_at,product_id,products(name,slug)',
    statuses: STATUSES,
    statusField: 'status',
    searchPlaceholder: 'Search customer name or review text…',
    emptyTitle: 'No reviews yet',
    emptyMessage: 'Reviews from customers with a delivered order appear here for approval.',
    columns: [
      { head: 'Product', cell: function (r) { return PR.esc((r.products || {}).name || '-'); } },
      { head: 'Customer', cell: function (r) { return PR.esc(r.customer_name || '-'); } },
      { head: 'Rating', cell: function (r) { return '<span style="color:#f5a623">' + stars(r.rating) + '</span>'; } },
      { head: 'Review', cell: function (r) { return PR.esc((r.body || '').slice(0, 80)) + (r.body && r.body.length > 80 ? '…' : ''); } },
      { head: 'Submitted', cell: function (r) { return '<span class="nowrap">' + PR.formatDate(r.created_at) + '</span>'; } },
      { head: 'Status', cell: function (r) { return PRA.pill(r.status); } }
    ],
    detail: detail
  });
})();
