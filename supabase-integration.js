/* PowerRun Industries - Supabase production integration.
 * This file uses only the public publishable key; never add service-role keys here.
 */
const SUPABASE_URL = 'https://nnkopxkyxcmtiunftlgr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_n5WIw0oyN0w8K6Z5mlfawA_QbM7iHqf';
const PR_WA = '918700307676';
const { createClient } = window.supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
window.PR_SB = sb;

let dbProducts = [];
let dbCategories = [];
let currentSearch = '';
let editingProductId = null;
let editingExistingImages = [];
let selectedNewFiles = [];
let dbCart = normaliseCart(JSON.parse(localStorage.getItem('pr_cart') || '[]'));

function esc2(s) { return String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function money2(v) { return v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? '₹' + Number(v).toLocaleString('en-IN') : 'Price not set'; }
function slugify(s) { return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function normaliseCart(value) {
  const merged = new Map();
  (Array.isArray(value) ? value : []).forEach(item => {
    const id = typeof item === 'string' ? item : item?.id;
    const quantity = Math.max(1, Number(typeof item === 'string' ? 1 : item?.quantity) || 1);
    if (id) merged.set(id, (merged.get(id) || 0) + quantity);
  });
  return [...merged].map(([id, quantity]) => ({ id, quantity }));
}
function saveCart2() {
  dbCart = normaliseCart(dbCart);
  localStorage.setItem('pr_cart', JSON.stringify(dbCart));
  const badge = document.getElementById('cartCount');
  if (badge) badge.textContent = dbCart.reduce((sum, item) => sum + item.quantity, 0);
}
function cartLines2() { return dbCart.map(item => ({ ...item, product: dbProducts.find(p => p.id === item.id) })).filter(item => item.product); }
function hasPrice2(p) { return p?.price !== null && p?.price !== undefined && p.price !== '' && Number.isFinite(Number(p.price)) && Number(p.price) >= 0; }
function normaliseProduct(p) {
  const images = (p.product_images || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(x => ({ url: x.image_url, path: x.storage_path, id: x.id }));
  const specs = p.specifications?.text || (typeof p.specifications === 'string' ? p.specifications : '');
  return { id: p.id, name: p.name, category: p.categories?.name || 'Uncategorized', category_id: p.category_id, price: p.price, sku: p.sku || '', short: p.short_description || '', description: p.description || '', specs, featured: !!p.is_featured, new: !!p.is_new, visible: !!p.is_active, images: images.map(x => x.url), _images: images };
}
async function loadCategories() {
  const { data, error } = await sb.from('categories').select('*').eq('is_active', true).order('sort_order');
  if (error) { console.error(error); return []; }
  dbCategories = data || [];
  return dbCategories;
}
async function loadProducts(admin = false) {
  let query = sb.from('products').select('*, categories(name), product_images(id,image_url,storage_path,sort_order)').order('created_at', { ascending: true });
  if (!admin) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) { console.error(error); alert('Products load failed: ' + error.message); return []; }
  dbProducts = (data || []).map(normaliseProduct);
  window.products = dbProducts;
  return dbProducts;
}
async function initProduction() {
  await Promise.all([loadCategories(), loadProducts(false)]);
  window.currentCat = 'ALL';
  currentSearch = '';
  renderTabs2();
  renderProducts2();
  saveCart2();
}
function renderTabs2() {
  const el = document.getElementById('tabs'); if (!el) return;
  const cats = ['ALL', ...dbCategories.map(c => c.name)];
  el.innerHTML = cats.map(c => `<button class="tab ${window.currentCat === c ? 'active' : ''}" onclick='filterCat2(${JSON.stringify(c)})'>${c === 'ALL' ? 'ALL' : esc2(c).toUpperCase()}</button>`).join('');
}
function filterCat2(category) { window.currentCat = category; currentSearch = ''; renderTabs2(); renderProducts2(); document.querySelector('#products')?.scrollIntoView({ behavior: 'smooth' }); }
function productMatches2(p) { const q = currentSearch.toLowerCase(); return !q || [p.name, p.category, p.sku, p.short, p.description].some(v => String(v || '').toLowerCase().includes(q)); }
function renderProducts2() {
  const grid = document.getElementById('productGrid'); if (!grid) return;
  const list = dbProducts.filter(p => (window.currentCat === 'ALL' || p.category === window.currentCat) && productMatches2(p));
  grid.innerHTML = list.map(p => `<article class="card"><div class="card-img">${p.images?.[0] ? `<img src="${esc2(p.images[0])}" alt="${esc2(p.name)}">` : `<div class="ph">${esc2(initials(p.name))}</div>`}</div>${p.new ? '<span class="tag">NEW</span>' : ''}<div class="card-body"><div class="catname">${esc2(p.category)}</div><h3>${esc2(p.name)}</h3><p>${esc2(p.short)}</p><div class="card-foot"><span class="price">${money2(p.price)}</span><button class="outline" onclick='viewProduct2(${JSON.stringify(p.id)})'>Details</button></div><div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap"><button class="btn orange" style="padding:8px 10px;font-size:11px" onclick='buyNow2(${JSON.stringify(p.id)})'>BUY NOW</button><button class="outline" onclick='addCart2(${JSON.stringify(p.id)})'>+ CART</button><button class="outline" onclick='wa2(${JSON.stringify(p.id)})'>WHATSAPP</button></div></div></article>`).join('') || '<p>No products match your search.</p>';
}
function viewProduct2(id) {
  const p = dbProducts.find(x => x.id === id); if (!p) return;
  document.getElementById('drawer').innerHTML = `<button class="close" onclick="closeOverlay()">×</button><h2>${esc2(p.name)}</h2><div class="catname">${esc2(p.category)}${p.sku ? ' • ' + esc2(p.sku) : ''}</div><div class="gallery">${(p.images || []).map(x => `<img src="${esc2(x)}" alt="${esc2(p.name)}">`).join('') || '<div class="ph">PR</div>'}</div><h3>${money2(p.price)}</h3><p>${esc2(p.description)}</p><p><b>Specifications</b><br>${esc2(p.specs)}</p><button class="btn orange" onclick='buyNow2(${JSON.stringify(p.id)})'>BUY NOW</button> <button class="outline" onclick='addCart2(${JSON.stringify(p.id)})'>+ CART</button>`;
  document.getElementById('overlay').classList.add('show');
}
function addCart2(id) {
  const item = dbCart.find(x => x.id === id);
  if (item) item.quantity += 1; else dbCart.push({ id, quantity: 1 });
  saveCart2(); alert('Added to cart.');
}
function changeCartQty2(id, change) { const item = dbCart.find(x => x.id === id); if (!item) return; item.quantity += change; if (item.quantity <= 0) dbCart = dbCart.filter(x => x.id !== id); saveCart2(); openCart2(); }
function removeCart2(id) { dbCart = dbCart.filter(x => x.id !== id); saveCart2(); openCart2(); }
function clearCart2() { if (!dbCart.length || confirm('Clear all items from the cart?')) { dbCart = []; saveCart2(); openCart2(); } }
function wa2(id) { const p = dbProducts.find(x => x.id === id); if (p) location.href = 'https://wa.me/' + PR_WA + '?text=' + encodeURIComponent('Hello PowerRun Industries, I am interested in ' + p.name); }
function waCart2() { const lines = cartLines2(); location.href = 'https://wa.me/' + PR_WA + '?text=' + encodeURIComponent('Hello PowerRun Industries, I am interested in:\n' + lines.map(x => '• ' + x.product.name + ' × ' + x.quantity).join('\n')); }
function openCart2() {
  const lines = cartLines2(); const total = lines.reduce((sum, x) => sum + (hasPrice2(x.product) ? Number(x.product.price) * x.quantity : 0), 0); const unavailable = lines.some(x => !hasPrice2(x.product));
  const rows = lines.map(x => `<div style="display:grid;grid-template-columns:56px 1fr auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid #eee">${x.product.images?.[0] ? `<img src="${esc2(x.product.images[0])}" alt="" style="width:56px;height:56px;object-fit:cover">` : '<div class="ph" style="width:56px;height:56px">PR</div>'}<div><b>${esc2(x.product.name)}</b><br><small>${money2(x.product.price)}</small><br><button class="outline" style="padding:3px 8px" onclick='changeCartQty2(${JSON.stringify(x.id)},-1)'>−</button> <b>${x.quantity}</b> <button class="outline" style="padding:3px 8px" onclick='changeCartQty2(${JSON.stringify(x.id)},1)'>+</button></div><div style="text-align:right"><b>${hasPrice2(x.product) ? money2(Number(x.product.price) * x.quantity) : '—'}</b><br><button class="outline" style="padding:3px 8px" onclick='removeCart2(${JSON.stringify(x.id)})'>Remove</button></div></div>`).join('');
  document.getElementById('drawer').innerHTML = `<button class="close" onclick="closeOverlay()">×</button><h2>Your Cart</h2>${lines.length ? `${rows}<p style="text-align:right"><b>Total: ${money2(total)}</b>${unavailable ? '<br><small>Set a price in Admin before checkout.</small>' : ''}</p><button class="btn orange" ${unavailable ? 'disabled title="A price is required for checkout"' : ''} onclick="checkoutCart2()">CHECKOUT</button> <button class="outline" onclick="clearCart2()">CLEAR CART</button> <button class="outline" onclick="waCart2()">WHATSAPP</button>` : '<p>Your cart is empty.</p>'}`;
  document.getElementById('overlay').classList.add('show');
}
function checkoutCart2() { const lines = cartLines2(); if (!lines.length) return; if (lines.some(x => !hasPrice2(x.product))) { alert('A product has no price. Please set it in Admin before checkout.'); return; } checkoutForm2(lines); }
function buyNow2(id) { const p = dbProducts.find(x => x.id === id); if (!p) return; if (!hasPrice2(p)) { alert('This product has no price yet. Set its price in Admin before accepting an order.'); return; } checkoutForm2([{ id, quantity: 1, product: p }]); }
function checkoutForm2(lines) {
  const total = lines.reduce((sum, x) => sum + Number(x.product.price) * x.quantity, 0);
  const summary = lines.map(x => `<li>${esc2(x.product.name)} × ${x.quantity} — ${money2(Number(x.product.price) * x.quantity)}</li>`).join('');
  document.getElementById('drawer').innerHTML = `<button class="close" onclick="closeOverlay()">×</button><h2>Checkout</h2><ul>${summary}</ul><p><b>Total: ${money2(total)}</b></p><div class="form"><label>Name<input id="co_name" required></label><label>Mobile<input id="co_mobile" required inputmode="tel"></label><label>Email<input id="co_email" type="email"></label><label>Address<textarea id="co_address"></textarea></label><label>City<input id="co_city"></label><label>State<input id="co_state"></label><label>Pincode<input id="co_pincode" inputmode="numeric"></label><button class="btn orange" onclick='placeOrder2(${JSON.stringify(lines.map(x => ({ id: x.id, quantity: x.quantity })) )})'>PLACE ORDER</button></div>`;
  document.getElementById('overlay').classList.add('show');
}
async function placeOrder2(rawLines) {
  const lines = normaliseCart(rawLines).map(x => ({ ...x, product: dbProducts.find(p => p.id === x.id) })).filter(x => x.product);
  const name = document.getElementById('co_name').value.trim(); const mobile = document.getElementById('co_mobile').value.trim();
  if (!name || !mobile) { alert('Name and mobile are required.'); return; }
  if (!lines.length || lines.some(x => !hasPrice2(x.product))) { alert('A valid product price is required before placing an order.'); return; }
  const { data, error } = await sb.rpc('create_website_order', {
    p_customer: { name, mobile, email: document.getElementById('co_email').value.trim() || null, address: document.getElementById('co_address').value.trim() || null, city: document.getElementById('co_city').value.trim() || null, state: document.getElementById('co_state').value.trim() || null, pincode: document.getElementById('co_pincode').value.trim() || null },
    p_items: lines.map(x => ({ product_id: x.product.id, quantity: x.quantity }))
  });
  if (error) { alert('Order failed: ' + error.message); return; }
  const order = Array.isArray(data) ? data[0] : data;
  const orderedIds = new Set(lines.map(x => x.id)); dbCart = dbCart.filter(x => !orderedIds.has(x.id)); saveCart2(); closeOverlay(); alert('Order submitted successfully. Order ID: ' + (order?.order_number || 'created'));
}
function focusSearch2() { const term = prompt('Search products'); if (term === null) return; currentSearch = term.trim(); window.currentCat = 'ALL'; renderTabs2(); renderProducts2(); document.querySelector('#products')?.scrollIntoView({ behavior: 'smooth' }); }
function adminLoginModal() { document.getElementById('drawer').innerHTML = `<button class="close" onclick="closeOverlay()">×</button><h2>Admin Login</h2><p>PowerRun Industries secure administration.</p><div class="form"><label>Email<input id="ae" type="email" autocomplete="username"></label><label>Password<input id="ap" type="password" autocomplete="current-password"></label><button class="btn orange" onclick="doAdminLogin()">LOGIN</button></div>`; document.getElementById('overlay').classList.add('show'); }
async function isAdmin2() { const { data: { user } } = await sb.auth.getUser(); if (!user) return false; const { data, error } = await sb.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle(); return !error && !!data; }
async function doAdminLogin() { const email = document.getElementById('ae').value.trim(), password = document.getElementById('ap').value; if (!email || !password) { alert('Enter email and password.'); return; } const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) { alert('Login failed: ' + error.message); return; } if (!await isAdmin2()) { await sb.auth.signOut(); alert('This account is not an authorized PowerRun admin.'); return; } openAdmin2(); }
async function openAdmin2() { if (!await isAdmin2()) { adminLoginModal(); return; } closeOverlay(); document.getElementById('site').style.display = 'none'; document.getElementById('admin').classList.add('show'); await renderAdmin2(); }
async function adminLogout2() { await sb.auth.signOut(); document.getElementById('admin').classList.remove('show'); document.getElementById('site').style.display = 'block'; await initProduction(); }
async function loadAdminData() { await Promise.all([loadCategories(), loadProducts(true)]); }
function adminHeader() { return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h1>Dashboard</h1><button class="admin-btn" onclick="adminLogout2()">Logout</button></div>'; }
async function renderAdmin2() { await loadAdminData(); const [orders, leads] = await Promise.all([sb.from('orders').select('*', { count: 'exact', head: true }), sb.from('leads').select('*', { count: 'exact', head: true })]); const el = document.getElementById('adminContent'); el.innerHTML = adminHeader() + `<div class="stats"><div class="stat"><small>Total Products</small><strong>${dbProducts.length}</strong></div><div class="stat"><small>Categories</small><strong>${dbCategories.length}</strong></div><div class="stat"><small>Orders</small><strong>${orders.count || 0}</strong></div><div class="stat"><small>Leads</small><strong>${leads.count || 0}</strong></div></div><div class="admin-table"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h2>Product Management</h2><button class="admin-btn" onclick="editProduct2()">+ Add Product</button></div><table><thead><tr><th>Product</th><th>Category</th><th>SKU</th><th>Photos</th><th>Status</th><th>Action</th></tr></thead><tbody>${dbProducts.map(p => `<tr><td>${esc2(p.name)}</td><td>${esc2(p.category)}</td><td>${esc2(p.sku)}</td><td>${p._images.length}/5</td><td>${p.visible ? 'Visible' : 'Hidden'}</td><td><button class="admin-btn gray" onclick='editProduct2(${JSON.stringify(p.id)})'>Edit</button> <button class="admin-btn" onclick='deleteProduct2(${JSON.stringify(p.id)})'>Delete</button></td></tr>`).join('')}</tbody></table></div>`; }
function showProductManager() { renderAdmin2(); }
async function editProduct2(id) { await loadAdminData(); editingProductId = id || null; selectedNewFiles = []; const p = id ? dbProducts.find(x => x.id === id) : { name: '', category_id: dbCategories[0]?.id || '', price: '', sku: '', short: '', description: '', specs: '', featured: false, new: true, visible: true, _images: [] }; editingExistingImages = [...(p._images || [])]; const el = document.getElementById('adminContent'); el.innerHTML = `<h1>${id ? 'Edit' : 'Add'} Product</h1><div class="admin-table"><div class="form"><label>Product Name<input id="f2_name" value="${esc2(p.name)}"></label><label>Category<select id="f2_cat">${dbCategories.map(c => `<option value="${esc2(c.id)}" ${c.id === p.category_id ? 'selected' : ''}>${esc2(c.name)}</option>`).join('')}</select></label><label>Price (optional)<input id="f2_price" type="number" min="0" value="${esc2(p.price ?? '')}"></label><label>SKU<input id="f2_sku" value="${esc2(p.sku)}"></label><label>Short Description<textarea id="f2_short">${esc2(p.short)}</textarea></label><label>Full Description<textarea id="f2_desc">${esc2(p.description)}</textarea></label><label>Specifications<textarea id="f2_specs">${esc2(p.specs)}</textarea></label><div><label>Product Photos — maximum 5</label><div class="thumbs" id="existingThumbs">${editingExistingImages.map((x, i) => `<div style="position:relative"><img src="${esc2(x.url)}"><button type="button" onclick="removeExistingImage2(${i})" style="position:absolute;right:-5px;top:-5px;border:0;background:#f55;color:#fff;border-radius:50%;width:20px;height:20px;cursor:pointer">×</button></div>`).join('')}</div><div class="drop"><input id="f2_files" type="file" accept="image/jpeg,image/png,image/webp" multiple onchange="selectFiles2(this)"><p>JPG/PNG/WebP • up to 5 total images</p></div><div class="thumbs" id="newThumbs"></div></div><label><input id="f2_new" type="checkbox" ${p.new ? 'checked' : ''}> Mark as NEW</label><label><input id="f2_featured" type="checkbox" ${p.featured ? 'checked' : ''}> Featured Product</label><label><input id="f2_visible" type="checkbox" ${p.visible !== false ? 'checked' : ''}> Visible on website</label><div><button class="admin-btn" onclick="saveProduct2()">Save Product</button> <button class="admin-btn gray" onclick="renderAdmin2()">Cancel</button></div></div></div>`; }
function selectFiles2(input) { const files = [...input.files]; if (editingExistingImages.length + files.length > 5) { alert('Maximum 5 photos total.'); input.value = ''; return; } selectedNewFiles = files; document.getElementById('newThumbs').innerHTML = files.map(f => `<img src="${URL.createObjectURL(f)}" alt="preview">`).join(''); }
async function removeExistingImage2(i) { const item = editingExistingImages[i]; if (!item || !confirm('Delete this product image?')) return; if (item.path) { const { error } = await sb.storage.from('product-images').remove([item.path]); if (error) { alert(error.message); return; } } const { error } = await sb.from('product_images').delete().eq('id', item.id); if (error) { alert(error.message); return; } editingExistingImages.splice(i, 1); await editProduct2(editingProductId); }
async function saveProduct2() { const name = document.getElementById('f2_name').value.trim(), category_id = document.getElementById('f2_cat').value, price = document.getElementById('f2_price').value, sku = document.getElementById('f2_sku').value.trim() || ('PR-' + Date.now()); if (!name || !category_id) { alert('Product name and category are required.'); return; } const payload = { category_id, name, slug: slugify(name) + '-' + sku.toLowerCase(), sku, short_description: document.getElementById('f2_short').value.trim(), description: document.getElementById('f2_desc').value.trim(), price: price === '' ? null : Number(price), specifications: { text: document.getElementById('f2_specs').value.trim() }, is_active: document.getElementById('f2_visible').checked, is_featured: document.getElementById('f2_featured').checked, is_new: document.getElementById('f2_new').checked, updated_at: new Date().toISOString() }; let product, error; if (editingProductId) ({ data: product, error } = await sb.from('products').update(payload).eq('id', editingProductId).select().single()); else ({ data: product, error } = await sb.from('products').insert(payload).select().single()); if (error) { alert('Save failed: ' + error.message); return; } for (let i = 0; i < selectedNewFiles.length; i += 1) { const file = selectedNewFiles[i], safe = file.name.toLowerCase().replace(/[^a-z0-9._-]/g, '-'), path = `${product.id}/${Date.now()}-${i}-${safe}`; const upload = await sb.storage.from('product-images').upload(path, file, { contentType: file.type, upsert: false }); if (upload.error) { alert('Image upload failed: ' + upload.error.message); continue; } const url = sb.storage.from('product-images').getPublicUrl(path).data.publicUrl; const { error: imageError } = await sb.from('product_images').insert({ product_id: product.id, image_url: url, storage_path: path, sort_order: editingExistingImages.length + i }); if (imageError) alert('Image record failed: ' + imageError.message); } selectedNewFiles = []; await renderAdmin2(); alert('Product saved successfully.'); }
async function deleteProduct2(id) { if (!confirm('Delete this product and its images?')) return; const { error } = await sb.from('products').delete().eq('id', id); if (error) { alert('Delete failed: ' + error.message); return; } await renderAdmin2(); }
async function adminOrders() { const { data: orders, error } = await sb.from('orders').select('*').order('created_at', { ascending: false }); if (error) { alert(error.message); return; } const ids = (orders || []).map(o => o.id); const itemsResult = ids.length ? await sb.from('order_items').select('*').in('order_id', ids) : { data: [] }; const itemsByOrder = (itemsResult.data || []).reduce((map, item) => { (map[item.order_id] ||= []).push(item); return map; }, {}); document.getElementById('adminContent').innerHTML = `<h1>Orders</h1><div class="admin-table"><table><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Date</th></tr>${(orders || []).map(o => `<tr><td>${esc2(o.order_number)}</td><td>${esc2(o.customer_name)}<br>${esc2(o.customer_mobile)}${o.customer_email ? '<br>' + esc2(o.customer_email) : ''}</td><td>${(itemsByOrder[o.id] || []).map(i => `${esc2(i.product_name)} × ${i.quantity}`).join('<br>') || '—'}</td><td>${money2(o.total_amount)}</td><td><select onchange='updateOrder2(${JSON.stringify(o.id)},this.value)'><option ${o.order_status === 'new' ? 'selected' : ''}>new</option><option ${o.order_status === 'processing' ? 'selected' : ''}>processing</option><option ${o.order_status === 'shipped' ? 'selected' : ''}>shipped</option><option ${o.order_status === 'delivered' ? 'selected' : ''}>delivered</option><option ${o.order_status === 'cancelled' ? 'selected' : ''}>cancelled</option></select></td><td>${o.created_at ? new Date(o.created_at).toLocaleString('en-IN') : ''}</td></tr>`).join('')}</table></div>`; }
async function updateOrder2(id, status) { const { error } = await sb.from('orders').update({ order_status: status, updated_at: new Date().toISOString() }).eq('id', id); if (error) alert(error.message); }
async function adminLeads() { const { data, error } = await sb.from('leads').select('*, products(name)').order('created_at', { ascending: false }); if (error) { alert(error.message); return; } document.getElementById('adminContent').innerHTML = `<h1>Leads</h1><div class="admin-table"><table><tr><th>Customer</th><th>Product</th><th>Mobile</th><th>City</th><th>Status</th><th>Date</th></tr>${(data || []).map(l => `<tr><td>${esc2(l.name)}</td><td>${esc2(l.products?.name || 'General')}</td><td>${esc2(l.mobile)}</td><td>${esc2(l.city || '')}</td><td><select onchange='updateLead2(${JSON.stringify(l.id)},this.value)'><option ${l.status === 'new' ? 'selected' : ''}>new</option><option ${l.status === 'contacted' ? 'selected' : ''}>contacted</option><option ${l.status === 'quoted' ? 'selected' : ''}>quoted</option><option ${l.status === 'converted' ? 'selected' : ''}>converted</option><option ${l.status === 'closed' ? 'selected' : ''}>closed</option></select></td><td>${l.created_at ? new Date(l.created_at).toLocaleString('en-IN') : ''}</td></tr>`).join('')}</table></div>`; }
async function updateLead2(id, status) { const { error } = await sb.from('leads').update({ status, updated_at: new Date().toISOString() }).eq('id', id); if (error) alert(error.message); }

// Supersede every legacy inline handler in index.html.
Object.assign(window, { openAdmin: openAdmin2, openCart: openCart2, addCart: addCart2, buyNow: buyNow2, wa: wa2, viewProduct: viewProduct2, showProductManager, adminOrders, adminLeads, renderAdmin: renderAdmin2, filterCat: filterCat2, focusSearch: focusSearch2, closeAdmin: async () => { document.getElementById('admin').classList.remove('show'); document.getElementById('site').style.display = 'block'; await initProduction(); } });
document.querySelector('.cart')?.addEventListener('click', event => { event.preventDefault(); openCart2(); });
initProduction();
