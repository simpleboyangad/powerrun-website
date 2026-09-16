/* PowerRun Industries - cart.
 *
 * The browser only ever stores product ids and quantities. Prices, stock and
 * availability are re-read from the database every time the cart is shown, so
 * a stale or tampered localStorage value can never change what is charged.
 */
(function () {
  'use strict';

  var PR = window.PR;
  var KEY = 'pr_cart';

  function read() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (!Array.isArray(raw)) return [];
      var map = new Map();
      raw.forEach(function (entry) {
        var id = entry && typeof entry === 'object' ? entry.id : entry;   // migrate legacy [id, id]
        var qty = entry && typeof entry === 'object' ? Number(entry.qty) || 1 : 1;
        if (id === null || id === undefined || id === '') return;
        var key = String(id);
        map.set(key, Math.max(1, (map.get(key) || 0) + Math.max(1, qty)));
      });
      return Array.from(map.entries()).map(function (pair) {
        return { id: pair[0], qty: pair[1] };
      });
    } catch (err) {
      console.error('[PowerRun] cart could not be read, resetting it:', err);
      return [];
    }
  }

  function write(items) {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch (err) {
      console.error('[PowerRun] cart could not be saved:', err);
      PR.toast('Your browser is blocking storage, so the cart cannot be saved.', 'error');
    }
    PR.updateCartBadge();
    document.dispatchEvent(new CustomEvent('pr:cart-changed'));
  }

  var cart = {
    items: read,

    count: function () {
      return read().reduce(function (sum, item) { return sum + Number(item.qty || 0); }, 0);
    },

    find: function (id) {
      return read().find(function (item) { return String(item.id) === String(id); }) || null;
    },

    add: function (product, qty) {
      qty = Math.max(1, Number(qty) || 1);

      if (!product.orderable) {
        PR.toast(product.name + ' is not available to order right now.', 'error');
        return false;
      }
      var items = read();
      var existing = items.find(function (item) { return String(item.id) === String(product.id); });
      var wanted = (existing ? existing.qty : 0) + qty;

      if (wanted > product.stock) {
        PR.toast('Only ' + product.stock + ' unit' + (product.stock === 1 ? '' : 's') +
                 ' of ' + product.name + ' are in stock.', 'error');
        if (!existing || existing.qty >= product.stock) return false;
        wanted = product.stock;
      }

      if (existing) existing.qty = wanted;
      else items.push({ id: String(product.id), qty: wanted });

      write(items);
      PR.toast(product.name + ' added to cart.', 'success');
      return true;
    },

    setQty: function (id, qty, maxStock) {
      qty = Number(qty) || 0;
      if (qty <= 0) return cart.remove(id);
      if (Number.isFinite(maxStock) && qty > maxStock) {
        PR.toast('Only ' + maxStock + ' in stock.', 'error');
        qty = maxStock;
      }
      var items = read();
      var existing = items.find(function (item) { return String(item.id) === String(id); });
      if (!existing) return false;
      existing.qty = qty;
      write(items);
      return true;
    },

    remove: function (id) {
      write(read().filter(function (item) { return String(item.id) !== String(id); }));
      return true;
    },

    clear: function () { write([]); },

    /* Resolve the stored ids against the live catalogue.
     * Returns { lines, subtotal, issues } where a line carries the product row
     * and any correction that had to be applied. */
    resolve: async function () {
      var stored = read();
      if (!stored.length) return { lines: [], subtotal: 0, issues: [] };

      // Category names are resolved from the categories list, so make sure it
      // is loaded before normalising - otherwise cart rows show a blank category.
      await PR.ensureCategories();

      var ids = stored.map(function (item) { return item.id; });
      var rows = await PR.call('load cart products', function (sb) {
        return sb.from('products')
          .select('*, product_images(id,image_url,storage_path,sort_order)')
          .in('id', ids);
      });

      var products = (rows || []).map(PR.normalizeProduct);
      var lines = [];
      var issues = [];
      var changed = false;

      stored.forEach(function (item) {
        var product = products.find(function (p) { return String(p.id) === String(item.id); });

        if (!product || !product.isActive) {
          issues.push('An item that is no longer available was removed from your cart.');
          changed = true;
          return;
        }
        if (!Number.isFinite(product.price) || product.price <= 0) {
          issues.push(product.name + ' is price-on-request and was removed. Please enquire on WhatsApp.');
          changed = true;
          return;
        }
        if (product.availability === 'out_of_stock' || product.availability === 'discontinued' || product.stock <= 0) {
          issues.push(product.name + ' is out of stock and was removed from your cart.');
          changed = true;
          return;
        }

        var qty = Math.max(1, Number(item.qty) || 1);
        if (qty > product.stock) {
          issues.push('Only ' + product.stock + ' of ' + product.name + ' are in stock; the quantity was reduced.');
          qty = product.stock;
          changed = true;
        }

        lines.push({ product: product, qty: qty, lineTotal: product.price * qty });
      });

      if (changed) {
        write(lines.map(function (line) { return { id: String(line.product.id), qty: line.qty }; }));
      }

      var subtotal = lines.reduce(function (sum, line) { return sum + line.lineTotal; }, 0);
      return { lines: lines, subtotal: subtotal, issues: issues };
    }
  };

  PR.cart = cart;

  // Keep the badge in step across tabs.
  window.addEventListener('storage', function (event) {
    if (event.key === KEY) PR.updateCartBadge();
  });

  document.addEventListener('DOMContentLoaded', function () { PR.updateCartBadge(); });
})();
