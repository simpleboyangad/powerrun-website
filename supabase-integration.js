/* PowerRun Industries - Supabase production integration
 * Uses only the public/publishable key. Never place service-role/secret keys in this file.
 */
const SUPABASE_URL = 'https://nnkopxkyxcmtiunftlgr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_n5WIw0oyN0w8K6Z5mlfawA_QbM7iHqf';
const PR_WA = '918700307676';

const { createClient } = window.supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
window.PR_SB = sb;

let dbProducts = [];
let dbCategories = [];
let dbCart = JSON.parse(localStorage.getItem('pr_cart') || '[]');
let editingProductId = null;
let editingExistingImages = [];
let selectedNewFiles = [];

function esc2(s){return String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')}
function money2(v){return v !== null && v !== undefined && v !== '' ? '₹'+Number(v).toLocaleString('en-IN') : ''}
function slugify(s){return String(s||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
function normalizeProduct(p){
  const images=(p.product_images||[]).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map(x=>({url:x.image_url,path:x.storage_path,id:x.id}));
  const specs=p.specifications?.text || (typeof p.specifications==='string'?p.specifications:'');
  return {id:p.id,name:p.name,category:p.categories?.name||'Uncategorized',category_id:p.category_id,price:p.price,sku:p.sku||'',short:p.short_description||'',description:p.description||'',specs,featured:!!p.is_featured,new:!!p.is_new,visible:!!p.is_active,images:images.map(x=>x.url),_images:images};
}

async function loadCategories(){
  const {data,error}=await sb.from('categories').select('*').eq('is_active',true).order('sort_order');
  if(error){console.error(error);return []}
  dbCategories=data||[];
  return dbCategories;
}

async function loadProducts(admin=false){
  let q=sb.from('products').select('*, categories(name), product_images(id,image_url,storage_path,sort_order)').order('created_at',{ascending:true});
  if(!admin) q=q.eq('is_active',true);
  const {data,error}=await q;
  if(error){console.error(error);alert('Products load failed: '+error.message);return []}
  dbProducts=(data||[]).map(normalizeProduct);
  products=dbProducts;
  return dbProducts;
}

async function initProduction(){
  await loadCategories();
  await loadProducts(false);
  currentCat='ALL';
  renderTabs2();
  renderProducts2();
  document.getElementById('cartCount').textContent=dbCart.length;
}

function renderTabs2(){
  const cats=['ALL',...dbCategories.map(c=>c.name)];
  const el=document.getElementById('tabs');
  if(!el)return;
  el.innerHTML=cats.map(c=>`<button class="tab ${currentCat===c?'active':''}" onclick="filterCat2(${JSON.stringify(c)})">${c==='ALL'?'ALL':esc2(c).toUpperCase()}</button>`).join('');
}
function filterCat2(c){currentCat=c;renderTabs2();renderProducts2();document.querySelector('#products').scrollIntoView({behavior:'smooth'})}
function renderProducts2(){
  const list=currentCat==='ALL'?dbProducts:dbProducts.filter(p=>p.category===currentCat);
  const grid=document.getElementById('productGrid');
  if(!grid)return;
  grid.innerHTML=list.map(p=>`<article class="card"><div class="card-img">${p.images?.[0]?`<img src="${esc2(p.images[0])}" alt="${esc2(p.name)}">`:`<div class="ph">${esc2(initials(p.name))}</div>`}</div>${p.new?'<span class="tag">NEW</span>':''}<div class="card-body"><div class="catname">${esc2(p.category)}</div><h3>${esc2(p.name)}</h3><p>${esc2(p.short)}</p><div class="card-foot"><span class="price">${money2(p.price)}</span><button class="outline" onclick="viewProduct2(${JSON.stringify(p.id)})">Details</button></div><div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap"><button class="btn orange" style="padding:8px 10px;font-size:11px" onclick="buyNow2(${JSON.stringify(p.id)})">${p.price?'BUY NOW':'GET QUOTE'}</button><button class="outline" onclick="addCart2(${JSON.stringify(p.id)})">+ CART</button><button class="outline" onclick="wa2(${JSON.stringify(p.id)})">WHATSAPP</button></div></div></article>`).join('') || '<p>No products available in this category.</p>';
}

function viewProduct2(id){
 const p=dbProducts.find(x=>x.id===id); if(!p)return;
 document.getElementById('drawer').innerHTML=`<button class="close" onclick="closeOverlay()">×</button><h2>${esc2(p.name)}</h2><div class="catname">${esc2(p.category)} • ${esc2(p.sku)}</div><div class="gallery">${(p.images||[]).map(x=>`<img src="${esc2(x)}" alt="${esc2(p.name)}">`).join('')||'<div class="ph">PR</div>'}</div>${p.price?`<h3>${money2(p.price)}</h3>`:'<h3>Price on request</h3>'}<p>${esc2(p.description)}</p><p><b>Specifications</b><br>${esc2(p.specs)}</p><button class="btn orange" onclick="buyNow2(${JSON.stringify(p.id)})">${p.price?'BUY NOW':'GET QUOTE'}</button> <button class="outline" onclick="addCart2(${JSON.stringify(p.id)})">+ CART</button>`;
 document.getElementById('overlay').classList.add('show');
}
function addCart2(id){if(!dbCart.includes(id))dbCart.push(id);localStorage.setItem('pr_cart',JSON.stringify(dbCart));document.getElementById('cartCount').textContent=dbCart.length;alert('Added to cart.')}
function wa2(id){const p=dbProducts.find(x=>x.id===id);if(!p)return;location.href='https://wa.me/'+PR_WA+'?text='+encodeURIComponent('Hello PowerRun Industries, I want to enquire about '+p.name);}
function openCart2(){
 const items=dbCart.map(id=>dbProducts.find(p=>p.id===id)).filter(Boolean);
 document.getElementById('drawer').innerHTML='<button class="close" onclick="closeOverlay()">×</button><h2>Enquiry Cart</h2>'+(items.length?items.map(p=>`<div style="padding:10px 0;border-bottom:1px solid #eee"><b>${esc2(p.name)}</b><br><small>${esc2(p.category)}</small></div>`).join(''):'<p>Your enquiry cart is empty.</p>')+(items.length?'<button class="btn orange" onclick="cartQuote2()">GET QUOTE</button>':'')+' <button class="outline" onclick="waCart2()">WHATSAPP</button>';
 document.getElementById('overlay').classList.add('show');
}
function waCart2(){const items=dbCart.map(id=>dbProducts.find(p=>p.id===id)).filter(Boolean);location.href='https://wa.me/'+PR_WA+'?text='+encodeURIComponent('Hello PowerRun Industries, I want an enquiry for:\n'+items.map(p=>'• '+p.name).join('\n'));}
function cartQuote2(){
 const items=dbCart.map(id=>dbProducts.find(p=>p.id===id)).filter(Boolean);
 quoteForm2(items.map(p=>p.id));
}
function quoteForm2(productIds=[]){
 const first=productIds[0]||null;
 document.getElementById('drawer').innerHTML=`<button class="close" onclick="closeOverlay()">×</button><h2>Get Quote</h2><p>${first?(esc2(dbProducts.find(p=>p.id===first)?.name||'Product')):'PowerRun Energy Solution'}</p><div class="form"><label>Name<input id="qn" required></label><label>Mobile<input id="qm" required></label><label>Email<input id="qe"></label><label>City<input id="qc"></label><label>Message<textarea id="qmsg">${productIds.length?'Products: '+productIds.map(id=>dbProducts.find(p=>p.id===id)?.name).filter(Boolean).join(', '):''}</textarea></label><button class="btn orange" onclick='submitQuote2(${JSON.stringify(productIds)})'>SUBMIT QUOTE REQUEST</button></div>`;
 document.getElementById('overlay').classList.add('show');
}
async function submitQuote2(productIds){
 const name=document.getElementById('qn').value.trim(), mobile=document.getElementById('qm').value.trim();
 if(!name||!mobile){alert('Name and mobile are required.');return}
 const {error}=await sb.from('leads').insert({product_id:productIds[0]||null,name,mobile,email:document.getElementById('qe').value.trim()||null,city:document.getElementById('qc').value.trim()||null,message:document.getElementById('qmsg').value.trim(),source:'website',status:'new'});
 if(error){alert('Quote request failed: '+error.message);return}
 closeOverlay();alert('Quote request submitted successfully. Our team will contact you.');
}
function buyNow2(id){
 const p=dbProducts.find(x=>x.id===id); if(!p)return;
 if(!p.price){quoteForm2([id]);return;}
 document.getElementById('drawer').innerHTML=`<button class="close" onclick="closeOverlay()">×</button><h2>Buy Now</h2><p><b>${esc2(p.name)}</b></p><div class="form"><label>Name<input id="bn2"></label><label>Mobile<input id="bm2"></label><label>Email<input id="be2"></label><label>Address<textarea id="ba2"></textarea></label><label>City<input id="bc2"></label><label>State<input id="bs2"></label><label>Pincode<input id="bp2"></label><label>Quantity<input id="bq2" type="number" value="1" min="1"></label><button class="btn orange" onclick='placeOrder2(${JSON.stringify(id)})'>PLACE ORDER</button></div>`;
 document.getElementById('overlay').classList.add('show');
}
async function placeOrder2(id){
 const p=dbProducts.find(x=>x.id===id); const name=document.getElementById('bn2').value.trim(), mobile=document.getElementById('bm2').value.trim(), qty=Number(document.getElementById('bq2').value||1);
 if(!name||!mobile){alert('Name and mobile are required.');return}
 const orderNumber='PR-'+Date.now().toString().slice(-8)+'-'+Math.floor(100+Math.random()*900);
 const total=Number(p.price)*qty;
 const {data:order,error}=await sb.from('orders').insert({order_number:orderNumber,customer_name:name,customer_mobile:mobile,customer_email:document.getElementById('be2').value.trim()||null,address:document.getElementById('ba2').value.trim()||null,city:document.getElementById('bc2').value.trim()||null,state:document.getElementById('bs2').value.trim()||null,pincode:document.getElementById('bp2').value.trim()||null,subtotal:total,total_amount:total,payment_status:'pending',order_status:'new',payment_method:'enquiry'}).select().single();
 if(error){alert('Order failed: '+error.message);return}
 const {error:itemErr}=await sb.from('order_items').insert({order_id:order.id,product_id:p.id,product_name:p.name,quantity:qty,unit_price:p.price,total_price:total});
 if(itemErr){alert('Order item failed: '+itemErr.message);return}
 closeOverlay();alert('Order submitted successfully. Order ID: '+orderNumber);
}

function adminLoginModal(){
 document.getElementById('overlay').innerHTML=`<div class="drawer" style="max-width:460px"><button class="close" onclick="closeOverlay()">×</button><h2>Admin Login</h2><p>PowerRun Industries secure administration.</p><div class="form"><label>Email<input id="ae" type="email" value="admin@powerrun.in"></label><label>Password<input id="ap" type="password" autocomplete="current-password"></label><button class="btn orange" onclick="doAdminLogin()">LOGIN</button></div></div>`;
 document.getElementById('overlay').classList.add('show');
}
async function doAdminLogin(){
 const email=document.getElementById('ae').value.trim(), password=document.getElementById('ap').value;
 if(!email||!password){alert('Enter email and password.');return}
 const {error}=await sb.auth.signInWithPassword({email,password});
 if(error){alert('Login failed: '+error.message);return}
 const {data:admin}=await sb.from('admin_users').select('user_id,name').eq('user_id',(await sb.auth.getUser()).data.user.id).maybeSingle();
 if(!admin){await sb.auth.signOut();alert('This account is not an authorized PowerRun admin.');return}
 closeOverlay();document.getElementById('site').style.display='none';document.getElementById('admin').classList.add('show');await loadAdminData();renderAdmin2();
}
async function openAdmin2(){
 const {data:{session}}=await sb.auth.getSession();
 if(session){const {data:admin}=await sb.from('admin_users').select('user_id,name').eq('user_id',session.user.id).maybeSingle();if(admin){document.getElementById('site').style.display='none';document.getElementById('admin').classList.add('show');await loadAdminData();renderAdmin2();return}}
 adminLoginModal();
}
async function adminLogout2(){await sb.auth.signOut();document.getElementById('admin').classList.remove('show');document.getElementById('site').style.display='block';await initProduction()}

async function loadAdminData(){await loadCategories();await loadProducts(true);}
function adminHeader(){return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h1>Dashboard</h1><button class="admin-btn" onclick="adminLogout2()">Logout</button></div>`}
async function renderAdmin2(){
 await loadAdminData();
 const [{count:orderCount},{count:leadCount}]=await Promise.all([sb.from('orders').select('*',{count:'exact',head:true}),sb.from('leads').select('*',{count:'exact',head:true})]);
 const el=document.getElementById('adminContent');
 el.innerHTML=adminHeader()+`<div class="stats"><div class="stat"><small>Total Products</small><strong>${dbProducts.length}</strong></div><div class="stat"><small>Categories</small><strong>${dbCategories.length}</strong></div><div class="stat"><small>Orders</small><strong>${orderCount||0}</strong></div><div class="stat"><small>Leads</small><strong>${leadCount||0}</strong></div></div><div class="admin-table"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h2>Product Management</h2><button class="admin-btn" onclick="editProduct2()">+ Add Product</button></div><table><thead><tr><th>Product</th><th>Category</th><th>SKU</th><th>Photos</th><th>Status</th><th>Action</th></tr></thead><tbody>${dbProducts.map(p=>`<tr><td>${esc2(p.name)}</td><td>${esc2(p.category)}</td><td>${esc2(p.sku)}</td><td>${p._images.length}/5</td><td>${p.visible?'Visible':'Hidden'}</td><td><button class="admin-btn gray" onclick='editProduct2(${JSON.stringify(p.id)})'>Edit</button> <button class="admin-btn" onclick='deleteProduct2(${JSON.stringify(p.id)})'>Delete</button></td></tr>`).join('')}</tbody></table></div>`;
}
function showProductManager(){renderAdmin2()}
async function editProduct2(id){
 await loadAdminData(); editingProductId=id||null; selectedNewFiles=[];
 const p=id?dbProducts.find(x=>x.id===id):{name:'',category:dbCategories[0]?.name||'',price:'',sku:'',short:'',description:'',specs:'',featured:false,new:true,visible:true,_images:[]};
 editingExistingImages=[...(p._images||[])];
 const el=document.getElementById('adminContent');
 el.innerHTML=`<h1>${id?'Edit':'Add'} Product</h1><div class="admin-table"><div class="form"><label>Product Name<input id="f2_name" value="${esc2(p.name)}"></label><label>Category<select id="f2_cat">${dbCategories.map(c=>`<option value="${esc2(c.id)}" ${c.id===p.category_id?'selected':''}>${esc2(c.name)}</option>`).join('')}</select></label><label>Price (optional)<input id="f2_price" type="number" min="0" value="${esc2(p.price??'')}"></label><label>SKU<input id="f2_sku" value="${esc2(p.sku)}"></label><label>Short Description<textarea id="f2_short">${esc2(p.short)}</textarea></label><label>Full Description<textarea id="f2_desc">${esc2(p.description)}</textarea></label><label>Specifications<textarea id="f2_specs">${esc2(p.specs)}</textarea></label><div><label>Product Photos — maximum 5</label><div class="thumbs" id="existingThumbs">${editingExistingImages.map((x,i)=>`<div style="position:relative"><img src="${esc2(x.url)}"><button type="button" onclick="removeExistingImage2(${i})" style="position:absolute;right:-5px;top:-5px;border:0;background:#f55;color:#fff;border-radius:50%;width:20px;height:20px;cursor:pointer">×</button></div>`).join('')}</div><div class="drop"><input id="f2_files" type="file" accept="image/jpeg,image/png,image/webp" multiple onchange="selectFiles2(this)"><p>JPG/PNG/WebP • up to 5 total images • recommended under 10MB each</p></div><div class="thumbs" id="newThumbs"></div></div><label><input id="f2_new" type="checkbox" ${p.new?'checked':''}> Mark as NEW</label><label><input id="f2_featured" type="checkbox" ${p.featured?'checked':''}> Featured Product</label><label><input id="f2_visible" type="checkbox" ${p.visible!==false?'checked':''}> Visible on website</label><div><button class="admin-btn" onclick="saveProduct2()">Save Product</button> <button class="admin-btn gray" onclick="renderAdmin2()">Cancel</button></div></div></div>`;
}
function selectFiles2(input){
 const files=[...input.files]; if(editingExistingImages.length+files.length>5){alert('Maximum 5 photos total.');input.value='';return}
 selectedNewFiles=files;document.getElementById('newThumbs').innerHTML=files.map(f=>`<img src="${URL.createObjectURL(f)}" alt="preview">`).join('');
}
async function removeExistingImage2(i){
 const item=editingExistingImages[i];if(!item)return;if(!confirm('Delete this product image?'))return;
 if(item.path){const {error}=await sb.storage.from('product-images').remove([item.path]);if(error){alert(error.message);return}}
 const {error}=await sb.from('product_images').delete().eq('id',item.id);if(error){alert(error.message);return}
 editingExistingImages.splice(i,1);await editProduct2(editingProductId);
}
async function saveProduct2(){
 const name=document.getElementById('f2_name').value.trim(), category_id=document.getElementById('f2_cat').value, price=document.getElementById('f2_price').value, sku=document.getElementById('f2_sku').value.trim()||('PR-'+Date.now());
 if(!name||!category_id){alert('Product name and category are required.');return}
 if(editingExistingImages.length+selectedNewFiles.length>5){alert('Maximum 5 images.');return}
 const payload={category_id,name,slug:slugify(name)+'-'+sku.toLowerCase(),sku,short_description:document.getElementById('f2_short').value.trim(),description:document.getElementById('f2_desc').value.trim(),price:price===''?null:Number(price),specifications:{text:document.getElementById('f2_specs').value.trim()},is_active:document.getElementById('f2_visible').checked,is_featured:document.getElementById('f2_featured').checked,is_new:document.getElementById('f2_new').checked,updated_at:new Date().toISOString()};
 let product, error;
 if(editingProductId){({data:product,error}=await sb.from('products').update(payload).eq('id',editingProductId).select().single())}else{({data:product,error}=await sb.from('products').insert(payload).select().single())}
 if(error){alert('Save failed: '+error.message);return}
 for(let i=0;i<selectedNewFiles.length;i++){
   const file=selectedNewFiles[i];
   const safe=file.name.toLowerCase().replace(/[^a-z0-9._-]/g,'-');
   const path=`${product.id}/${Date.now()}-${i}-${safe}`;
   const up=await sb.storage.from('product-images').upload(path,file,{contentType:file.type,upsert:false});
   if(up.error){alert('Image upload failed: '+up.error.message);continue}
   const pub=sb.storage.from('product-images').getPublicUrl(path);
   const ins=await sb.from('product_images').insert({product_id:product.id,image_url:pub.data.publicUrl,storage_path:path,sort_order:editingExistingImages.length+i});
   if(ins.error)alert('Image record failed: '+ins.error.message);
 }
 selectedNewFiles=[];await renderAdmin2();alert('Product saved successfully.');
}
async function deleteProduct2(id){if(!confirm('Delete this product and its images?'))return;const {error}=await sb.from('products').delete().eq('id',id);if(error){alert('Delete failed: '+error.message);return}await renderAdmin2();}
async function adminOrders(){
 const {data,error}=await sb.from('orders').select('*').order('created_at',{ascending:false});if(error){alert(error.message);return}
 document.getElementById('adminContent').innerHTML=`<h1>Orders</h1><div class="admin-table"><table><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Date</th></tr>${(data||[]).map(o=>`<tr><td>${esc2(o.order_number)}</td><td>${esc2(o.customer_name)}<br>${esc2(o.customer_mobile)}</td><td>${money2(o.total_amount)}</td><td><select onchange='updateOrder2(${JSON.stringify(o.id)},this.value)'><option ${o.order_status==='new'?'selected':''}>new</option><option ${o.order_status==='processing'?'selected':''}>processing</option><option ${o.order_status==='shipped'?'selected':''}>shipped</option><option ${o.order_status==='delivered'?'selected':''}>delivered</option><option ${o.order_status==='cancelled'?'selected':''}>cancelled</option></select></td><td>${new Date(o.created_at).toLocaleString('en-IN')}</td></tr>`).join('')}</table></div>`;
}
async function updateOrder2(id,status){const {error}=await sb.from('orders').update({order_status:status,updated_at:new Date().toISOString()}).eq('id',id);if(error)alert(error.message)}
async function adminLeads(){
 const {data,error}=await sb.from('leads').select('*, products(name)').order('created_at',{ascending:false});if(error){alert(error.message);return}
 document.getElementById('adminContent').innerHTML=`<h1>Leads / Quote Requests</h1><div class="admin-table"><table><tr><th>Customer</th><th>Product</th><th>Mobile</th><th>City</th><th>Status</th><th>Date</th></tr>${(data||[]).map(l=>`<tr><td>${esc2(l.name)}</td><td>${esc2(l.products?.name||'Multiple / General')}</td><td>${esc2(l.mobile)}</td><td>${esc2(l.city||'')}</td><td><select onchange='updateLead2(${JSON.stringify(l.id)},this.value)'><option ${l.status==='new'?'selected':''}>new</option><option ${l.status==='contacted'?'selected':''}>contacted</option><option ${l.status==='quoted'?'selected':''}>quoted</option><option ${l.status==='converted'?'selected':''}>converted</option><option ${l.status==='closed'?'selected':''}>closed</option></select></td><td>${new Date(l.created_at).toLocaleString('en-IN')}</td></tr>`).join('')}</table></div>`;
}
async function updateLead2(id,status){const {error}=await sb.from('leads').update({status,updated_at:new Date().toISOString()}).eq('id',id);if(error)alert(error.message)}

// Replace legacy functions with production versions.
window.openAdmin=openAdmin2; window.openCart=openCart2; window.addCart=addCart2; window.buyNow=buyNow2; window.wa=wa2; window.viewProduct=viewProduct2; window.showProductManager=showProductManager; window.adminOrders=adminOrders; window.adminLeads=adminLeads; window.renderAdmin=renderAdmin2; window.closeAdmin=async()=>{document.getElementById('admin').classList.remove('show');document.getElementById('site').style.display='block';await initProduction()};
window.filterCat=filterCat2;

// Allow the existing header cart button to use the production cart.
const cartBtn=document.querySelector('.cart');if(cartBtn)cartBtn.onclick=openCart2;

initProduction();
