# PowerRun Industries E-Commerce - Quick Start Guide

Get the complete e-commerce system running in 15 minutes.

---

## ⚡ 5-Minute Setup

### 1. Update Script Reference (1 min)

Edit `index.html` line 321:
```html
<!-- Change from: -->
<script src="./supabase-integration.js" onerror="window.PR_LOAD_FAILED=true"></script>

<!-- To: -->
<script src="./supabase-ecommerce-enhanced.js" onerror="window.PR_LOAD_FAILED=true"></script>
```

### 2. Run Database Migration (2 min)

1. Go to [Supabase Dashboard](https://app.supabase.com/projects)
2. Select your PowerRun project
3. Click **SQL Editor** → **New Query**
4. Copy entire contents of `powerrun-complete-ecommerce-migration.sql`
5. Paste into editor
6. Click **Run**
7. Wait for success ✅

### 3. Create Admin User (1 min)

1. Sign up via email in your app
2. Note your email address
3. In Supabase SQL Editor, run:

```sql
insert into public.admin_users (user_id, name, email, role)
select id, 'PowerRun Admin', email, 'admin'
from auth.users
where email = 'YOUR_EMAIL_HERE';
```

Replace `YOUR_EMAIL_HERE` with your actual email.

### 4. Deploy to GitHub Pages (1 min)

```bash
cd /path/to/powerrun-website
git add -A
git commit -m "Add complete e-commerce system"
git push origin main
```

### 5. Test Live (1 min)

Visit: https://powerrun.in/

---

## 🧪 Testing Immediately After Setup

### Customer Flow
1. Browse Products → Click a product
2. Add to Cart → Open Cart
3. Proceed to Checkout
4. Fill customer info → Continue
5. Fill shipping address → Review
6. Review order summary → Continue to payment
7. Select payment method → Place Order
8. ✅ See order confirmation with Order ID

### Admin Flow
1. Click account icon (top right)
2. Click admin access area
3. Login with your email
4. See Dashboard with metrics
5. Click "View Orders" → See your test order
6. Click order → Update status, add tracking
7. Save changes ✅

### Track Order
1. From confirmation, click "Track Order"
2. Enter Order ID + mobile number
3. ✅ See order details

---

## 📋 What's Now Available

| Feature | Status | Test It |
|---------|--------|---------|
| Browse Products | ✅ Live | Go to #products |
| Search | ✅ Live | Click search icon |
| Shopping Cart | ✅ Live | Add product to cart |
| **Multi-Step Checkout** | ✅ **NEW** | Proceed to checkout |
| **Customer Auth** | ✅ **NEW** | Click account, sign up |
| **My Orders** | ✅ **NEW** | Sign in, view orders |
| **Order Tracking** | ✅ **NEW** | From confirmation page |
| **Admin Panel** | ✅ **NEW** | Click account (logged out) |
| **Order Management** | ✅ **NEW** | Admin → View Orders |
| Leads/Enquiries | ✅ Live | Contact form |

---

## ⚠️ Important Notes

### Before Going Live
- [ ] Run database migration
- [ ] Create at least one admin user
- [ ] Test complete checkout flow
- [ ] Test admin panel login
- [ ] Verify GitHub Pages deployment
- [ ] Check mobile responsiveness

### What Still Needs Setup (Optional)
- Payment gateway (Razorpay, Stripe, etc.)
- Email notifications (SendGrid, AWS SES)
- SMS notifications (Twilio, AWS SNS)
- Shipment tracking API (Shiprocket, Delhivery)
- Warranty system (when needed)
- Service tickets (when needed)

### Don't Change Yet
- ❌ Old `supabase-integration.js` (keep as backup)
- ❌ Old order system (new one replaces it)
- ❌ Products table structure (already migrated)

---

## 🐛 Troubleshooting

### "Live product data could not be loaded"
**Solution**: Data falls back to seed. Check Supabase is accessible.

### Admin login fails with "not authorized"
**Solution**: Run the admin user SQL from Step 3 above.

### Cart doesn't save after refresh
**Solution**: 
1. Check browser localStorage is enabled
2. Try private window to rule out extensions
3. Check browser console for errors

### Checkout button doesn't work
**Solution**:
1. Clear browser cache
2. Hard refresh (Ctrl+Shift+R on Windows)
3. Check if JS file loaded (F12 → Sources)

### Mobile buttons are too small
**Solution**: Already responsive. If issues persist:
1. Check viewport meta tag in HTML
2. Test on actual mobile device (not just resize)

---

## 📊 File Structure

```
powerrun-website/
├── index.html                              # Main website
├── supabase-ecommerce-enhanced.js          # ⭐ NEW - Use this!
├── supabase-integration.js                 # OLD - Keep as backup
├── powerrun-complete-ecommerce-migration.sql  # ⭐ NEW - Database
├── seed_products.sql                       # Initial 25 products
├── POWERRUN_ECOMMERCE_SETUP.md             # ⭐ Full setup guide
├── FEATURES_IMPLEMENTATION_STATUS.md       # ⭐ What's done, what's pending
├── QUICK_START.md                          # This file
├── assets/
│   ├── powerrun-logo.png
│   ├── powerrun-hero.png
│   └── powerrun-hero-products.png
└── README.txt                              # Original README
```

---

## 🚀 Next Steps After Setup

### Recommended (Week 1)
1. [ ] Test with real customer data
2. [ ] Verify all pages on mobile
3. [ ] Test admin panel thoroughly
4. [ ] Check browser console for errors
5. [ ] Verify WhatsApp integration works
6. [ ] Make sure emails/SMS go out (when configured)

### Phase 2 (Week 2-3)
1. [ ] Integrate payment gateway
2. [ ] Set up email notifications
3. [ ] Configure SMS/WhatsApp notifications
4. [ ] Set up shipment tracking

### Phase 3 (Week 4+)
1. [ ] Add warranty system
2. [ ] Add service tickets
3. [ ] Add product reviews
4. [ ] Add coupons/discounts

---

## 📞 Getting Help

**Need help?** Check these files in order:

1. **QUICK_START.md** (this file) - Quick answers
2. **POWERRUN_ECOMMERCE_SETUP.md** - Detailed setup
3. **FEATURES_IMPLEMENTATION_STATUS.md** - What's completed
4. **Browser Console** (F12) - Check for errors
5. **Contact Support**: +91 87003 07676 or info@powerrun.in

---

## ✅ Success Indicators

You'll know it's working when:

✅ Homepage loads with products  
✅ Can add products to cart  
✅ Checkout shows 5 steps  
✅ Can enter customer info  
✅ Can enter shipping address  
✅ Order review shows subtotal + GST + shipping  
✅ Order confirmation shows Order ID  
✅ Can sign up for account  
✅ Signed-in customer sees orders  
✅ Admin can login  
✅ Admin can update order status  
✅ No red errors in console (F12)  

---

## 💾 Backup Your Data

Before making changes:

```bash
# Option 1: Export Supabase database
# (See POWERRUN_ECOMMERCE_SETUP.md for detailed steps)

# Option 2: Git backup (already done)
git tag v1.0-before-ecommerce
git push origin v1.0-before-ecommerce
```

---

## 🔄 Rollback Plan

If something goes wrong:

```bash
# 1. Revert to old JavaScript
# (Change index.html back to supabase-integration.js)

# 2. Revert database changes
# (Re-run only the necessary SQL, or restore from backup)

# 3. Revert git commit
git revert <commit-hash>
git push origin main
```

---

**Quick Start Version**: 1.0.0  
**Last Updated**: 2026-09-13  
**Estimated Setup Time**: 15 minutes  
**Support**: info@powerrun.in | +91 87003 07676

