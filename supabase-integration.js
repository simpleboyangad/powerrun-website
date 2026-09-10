/* PowerRun Industries - production Supabase integration
 * Public/publishable key only. Never put service_role/secret/payment secrets here.
 */
(() => {
  'use strict';

  const SUPABASE_URL = 'https://nnkopxkyxcmtiunftlgr.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_n5WIw0oyN0w8K6Z5mlfawA_QbM7iHqf';
  const PR_WA = '918700307676';
  const REQUIRED_CATEGORIES = [
    'Hybrid Inverters','Lithium Batteries','Solar Panels','E-Rickshaw Batteries',
    'Home Energy Storage','Commercial Energy Storage','Industrial Energy Solutions',
    'EV Batteries','UPS & Power Backup','Accessories & Spare Parts'
  ];

  const { createClient } = window.supabase;
  const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.PR_SB = sb;

  let dbProducts = [];
  let dbCategories = [];
  let cart = normalizeCart(localStorage.getItem('pr_cart'));
  let currentCat = 'ALL';
  let searchTerm = '';
  let sortMode = 'featured';
  let editingProductId = null;
  let editingExistingImages = [];
  let selectedNewFiles = [];

  function normalizeCart(raw) {
    try {
      const value = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(value)) return [];
      // Migrate the old [productId, productId] cart into [{id,qty}].
      const map = new Map();
      value.forEach(item => {
        const id = item && typeof item === 'object' ? item.id : item;
        const qty = item && typeof item === 'object' ? Number(item.qty || 1) : 1;
        if (id !== undefined && id !== null) {
          const key = String(id);
          map.set(key, (map.get(key) || 0) + Math.max(1, qty));
        }
      });
      return [...map.entries()].map(([id, qty]) => ({ id, qty }));
    } catch (_) { return []; }
  }
  function saveCart() { localStorage.setItem('pr_cart', JSON.stringify(cart)); updateCartCount(); }
  function cartCount() { return cart.reduce((sum, x) => sum + Number(x.qty || 0), 0); }
  function updateCartCount() { const el = document.getElementById('cartCount'); if (el) el.textContent = String(cartCount()); }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
  function money(v) {
    if (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) return 'Price on request';
    return '₹' + Number(v).toLocaleString('en-IN');
  }
  function priceBlock(p) {
    const price = Number(p.price);
    const mrp = Number(p.mrp);
    const hasPrice = Number.isFinite(price) && price > 0;
    const hasMrp = Number.isFinite(mrp) && mrp > 0 && hasPrice && mrp > price;
    let html = '<div class="price-row"><span class="price-now">' + money(p.price) + '</span>';
    if (hasMrp) {
      const pct = Math.round((1 - price / mrp) * 100);
      html += '<span class="price-mrp">' + money(p.mrp) + '</span><span class="discount-badge">-' + pct + '%</span>';
    }
    html += '</div>';
    if (hasPrice) {
      const months = 12;
      const perMonth = Math.round(price / months);
      html += '<div class="emi-note">⚡ EMI from <b>' + money(perMonth) + '</b>/mo · ' + months + ' months · EMI options available on request</div>';
    }
    return html;
  }
  function specBlock(p) {
    if (Array.isArray(p.specRows) && p.specRows.length) {
      const rows = p.specRows.map(r => '<tr><td>' + esc(r.label) + '</td><td>' + esc(r.value) + '</td></tr>').join('');
      return '<div class="spec-table-wrap"><b>Specifications</b><table class="spec-table"><tbody>' + rows + '</tbody></table></div>';
    }
    return '<div class="spec-box"><b>Specifications</b><div>' + esc(p.specs || 'Specifications not provided.') + '</div></div>';
  }
  function breadcrumb(p) {
    return '<nav class="breadcrumb" aria-label="Breadcrumb"><a href="#" onclick="closeOverlay();return false;">Home</a> / <a href="#products" onclick="closeOverlay()">Shop</a> / <span>' + esc(p.category || '') + '</span> / <span aria-current="page">' + esc(p.name) + '</span></nav>';
  }
  function slugify(s) { return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
  function toast(message, type='info') {
    let host = document.getElementById('prToastHost');
    if (!host) { host = document.createElement('div'); host.id='prToastHost'; host.className='toast-host'; document.body.appendChild(host); }
    const item = document.createElement('div'); item.className = 'toast ' + type; item.textContent = message; host.appendChild(item);
    setTimeout(() => item.remove(), 3600);
  }
  function setBusy(button, busy, text='Please wait…') {
    if (!button) return;
    if (busy) { button.dataset.oldText = button.textContent; button.disabled = true; button.textContent = text; }
    else { button.disabled = false; button.textContent = button.dataset.oldText || button.textContent; }
  }
  function openDrawer(html) { const drawer=document.getElementById('drawer'); if(!drawer)return; drawer.innerHTML=html; document.getElementById('overlay').classList.add('show'); }
  function closeOverlay(){ document.getElementById('overlay')?.classList.remove('show'); }
  window.closeOverlay = closeOverlay;

  function normalizeProduct(p) {
    const images = (p.product_images || []).slice().sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map(x => ({id:x.id,url:x.image_url,path:x.storage_path,sort_order:x.sort_order||0}));
    const specs = p.specifications?.text ?? (typeof p.specifications === 'string' ? p.specifications : '');
    const specRows = Array.isArray(p.specifications?.rows) ? p.specifications.rows : null;
    return {
      id: p.id, name: p.name, category: p.categories?.name || 'Uncategorized', category_id: p.category_id,
      price: p.price, mrp: p.mrp ?? null, sku: p.sku || '', short: p.short_description || '', description: p.description || '', specs, specRows,
      featured: !!p.is_featured, new: !!p.is_new, visible: p.is_active !== false, images: images.map(x=>x.url), _images: images
    };
  }

  async function loadCategories() {
    const { data, error } = await sb.from('categories').select('*').eq('is_active', true).order('sort_order', {ascending:true});
    if (error) { console.error('categories:', error); dbCategories = dbCategories.length ? dbCategories : REQUIRED_CATEGORIES.map((name,i)=>({id:'local-'+i,name,is_active:true,sort_order:i})); return dbCategories; }
    dbCategories = data || [];
    return dbCategories;
  }

  async function loadProducts(admin=false) {
    let q = sb.from('products').select('*, categories(name), product_images(id,image_url,storage_path,sort_order)').order('created_at', {ascending:true});
    if (!admin) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) { console.error('products:', error); if (Array.isArray(window.PR_SEED)) { dbProducts = window.PR_SEED.map(p=>({...p,_images:(p.images||[]).map((url,i)=>({id:'local-'+i,url,path:null,sort_order:i}))})); } else { dbProducts = []; } toast('Live product data could not be loaded; showing the available local fallback.', 'error'); return dbProducts; }
    dbProducts = (data || []).map(normalizeProduct);
    return dbProducts;
  }

  function allCategoryNames() {
    return ['ALL', ...new Set([...REQUIRED_CATEGORIES, ...dbCategories.map(c=>c.name)])];
  }

  function renderTabs() {
    const el = document.getElementById('tabs'); if (!el) return;
    el.innerHTML = allCategoryNames().map(c => `<button type="button" class="tab ${currentCat===c?'active':''}" data-cat="${esc(c)}">${c==='ALL'?'ALL':esc(c).toUpperCase()}</button>`).join('');
    el.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => filterCat(btn.dataset.cat)));
  }
  function filterCat(c) { currentCat = c || 'ALL'; renderTabs(); renderProducts(); document.getElementById('products')?.scrollIntoView({behavior:'smooth',block:'start'}); }
  window.filterCat = filterCat;

  function productMatches(p, q) {
    if (!q) return true;
    const hay = [p.name,p.sku,p.category,p.short,p.description,p.specs].join(' ').toLowerCase();
    return hay.includes(q.toLowerCase());
  }
  function getVisibleProducts() {
    let list = currentCat==='ALL' ? [...dbProducts] : dbProducts.filter(p=>p.category===currentCat);
    list = list.filter(p=>p.visible && productMatches(p, searchTerm));
    if (sortMode==='price-asc') list.sort((a,b)=>(Number(a.price)||Infinity)-(Number(b.price)||Infinity));
    else if (sortMode==='price-desc') list.sort((a,b)=>(Number(b.price)||0)-(Number(a.price)||0));
    else if (sortMode==='name') list.sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    else list.sort((a,b)=>(Number(b.featured)-Number(a.featured)) || (Number(b.new)-Number(a.new)));
    return list;
  }

  function renderProducts() {
    const grid=document.getElementById('productGrid'); if(!grid)return;
    const list=getVisibleProducts();
    const countEl=document.getElementById('productCount'); if(countEl)countEl.textContent=`${list.length} product${list.length===1?'':'s'}`;
    grid.innerHTML = list.map(p => `
      <article class="card" data-product-id="${esc(p.id)}">
        <div class="card-img">${p.images?.[0]?`<img loading="lazy" src="${esc(p.images[0])}" alt="${esc(p.name)}">`:`<div class="ph">${esc(initials(p.name))}</div>`}</div>
        ${p.new?'<span class="tag">NEW</span>':''}
        <div class="card-body">
          <div class="catname">${esc(p.category)}</div>
          <h3>${esc(p.name)}</h3>
          <p>${esc(p.short || 'PowerRun energy solution.')}</p>
          <div class="card-foot"><span class="price">${money(p.price)}</span><button class="outline" type="button" onclick='viewProduct(${JSON.stringify(p.id)})'>DETAILS</button></div>
          <div class="card-actions"><button class="btn orange" type="button" onclick='buyNow(${JSON.stringify(p.id)})'>BUY NOW</button><button class="outline" type="button" onclick='addCart(${JSON.stringify(p.id)})'>+ CART</button><button class="outline" type="button" onclick='wa(${JSON.stringify(p.id)})'>WHATSAPP</button></div>
        </div>
      </article>`).join('') || `<div class="empty-state"><h3>No products found</h3><p>Try another search or category.</p><button class="outline" onclick="clearProductFilters()">Clear filters</button></div>`;
  }
  window.renderProducts = renderProducts;
  function clearProductFilters(){searchTerm='';currentCat='ALL';const s=document.getElementById('productSearch');if(s)s.value='';const so=document.getElementById('productSort');if(so)so.value='featured';sortMode='featured';renderTabs();renderProducts();}
  window.clearProductFilters=clearProductFilters;
  function applyProductSearch(value){searchTerm=String(value||'').trim();renderProducts();}
  window.applyProductSearch=applyProductSearch;
  function applyProductSort(value){sortMode=value||'featured';renderProducts();}
  window.applyProductSort=applyProductSort;

  function initials(name){ return String(name||'PR').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase(); }

  let detailQty = 1;
  function changeDetailQty(delta) {
    detailQty = Math.max(1, detailQty + delta);
    const el = document.getElementById('detailQtyValue');
    if (el) el.textContent = detailQty;
  }
  window.changeDetailQty = changeDetailQty;
  function viewProduct(id) {
    const p=dbProducts.find(x=>String(x.id)===String(id)); if(!p){toast('Product not found.','error');return;}
    const imgs=p.images||[];
    detailQty = 1;
    openDrawer(`<button class="close" type="button" aria-label="Close" onclick="closeOverlay()">×</button>
      ${breadcrumb(p)}
      <div class="product-detail-view">
        <div class="product-gallery-main"><div class="main-product-image">${imgs[0]?`<img id="mainProductImage" src="${esc(imgs[0])}" alt="${esc(p.name)}">`:`<div class="ph large">${esc(initials(p.name))}</div>`}</div>
        ${imgs.length>1?`<div class="product-thumbs">${imgs.map((x,i)=>`<button type="button" class="thumb ${i===0?'active':''}" onclick='switchProductImage(${JSON.stringify(x)},this)'><img loading="lazy" src="${esc(x)}" alt="${esc(p.name)} image ${i+1}"></button>`).join('')}</div>`:''}</div>
        <div class="product-info">
          <div class="detail-badge">${esc(p.category)}${p.new?' · NEW':''}</div>
          <h2>${esc(p.name)}</h2>
          <p class="sku">SKU: ${esc(p.sku||'—')} ${p.short?'· '+esc(p.short):''}</p>
          ${priceBlock(p)}
          <p>${esc(p.description||'')}</p>
          <div class="qty-stepper"><button type="button" aria-label="Decrease quantity" onclick="changeDetailQty(-1)">−</button><span id="detailQtyValue">1</span><button type="button" aria-label="Increase quantity" onclick="changeDetailQty(1)">+</button></div>
          <div class="detail-actions"><button class="btn orange" onclick='buyNow(${JSON.stringify(p.id)},detailQty)'>BUY NOW</button><button class="outline" onclick='addCart(${JSON.stringify(p.id)},detailQty)'>ADD TO CART</button><button class="outline" onclick='wa(${JSON.stringify(p.id)})'>WHATSAPP</button></div>
          <div class="trust-badges"><div class="trust-badge"><span class="ic">🛡️</span><div><b>5 Years Warranty</b><small>On Selected Products</small></div></div><div class="trust-badge"><span class="ic">🚚</span><div><b>Pan India Delivery</b><small>Fast &amp; Safe Delivery</small></div></div></div>
          ${specBlock(p)}
        </div>
      </div>`);
  }
  function switchProductImage(url,btn){const img=document.getElementById('mainProductImage');if(img)img.src=url;document.querySelectorAll('.thumb').forEach(x=>x.classList.remove('active'));btn?.classList.add('active');}
  window.viewProduct=viewProduct; window.switchProductImage=switchProductImage;

  function addCart(id, qty) {
    qty = Math.max(1, Number(qty) || 1);
    const p=dbProducts.find(x=>String(x.id)===String(id)); if(!p){toast('Product not found.','error');return;}
    const item=cart.find(x=>String(x.id)===String(id)); if(item)item.qty+=qty; else cart.push({id:p.id,qty});
    saveCart(); toast(`${p.name} added to cart.`,'success'); openCart();
  }
  function changeQty(id,delta){const item=cart.find(x=>String(x.id)===String(id));if(!item)return;item.qty+=delta;if(item.qty<=0)cart=cart.filter(x=>String(x.id)!==String(id));saveCart();openCart();}
  function removeCart(id){cart=cart.filter(x=>String(x.id)!==String(id));saveCart();openCart();}
  function clearCart(){cart=[];saveCart();openCart();}
  window.addCart=addCart;window.changeQty=changeQty;window.removeCart=removeCart;window.clearCart=clearCart;

  function openCart(){
    cart=cart.filter(x=>dbProducts.some(p=>String(p.id)===String(x.id)));
    saveCart();
    const total=cart.reduce((sum,x)=>{const p=dbProducts.find(p=>String(p.id)===String(x.id));return sum+(Number(p?.price)||0)*x.qty},0);
    const rows=cart.map(x=>{const p=dbProducts.find(p=>String(p.id)===String(x.id));if(!p)return '';const line=(Number(p.price)||0)*x.qty;return `<div class="cart-row"><div class="cart-img">${p.images?.[0]?`<img src="${esc(p.images[0])}" alt="${esc(p.name)}">`:`<div class="ph small">${esc(initials(p.name))}</div>`}</div><div class="cart-main"><b>${esc(p.name)}</b><small>${esc(p.category)} • ${money(p.price)}</small><div class="cart-line">${money(line)}</div></div><div class="qty"><button onclick='changeQty(${JSON.stringify(p.id)},-1)' aria-label="Decrease">−</button><b>${x.qty}</b><button onclick='changeQty(${JSON.stringify(p.id)},1)' aria-label="Increase">+</button><button class="remove" onclick='removeCart(${JSON.stringify(p.id)})' aria-label="Remove">×</button></div></div>`}).join('');
    openDrawer(`<button class="close" type="button" onclick="closeOverlay()">×</button><h2>Shopping Cart</h2>${rows||'<div class="empty-state"><h3>Your cart is empty</h3><p>Add products to continue.</p></div>'}${cart.length?`<div class="cart-summary"><span>Subtotal</span><strong>${money(total)}</strong></div><p class="small-note">If a product has no price, it will be handled as an enquiry/order request.</p><div class="drawer-actions"><button class="btn orange" onclick="cartCheckout()">BUY NOW / PLACE ORDER</button><button class="outline" onclick="cartWhatsApp()">WHATSAPP</button><button class="outline" onclick="clearCart()">CLEAR</button></div>`:''}`);
  }
  window.openCart=openCart;
  function cartCheckout(){if(!cart.length){toast('Cart is empty.','error');return}customerForm('cart');}
  function cartWhatsApp(){const text=cart.map(x=>{const p=dbProducts.find(p=>String(p.id)===String(x.id));return p?`${p.name} × ${x.qty}`:''}).filter(Boolean).join('\n');if(text)location.href='https://wa.me/'+PR_WA+'?text='+encodeURIComponent('Hello PowerRun Industries, I want to order/enquire about:\n'+text);}

  function wa(id){const p=dbProducts.find(x=>String(x.id)===String(id));if(!p)return;location.href='https://wa.me/'+PR_WA+'?text='+encodeURIComponent('Hello PowerRun Industries, I am interested in '+p.name+' ('+p.sku+'). Please share details and pricing.');}
  window.wa=wa;
  function whatsappGeneral(){location.href='https://wa.me/'+PR_WA+'?text='+encodeURIComponent('Hello PowerRun Industries, I need an energy solution.');}
  window.whatsappGeneral=whatsappGeneral;

  function customerForm(mode, id, initialQty){
    const isSingle=mode==='single';
    const startQty=Math.max(1, Number(initialQty)||1);
    const p=isSingle?dbProducts.find(x=>String(x.id)===String(id)):null;
    const items=isSingle&&p?[{id:p.id,qty:startQty}]:cart;
    const total=items.reduce((s,x)=>{const q=dbProducts.find(p=>String(p.id)===String(x.id));return s+(Number(q?.price)||0)*Number(x.qty||1)},0);
    const summary=items.map(x=>{const q=dbProducts.find(p=>String(p.id)===String(x.id));return q?`<div class="summary-row"><span>${esc(q.name)} × ${x.qty}</span><b>${money((Number(q.price)||0)*x.qty)}</b></div>`:''}).join('');
    openDrawer(`<button class="close" type="button" onclick="closeOverlay()">×</button><h2>Customer ${isSingle?'Order':'Order / Lead'}</h2><div class="order-summary"><b>Order Summary</b>${summary}<hr><div class="summary-row"><strong>Total</strong><strong>${money(total)}</strong></div></div><p class="small-note">No online payment is claimed here. This form creates an order/enquiry for PowerRun Industries.</p><form class="form" id="customerForm" onsubmit="submitCustomer(event,${JSON.stringify(mode)},${JSON.stringify(id||null)})"><label>Full Name *<input id="cust_name" required autocomplete="name"></label><label>Mobile *<input id="cust_mobile" required inputmode="tel" pattern="[6-9][0-9]{9}" title="Enter a valid 10-digit Indian mobile number"></label><label>Email<input id="cust_email" type="email" autocomplete="email"></label><label>Address<textarea id="cust_address" autocomplete="street-address"></textarea></label><label>City<input id="cust_city" autocomplete="address-level2"></label><label>State<input id="cust_state" autocomplete="address-level1"></label><label>Pincode<input id="cust_pin" inputmode="numeric" pattern="[0-9]{6}" title="Enter a 6-digit pincode"></label>${isSingle?`<label>Quantity<input id="cust_qty" type="number" min="1" value="${startQty}"></label>`:''}<button class="btn orange" id="placeOrderBtn" type="submit">PLACE ORDER</button></form>`);
  }
  window.buyNow=function(id,qty){customerForm('single',id,qty)};
  window.cartCheckout=cartCheckout;

  async function submitCustomer(event,mode,id){
    event.preventDefault();
    const button=document.getElementById('placeOrderBtn'); setBusy(button,true,'SUBMITTING…');
    const name=document.getElementById('cust_name').value.trim(), mobile=document.getElementById('cust_mobile').value.trim();
    if(!/^[6-9]\d{9}$/.test(mobile)){setBusy(button,false);toast('Please enter a valid 10-digit Indian mobile number.','error');return;}
    const email=document.getElementById('cust_email').value.trim()||null, address=document.getElementById('cust_address').value.trim()||null, city=document.getElementById('cust_city').value.trim()||null, state=document.getElementById('cust_state').value.trim()||null, pincode=document.getElementById('cust_pin').value.trim()||null;
    let items=[];
    if(mode==='single'){const p=dbProducts.find(x=>String(x.id)===String(id));if(!p){setBusy(button,false);toast('Product not found.','error');return}items=[{product:p,qty:Math.max(1,Number(document.getElementById('cust_qty')?.value||1))}];}
    else items=cart.map(x=>({product:dbProducts.find(p=>String(p.id)===String(x.id)),qty:Number(x.qty||1)})).filter(x=>x.product);
    if(!items.length){setBusy(button,false);toast('No products selected.','error');return;}
    const subtotal=items.reduce((s,x)=>s+(Number(x.product.price)||0)*x.qty,0);
    const orderNumber='PR-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+Math.random().toString(36).slice(2,7).toUpperCase();
    const itemRows=items.map(x=>({product_id:String(x.product.id),product_name:x.product.name,quantity:x.qty,unit_price:x.product.price===null||x.product.price===''?0:Number(x.product.price),total_price:(Number(x.product.price)||0)*x.qty}));
    const rpc=await sb.rpc('create_public_order',{payload:{order_number:orderNumber,customer_name:name,customer_mobile:mobile,customer_email:email,address,city,state,pincode,subtotal,total_amount:subtotal,items:itemRows}});
    let savedOrderNumber=orderNumber;
    if(!rpc.error){savedOrderNumber=rpc.data?.order_number||orderNumber;}
    else if(rpc.error.code==='42883' || /create_public_order/i.test(rpc.error.message||'')){
      const {data:order,error}=await sb.from('orders').insert({order_number:orderNumber,customer_name:name,customer_mobile:mobile,customer_email:email,address,city,state,pincode,subtotal,total_amount:subtotal,payment_status:'pending',order_status:'new',payment_method:'enquiry'}).select('id,order_number').single();
      if(error){setBusy(button,false);console.error(error);toast('Order could not be saved: '+error.message,'error');return;}
      savedOrderNumber=order.order_number||orderNumber;
      const {error:itemError}=await sb.from('order_items').insert(itemRows.map(x=>({...x,order_id:order.id})));
      if(itemError){console.error(itemError);toast('Order was created but items could not be saved. Please check Admin Orders.','error');setBusy(button,false);return;}
    } else {setBusy(button,false);console.error(rpc.error);toast('Order could not be saved: '+rpc.error.message,'error');return;}
    if(mode==='cart'){cart=[];saveCart();}
    closeOverlay();toast('Order submitted successfully. Order ID: '+savedOrderNumber,'success');
    const waText=['Hello PowerRun Industries, I placed an order/enquiry.',`Order ID: ${savedOrderNumber}`,`Name: ${name}`,`Mobile: ${mobile}`,...items.map(x=>`Product: ${x.product.name} × ${x.qty}`)].join('\n');
    openOrderSuccess(savedOrderNumber,waText);
  }

  window.submitCustomer=submitCustomer;

  function openOrderSuccess(orderNumber,waText){openDrawer(`<button class="close" onclick="closeOverlay()">×</button><div class="success-box"><div class="success-icon">✓</div><h2>Order Received</h2><p>Your request has been submitted to PowerRun Industries.</p><p><b>Order ID:</b> ${esc(orderNumber)}</p><button class="btn orange" onclick='location.href="https://wa.me/${PR_WA}?text="+encodeURIComponent(${JSON.stringify(waText)})'>SEND DETAILS ON WHATSAPP</button></div>`);}


  function openLeadForm(){openDrawer(`<button class="close" onclick="closeOverlay()">×</button><h2>Customer Enquiry</h2><p class="small-note">Tell us what energy product or solution you need.</p><form class="form" onsubmit="submitLead(event)"><label>Name *<input id="ln" required></label><label>Mobile *<input id="lm" required inputmode="tel" pattern="[6-9][0-9]{9}"></label><label>Email<input id="le" type="email"></label><label>City<input id="lc"></label><label>Message<textarea id="lmsg" placeholder="Product, quantity or requirement"></textarea></label><button class="btn orange" id="leadBtn" type="submit">SUBMIT ENQUIRY</button></form>`);}
  async function submitLead(event){event.preventDefault();const btn=document.getElementById('leadBtn');setBusy(btn,true,'SUBMITTING…');const name=document.getElementById('ln').value.trim(),mobile=document.getElementById('lm').value.trim();if(!/^[6-9]\d{9}$/.test(mobile)){setBusy(btn,false);toast('Enter a valid 10-digit mobile number.','error');return}const {error}=await sb.from('leads').insert({product_id:null,name,mobile,email:document.getElementById('le').value.trim()||null,city:document.getElementById('lc').value.trim()||null,message:document.getElementById('lmsg').value.trim()||null,source:'website',status:'new'});if(error){setBusy(btn,false);toast('Enquiry could not be submitted: '+error.message,'error');return}closeOverlay();toast('Enquiry submitted successfully.','success');}
  window.openLeadForm=openLeadForm;window.submitLead=submitLead;

  function focusSearch(){openDrawer(`<button class="close" onclick="closeOverlay()">×</button><h2>Search Products</h2><div class="form"><label>Product, SKU, category or description<input id="drawerSearch" autofocus placeholder="e.g. 51.2V 600Ah" oninput="runDrawerSearch(this.value)"></label></div><div id="drawerSearchResults"><p>Start typing to search.</p></div>`);setTimeout(()=>document.getElementById('drawerSearch')?.focus(),50);}
  function runDrawerSearch(q){const box=document.getElementById('drawerSearchResults');if(!box)return;const value=String(q||'').trim().toLowerCase();if(!value){box.innerHTML='<p>Start typing to search.</p>';return}const found=dbProducts.filter(p=>p.visible&&productMatches(p,value)).slice(0,20);box.innerHTML=found.length?found.map(p=>`<button class="search-result" onclick='viewProduct(${JSON.stringify(p.id)})'><span>${esc(p.name)}</span><small>${esc(p.category)} • ${money(p.price)}</small></button>`).join(''):'<div class="empty-state"><p>No matching product found.</p></div>';}
  window.focusSearch=focusSearch;window.runDrawerSearch=runDrawerSearch;

  async function adminLoginModal(){openDrawer(`<button class="close" onclick="closeOverlay()">×</button><h2>Admin Login</h2><p>Secure PowerRun Industries administration.</p><form class="form" onsubmit="doAdminLogin(event)"><label>Email<input id="ae" type="email" autocomplete="username" required></label><label>Password<input id="ap" type="password" autocomplete="current-password" required></label><button class="btn orange" id="loginBtn" type="submit">LOGIN</button></form>`);}
  async function doAdminLogin(event){event.preventDefault();const btn=document.getElementById('loginBtn');setBusy(btn,true,'LOGIN…');const email=document.getElementById('ae').value.trim(),password=document.getElementById('ap').value;const {error}=await sb.auth.signInWithPassword({email,password});if(error){setBusy(btn,false);toast('Login failed: '+error.message,'error');return}const {data:{user}}=await sb.auth.getUser();const {data:admin,error:adminErr}=await sb.from('admin_users').select('user_id,name').eq('user_id',user.id).maybeSingle();if(adminErr||!admin){await sb.auth.signOut();setBusy(btn,false);toast('This account is not an authorized PowerRun admin.','error');return}closeOverlay();document.getElementById('site').style.display='none';document.getElementById('admin').classList.add('show');await renderAdmin();}
  async function openAdmin(){const {data:{session}}=await sb.auth.getSession();if(session){const {data:admin}=await sb.from('admin_users').select('user_id').eq('user_id',session.user.id).maybeSingle();if(admin){document.getElementById('site').style.display='none';document.getElementById('admin').classList.add('show');await renderAdmin();return}}adminLoginModal();}
  async function closeAdmin(){await sb.auth.signOut();document.getElementById('admin').classList.remove('show');document.getElementById('site').style.display='block';await initProduction();}
  window.openAdmin=openAdmin;window.closeAdmin=closeAdmin;window.doAdminLogin=doAdminLogin;

  async function renderAdmin(){
    await loadCategories();await loadProducts(true);
    const [ordersCount,leadsCount] = await Promise.all([sb.from('orders').select('*',{count:'exact',head:true}),sb.from('leads').select('*',{count:'exact',head:true})]);
    const active=dbProducts.filter(p=>p.visible).length, featured=dbProducts.filter(p=>p.featured).length;
    document.getElementById('adminContent').innerHTML=`<div class="admin-heading"><div><h1>Dashboard</h1><p>PowerRun Industries management</p></div><button class="admin-btn" onclick="adminLogout()">Logout</button></div><div class="stats"><div class="stat"><small>Total Products</small><strong>${dbProducts.length}</strong></div><div class="stat"><small>Active Products</small><strong>${active}</strong></div><div class="stat"><small>Orders</small><strong>${ordersCount.count||0}</strong></div><div class="stat"><small>Leads</small><strong>${leadsCount.count||0}</strong></div></div><div class="admin-table"><div class="admin-actions"><button class="admin-btn" onclick="adminProducts()">Manage Products</button><button class="admin-btn" onclick="adminOrders()">View Orders</button><button class="admin-btn" onclick="adminLeads()">View Leads</button></div><p>${dbCategories.length} active categories • ${featured} featured products</p></div>`;
  }
  async function adminLogout(){await closeAdmin();}
  window.renderAdmin=renderAdmin;window.adminLogout=adminLogout;

  async function adminProducts(){await loadCategories();await loadProducts(true);const rows=dbProducts.map(p=>`<tr><td><b>${esc(p.name)}</b><br><small>${esc(p.category)}</small></td><td>${money(p.price)}</td><td>${esc(p.sku)}</td><td>${p._images.length}/5</td><td><span class="status ${p.visible?'on':'off'}">${p.visible?'Visible':'Hidden'}</span></td><td><button class="admin-btn gray" onclick='editProduct(${JSON.stringify(p.id)})'>Edit</button> <button class="admin-btn danger" onclick='deleteProduct(${JSON.stringify(p.id)})'>Delete</button></td></tr>`).join('');document.getElementById('adminContent').innerHTML=`<div class="admin-heading"><div><h1>Products</h1><p>Set pricing, visibility, categories and product content.</p></div><button class="admin-btn" onclick="editProduct()">+ Add Product</button></div><div class="admin-table"><div class="admin-search"><input id="adminProductSearch" placeholder="Search products…" oninput="filterAdminProducts(this.value)"></div><div class="table-scroll"><table id="adminProductTable"><thead><tr><th>Product</th><th>Price</th><th>SKU</th><th>Photos</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;}
  function filterAdminProducts(q){const value=String(q||'').toLowerCase();document.querySelectorAll('#adminProductTable tbody tr').forEach(row=>row.style.display=row.textContent.toLowerCase().includes(value)?'':'none');}
  window.adminProducts=adminProducts;window.filterAdminProducts=filterAdminProducts;

  async function editProduct(id){await loadCategories();await loadProducts(true);editingProductId=id||null;selectedNewFiles=[];const p=id?dbProducts.find(x=>String(x.id)===String(id)):{name:'',category_id:dbCategories[0]?.id||'',price:'',mrp:'',sku:'',short:'',description:'',specs:'',featured:false,new:true,visible:true,_images:[]};editingExistingImages=[...(p._images||[])];const cats=dbCategories.map(c=>`<option value="${esc(c.id)}" ${String(c.id)===String(p.category_id)?'selected':''}>${esc(c.name)}</option>`).join('');document.getElementById('adminContent').innerHTML=`<div class="admin-heading"><div><h1>${id?'Edit':'Add'} Product</h1><p>Maximum 5 product images.</p></div></div><div class="admin-table"><form class="form" onsubmit="saveProduct(event)"><label>Product Name *<input id="f_name" required value="${esc(p.name)}"></label><label>Category *<select id="f_cat" required>${cats}</select></label><label>Selling Price (₹)<input id="f_price" type="number" min="0" step="1" value="${esc(p.price??'')}" placeholder="Leave blank for Price on request"></label><label>MRP / List Price (₹)<input id="f_mrp" type="number" min="0" step="1" value="${esc(p.mrp??'')}" placeholder="Optional — shown as a strikethrough price with discount %"></label><label>SKU<input id="f_sku" value="${esc(p.sku)}"></label><label>Short Description<textarea id="f_short">${esc(p.short)}</textarea></label><label>Full Description<textarea id="f_desc">${esc(p.description)}</textarea></label><label>Specifications<textarea id="f_specs">${esc(p.specs)}</textarea></label><div><b>Existing Images</b><div class="thumbs" id="existingThumbs">${editingExistingImages.map((x,i)=>`<div class="thumb-wrap"><img src="${esc(x.url)}" alt="Product image"><button type="button" onclick="removeExistingImage(${i})">×</button></div>`).join('')||'<small>No images uploaded.</small>'}</div></div><div class="drop"><label>Upload new images<input id="f_files" type="file" accept="image/jpeg,image/png,image/webp" multiple onchange="selectFiles(this)"></label><small>JPG/PNG/WebP. Up to 5 total images.</small><div class="thumbs" id="newThumbs"></div></div><label><input id="f_new" type="checkbox" ${p.new?'checked':''}> Mark as NEW</label><label><input id="f_featured" type="checkbox" ${p.featured?'checked':''}> Featured Product</label><label><input id="f_visible" type="checkbox" ${p.visible?'checked':''}> Visible on website</label><div><button class="admin-btn" id="saveProductBtn" type="submit">SAVE PRODUCT</button> <button type="button" class="admin-btn gray" onclick="adminProducts()">CANCEL</button></div></form></div>`;}
  window.editProduct=editProduct;
  function selectFiles(input){const files=[...input.files];if(editingExistingImages.length+files.length>5){input.value='';toast('Maximum 5 images total.','error');return}selectedNewFiles=files.filter(f=>/^image\/(jpeg|png|webp)$/.test(f.type)&&f.size<=10*1024*1024);document.getElementById('newThumbs').innerHTML=selectedNewFiles.map(f=>`<img src="${URL.createObjectURL(f)}" alt="Preview">`).join('');}
  window.selectFiles=selectFiles;
  async function removeExistingImage(i){const item=editingExistingImages[i];if(!item||!confirm('Delete this product image?'))return;if(item.path){const r=await sb.storage.from('product-images').remove([item.path]);if(r.error){toast(r.error.message,'error');return}}const {error}=await sb.from('product_images').delete().eq('id',item.id);if(error){toast(error.message,'error');return}editingExistingImages.splice(i,1);await editProduct(editingProductId);}
  window.removeExistingImage=removeExistingImage;
  async function saveProduct(event){event.preventDefault();const btn=document.getElementById('saveProductBtn');setBusy(btn,true,'SAVING…');const name=document.getElementById('f_name').value.trim(),category_id=document.getElementById('f_cat').value,price=document.getElementById('f_price').value,mrp=document.getElementById('f_mrp')?document.getElementById('f_mrp').value:'',sku=document.getElementById('f_sku').value.trim()||('PR-'+Date.now());if(!name||!category_id){setBusy(btn,false);toast('Product name and category are required.','error');return}if(editingExistingImages.length+selectedNewFiles.length>5){setBusy(btn,false);toast('Maximum 5 images.','error');return}if(mrp!==''&&price!==''&&Number(mrp)<=Number(price)){setBusy(btn,false);toast('MRP must be greater than the selling price, or left blank.','error');return}const payload={category_id,name,slug:slugify(name)+'-'+sku.toLowerCase(),sku,short_description:document.getElementById('f_short').value.trim(),description:document.getElementById('f_desc').value.trim(),price:price===''?null:Number(price),mrp:mrp===''?null:Number(mrp),specifications:{text:document.getElementById('f_specs').value.trim()},is_active:document.getElementById('f_visible').checked,is_featured:document.getElementById('f_featured').checked,is_new:document.getElementById('f_new').checked,updated_at:new Date().toISOString()};let product,error;if(editingProductId){({data:product,error}=await sb.from('products').update(payload).eq('id',editingProductId).select().single())}else{({data:product,error}=await sb.from('products').insert(payload).select().single())}if(error){console.error(error);setBusy(btn,false);toast('Save failed: '+error.message,'error');return}for(let i=0;i<selectedNewFiles.length;i++){const file=selectedNewFiles[i],safe=file.name.toLowerCase().replace(/[^a-z0-9._-]/g,'-'),path=`${product.id}/${Date.now()}-${i}-${safe}`;const up=await sb.storage.from('product-images').upload(path,file,{contentType:file.type,upsert:false});if(up.error){toast('Image upload failed: '+up.error.message,'error');continue}const pub=sb.storage.from('product-images').getPublicUrl(path);const ins=await sb.from('product_images').insert({product_id:product.id,image_url:pub.data.publicUrl,storage_path:path,sort_order:editingExistingImages.length+i});if(ins.error){await sb.storage.from('product-images').remove([path]);toast('Image record failed: '+ins.error.message,'error');}}selectedNewFiles=[];await adminProducts();toast('Product saved successfully.','success');}
  window.saveProduct=saveProduct;
  async function deleteProduct(id){if(!confirm('Delete this product and its images?'))return;const {data:imgs}=await sb.from('product_images').select('storage_path').eq('product_id',id);const paths=(imgs||[]).map(x=>x.storage_path).filter(Boolean);if(paths.length)await sb.storage.from('product-images').remove(paths);await sb.from('product_images').delete().eq('product_id',id);const {error}=await sb.from('products').delete().eq('id',id);if(error){toast('Delete failed: '+error.message,'error');return}await adminProducts();toast('Product deleted.','success');}
  window.deleteProduct=deleteProduct;

  async function adminOrders(){const {data,error}=await sb.from('orders').select('*').order('created_at',{ascending:false});if(error){toast(error.message,'error');return}const rows=(data||[]).map(o=>`<tr><td><b>${esc(o.order_number)}</b><br><small>${esc(o.order_status||'new')}</small></td><td><b>${esc(o.customer_name)}</b><br>📞 ${esc(o.customer_mobile)}${o.customer_email?'<br>✉ '+esc(o.customer_email):''}<br>${esc([o.city,o.state].filter(Boolean).join(', '))}${o.pincode?'<br>PIN '+esc(o.pincode):''}${o.address?'<br>'+esc(o.address):''}</td><td>${money(o.total_amount)}</td><td><select onchange='updateOrder(${JSON.stringify(o.id)},this.value)'><option value="new" ${o.order_status==='new'?'selected':''}>New</option><option value="processing" ${o.order_status==='processing'?'selected':''}>Processing</option><option value="shipped" ${o.order_status==='shipped'?'selected':''}>Shipped</option><option value="delivered" ${o.order_status==='delivered'?'selected':''}>Delivered</option><option value="cancelled" ${o.order_status==='cancelled'?'selected':''}>Cancelled</option></select></td><td>${new Date(o.created_at).toLocaleString('en-IN')}</td></tr>`).join('');document.getElementById('adminContent').innerHTML=`<div class="admin-heading"><div><h1>Orders</h1><p>${(data||[]).length} order(s)</p></div></div><div class="admin-table"><div class="admin-search"><input placeholder="Search order/customer/mobile…" oninput="filterAdminTable(this,'ordersTable')"></div><div class="table-scroll"><table id="ordersTable"><thead><tr><th>Order</th><th>Customer / Lead</th><th>Total</th><th>Status</th><th>Date</th></tr></thead><tbody>${rows||'<tr><td colspan="5">No orders yet.</td></tr>'}</tbody></table></div></div>`;}
  async function updateOrder(id,status){const {error}=await sb.from('orders').update({order_status:status,updated_at:new Date().toISOString()}).eq('id',id);if(error)toast(error.message,'error');else toast('Order status updated.','success');}
  window.adminOrders=adminOrders;window.updateOrder=updateOrder;
  async function adminLeads(){const {data,error}=await sb.from('leads').select('*, products(name)').order('created_at',{ascending:false});if(error){toast(error.message,'error');return}const rows=(data||[]).map(l=>`<tr><td><b>${esc(l.name)}</b><br>📞 ${esc(l.mobile)}${l.email?'<br>✉ '+esc(l.email):''}</td><td>${esc(l.products?.name||'Multiple / General')}</td><td>${esc(l.city||'')}</td><td><select onchange='updateLead(${JSON.stringify(l.id)},this.value)'><option value="new" ${l.status==='new'?'selected':''}>New</option><option value="contacted" ${l.status==='contacted'?'selected':''}>Contacted</option><option value="quoted" ${l.status==='quoted'?'selected':''}>Quoted</option><option value="converted" ${l.status==='converted'?'selected':''}>Converted</option><option value="closed" ${l.status==='closed'?'selected':''}>Closed</option></select></td><td>${new Date(l.created_at).toLocaleString('en-IN')}</td></tr>`).join('');document.getElementById('adminContent').innerHTML=`<div class="admin-heading"><div><h1>Leads / Quote Requests</h1><p>${(data||[]).length} lead(s)</p></div></div><div class="admin-table"><div class="admin-search"><input placeholder="Search customer/product/mobile…" oninput="filterAdminTable(this,'leadsTable')"></div><div class="table-scroll"><table id="leadsTable"><thead><tr><th>Customer</th><th>Product</th><th>City</th><th>Status</th><th>Date</th></tr></thead><tbody>${rows||'<tr><td colspan="5">No leads yet.</td></tr>'}</tbody></table></div></div>`;}
  async function updateLead(id,status){const {error}=await sb.from('leads').update({status,updated_at:new Date().toISOString()}).eq('id',id);if(error)toast(error.message,'error');else toast('Lead status updated.','success');}
  window.adminLeads=adminLeads;window.updateLead=updateLead;
  function filterAdminTable(input,id){const q=input.value.toLowerCase();document.querySelectorAll('#'+id+' tbody tr').forEach(r=>r.style.display=r.textContent.toLowerCase().includes(q)?'':'none');}
  window.filterAdminTable=filterAdminTable;

  async function adminCategories(){await loadCategories();document.getElementById('adminContent').innerHTML=`<div class="admin-heading"><div><h1>Categories</h1><p>Categories are read from Supabase.</p></div></div><div class="admin-table"><div class="category-admin-grid">${dbCategories.map(c=>`<button class="category-admin" onclick='filterCat(${JSON.stringify(c.name)});document.getElementById("site").style.display="block";document.getElementById("admin").classList.remove("show")'><b>${esc(c.name)}</b><small>Active</small></button>`).join('')}</div><p class="small-note">To create additional categories, add them to the existing Supabase categories table. No category table reset is performed by this upgrade.</p></div>`;}
  window.adminCategories=adminCategories;
  function adminContent(){document.getElementById('adminContent').innerHTML='<div class="admin-heading"><div><h1>Content</h1><p>Static website copy remains in index.html so deployment stays simple.</p></div></div><div class="admin-table"><p>Product, order and lead data are managed through Supabase. Company claims and contact details were not invented.</p></div>';}
  function adminSettings(){document.getElementById('adminContent').innerHTML='<div class="admin-heading"><div><h1>Settings</h1><p>Authentication and production notes.</p></div></div><div class="admin-table"><p><b>Admin authentication:</b> Supabase Auth + admin_users authorization.</p><p><b>Cart:</b> Stored locally in this browser.</p><p><b>Payments:</b> Not configured; orders are enquiry/order requests with pending payment status.</p><button class="admin-btn gray" onclick="clearCart()">CLEAR LOCAL CART</button></div>';}
  window.adminCategories=adminCategories;window.adminContent=adminContent;window.adminSettings=adminSettings;

  async function initProduction(){await loadCategories();await loadProducts(false);currentCat='ALL';renderTabs();renderProducts();updateCartCount();}
  window.initProduction=initProduction;

  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeOverlay();});
  document.getElementById('overlay')?.addEventListener('click',e=>{if(e.target.id==='overlay')closeOverlay();});
  document.addEventListener('DOMContentLoaded',()=>{
    const ps=document.getElementById('productSearch');if(ps)ps.addEventListener('input',e=>applyProductSearch(e.target.value));
    const so=document.getElementById('productSort');if(so)so.addEventListener('change',e=>applyProductSort(e.target.value));
    const admin=document.getElementById('admin');if(admin){const side=admin.querySelector('.side');if(side)side.innerHTML='<button class="active" onclick="renderAdmin()">Dashboard</button><button onclick="adminProducts()">Products</button><button onclick="adminOrders()">Orders</button><button onclick="adminLeads()">Leads</button><button onclick="adminCategories()">Categories</button><button onclick="adminContent()">Content</button><button onclick="adminSettings()">Settings</button>';}
  });
  initProduction();
})();
