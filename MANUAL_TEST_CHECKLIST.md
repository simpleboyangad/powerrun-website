# Manual Test Checklist for PowerRun Website

**Live Site**: https://powerrun.in/  
**Date**: 2026-09-13  
**Commit**: c208ac0  

---

## TEST 1: Product Browsing (Prerequisites)

### 1.1 Homepage Load
- [ ] Go to https://powerrun.in/
- [ ] Page loads without JavaScript errors (check browser console)
- [ ] Products are visible in the grid
- [ ] Each product shows: name, category, price, buttons (DETAILS, BUY NOW, + CART, WHATSAPP)
- **Expected**: 24 products visible with prices (not "Price on request")
- **Fail If**: Any products show "Price on request", page has console errors, layout is broken

---

## TEST 2: Single Product - BUY NOW Flow (CRITICAL)

### 2.1 Open Product Details
- [ ] Click "DETAILS" on any product (e.g., "PR Hybrid Inverter 3.6kW")
- [ ] Full product details page opens in overlay
- [ ] Shows: product name, price, description, specifications, images
- [ ] Quantity stepper visible (+/- buttons)
- [ ] Three buttons: "BUY NOW", "ADD TO CART", "WHATSAPP"
- **Expected**: Full product detail view loads
- **Fail If**: Details page doesn't open, buttons missing, price shows "Price on request"

### 2.2 Click BUY NOW
- [ ] Click the blue "BUY NOW" button
- [ ] Customer form opens (same overlay, not a new window)
- [ ] Form shows:
  - Order summary with product name, quantity, price
  - Fields: Full Name, Mobile, Email, Address, City, State, Pincode, Quantity
  - All required fields marked with *
  - "PLACE ORDER" button
- **Expected**: Form opens with order summary
- **Fail If**: Form doesn't open, summary is missing, fields are wrong

### 2.3 Fill Customer Form
- [ ] Full Name: Enter "Test Customer"
- [ ] Mobile: Enter "9876543210" (valid 10-digit number)
- [ ] Email: Enter "test@example.com"
- [ ] Address: Enter "123 Test Lane"
- [ ] City: Enter "Bangalore"
- [ ] State: Enter "Karnataka"
- [ ] Pincode: Enter "560001" (valid 6-digit)
- [ ] Quantity: Should show 1 (pre-filled)
- **Expected**: All fields accept input without errors
- **Fail If**: Form rejects valid input, validation errors appear

### 2.4 Click PLACE ORDER (CRITICAL TEST)
- [ ] Click the blue "PLACE ORDER" button
- [ ] Wait for 2-3 seconds
- **Expected 1**: Order confirmation screen appears showing:
  - Green checkmark icon ✓
  - "Order Confirmed!" heading
  - "Your order has been received by PowerRun Industries."
  - Order ID prominently displayed in a formatted box
  - "What's next?" instructions
  - "WHATSAPP CONFIRMATION" button
  - "CLOSE" button
- **Expected 2**: Browser console shows NO errors
- **Expected 3**: Cart is cleared (if shopping with cart)
- **Fail If**:
  - Toast message says "One or more selected products are available on request"
  - No Order ID displayed
  - No confirmation screen appears
  - JavaScript error in console
  - Takes more than 5 seconds with no response

### 2.5 Verify Order ID
- [ ] Order ID displayed in large font, orange color
- [ ] Order ID format: PR-YYMMDDHH24MISSMS-NNN (e.g., PR-26091313123456-789)
- [ ] Order ID is unique (different each time you test)
- [ ] Able to copy/screenshot the Order ID
- **Expected**: Clear, readable Order ID
- **Fail If**: Order ID is missing, format is wrong, shows as "undefined" or "null"

### 2.6 Close Confirmation
- [ ] Click "CLOSE" button
- [ ] Overlay closes
- [ ] Back at homepage
- [ ] Cart shows 0 items (if started with empty cart)
- **Expected**: Clean close, return to homepage
- **Fail If**: Overlay stays open, page shows errors

---

## TEST 3: Cart Checkout Flow

### 3.1 Add Multiple Products to Cart
- [ ] Click "+ CART" on Product 1 (e.g., Hybrid Inverter 3.6kW)
- [ ] Toast shows "added to cart"
- [ ] Cart badge updates to show "1"
- [ ] Click "+ CART" on Product 2 (e.g., LFP Battery 100Ah)
- [ ] Cart badge updates to show "2"
- [ ] Click "+ CART" on Product 3 (e.g., Solar Panel 450W)
- [ ] Cart badge updates to show "3"
- **Expected**: Cart counts products correctly
- **Fail If**: Cart doesn't update, toast doesn't show, badge shows wrong count

### 3.2 Open Cart
- [ ] Click cart icon (🛒) in header
- [ ] Cart overlay opens showing:
  - All 3 products with name, category, price
  - Quantity controls (+/- buttons) for each item
  - Remove button (×) for each item
  - Cart total (sum of all items)
  - "BUY NOW / PLACE ORDER" button
  - "WHATSAPP" button
  - "CLEAR" button
- **Expected**: Cart shows all items with controls
- **Fail If**: Cart is empty, items missing, controls don't work, total is wrong

### 3.3 Modify Quantities
- [ ] Click "+" button next to first product
- [ ] Quantity increases to 2
- [ ] Total updates
- [ ] Click "-" button
- [ ] Quantity decreases to 1
- [ ] Total updates
- **Expected**: Quantities and totals update correctly
- **Fail If**: Quantities don't change, total doesn't update

### 3.4 Click BUY NOW / PLACE ORDER
- [ ] Click blue "BUY NOW / PLACE ORDER" button
- [ ] Customer form opens (same as TEST 2.2)
- [ ] Order summary shows ALL 3 products with quantities and prices
- [ ] Total is correct (sum of all items)
- **Expected**: Form opens with correct multi-item summary
- **Fail If**: Form doesn't open, summary missing items, total is wrong

### 3.5 Fill Form and Place Order
- [ ] Fill form (same as TEST 2.3)
- [ ] Click "PLACE ORDER"
- [ ] Order confirmation screen appears with Order ID
- [ ] Confirm Order ID is displayed correctly
- [ ] Click "CLOSE"
- [ ] Verify cart is now empty (badge shows "0")
- **Expected**: Order created, confirmation shown, cart cleared
- **Fail If**: Same as TEST 2.4-2.6 failures

---

## TEST 4: Account / My Orders (Authenticated User)

### 4.1 Sign Up
- [ ] Click account icon (♙) in header
- [ ] Login form appears with fields: Email, Password
- [ ] Look for "Sign Up" link or button (may not be visible on initial login form)
- [ ] If no sign-up link, click account icon and note that feature may be missing
- [ ] Try signing up with:
  - Email: "testuser@example.com"
  - Password: "TestPassword123"
- **Expected**: Account is created OR redirect to login
- **Note**: Sign-up flow may not be implemented; if not present, use existing test account
- **Fail If**: Form doesn't load, can't enter credentials

### 4.2 Sign In
- [ ] Click account icon (♙)
- [ ] Login form appears
- [ ] Enter:
  - Email: "testuser@example.com" (or any test account)
  - Password: "TestPassword123" (or actual password)
- [ ] Click "SIGN IN" button
- [ ] Wait for 2 seconds
- **Expected**: Sign-in succeeds, My Orders page loads
- **Fail If**: Sign-in fails with error, page shows errors, doesn't load My Orders

### 4.3 View My Orders
- [ ] After successful login, My Orders page shows
- [ ] Page displays:
  - "My Orders" heading
  - "Signed in as: [your email]"
  - Table with columns: Order, Total, Status, Date, Action
- [ ] If you placed orders as authenticated user:
  - Orders appear in table
  - Each shows Order ID, total amount, status (should be "new"), date
  - Each row has "View" button
- [ ] If no orders yet:
  - Shows message "No orders are associated with this account yet."
  - This is correct
- **Expected**: Correct display based on order history
- **Fail If**:
  - Empty message when orders exist
  - Wrong orders shown (someone else's orders)
  - Can't view page, error appears
  - "Signed in as" shows wrong email

### 4.4 Place Authenticated Order
- [ ] Click "CLOSE" to exit My Orders
- [ ] Shop for a product: click "BUY NOW"
- [ ] Fill form and click "PLACE ORDER"
- [ ] Confirm order is created with Order ID
- [ ] Click account icon (♙) again
- [ ] My Orders page loads
- **Expected**: New order appears in My Orders
- **Fail If**: Order doesn't appear, shows old orders only

### 4.5 View Order Details
- [ ] In My Orders table, click "View" button on your new order
- [ ] Order detail overlay opens showing:
  - Order ID in heading
  - Order Details section:
    - Status: "new" (or "pending")
    - Payment: "pending"
    - Total amount
    - Date placed
  - Items section: Lists each product, quantity, price
  - Tracking section (if available): Shows courier, tracking number, etc.
- **Expected**: Complete order details displayed
- **Fail If**: Details page doesn't open, information missing, wrong data shown

### 4.6 Sign Out
- [ ] Look for "SIGN OUT" button on My Orders page or account icon
- [ ] Click "SIGN OUT"
- [ ] Return to homepage
- [ ] Account icon should no longer show signed-in state
- [ ] Click account icon again
- [ ] Login form appears (not My Orders)
- **Expected**: Successfully signed out
- **Fail If**: Still shows "signed in", logout doesn't work, page errors

---

## TEST 5: Product Search & Filtering

### 5.1 Category Filter
- [ ] Click "Hybrid Inverters" tab at top
- [ ] Products list updates to show only inverters
- [ ] All displayed products are in "Hybrid Inverters" category
- [ ] Product count updates
- [ ] Click "Lithium Batteries" tab
- [ ] Products list updates to show only batteries
- **Expected**: Filtering works correctly
- **Fail If**: Wrong products shown, no update, tabs don't respond

### 5.2 Product Search
- [ ] Click search icon (⌕) in header
- [ ] Search input appears
- [ ] Type "50" (searching for "PR Solar Panel 550W")
- [ ] Search results show matching products
- [ ] Type "hybrid"
- [ ] Results show hybrid inverters
- [ ] Clear search
- [ ] All products return
- **Expected**: Search finds products by name/category
- **Fail If**: Search doesn't work, returns no results, returns wrong products

---

## TEST 6: Mobile Responsiveness

### 6.1 Mobile View (375px width)
- [ ] Open browser dev tools (F12)
- [ ] Toggle device toolbar (Ctrl+Shift+M)
- [ ] Select mobile preset (iPhone or "375px")
- [ ] Reload page
- **Expected**: Page loads on mobile
- **Fail If**: Page doesn't load, content is cut off, can't scroll

### 6.2 Mobile Navigation
- [ ] Tap hamburger menu icon (☰)
- [ ] Menu opens showing: HOME, ABOUT US, PRODUCTS, SOLUTIONS, SERVICES, CONTACT
- [ ] Tap a menu item (e.g., PRODUCTS)
- [ ] Navigates to products section
- [ ] Menu closes
- **Expected**: Mobile menu works correctly
- **Fail If**: Menu doesn't open, navigation doesn't work

### 6.3 Mobile Checkout
- [ ] Click "BUY NOW" on mobile
- [ ] Form displays vertically with all fields visible
- [ ] Fill form (can scroll if needed)
- [ ] Click "PLACE ORDER"
- [ ] Confirmation displays fully on mobile screen
- [ ] Can read Order ID without horizontal scroll
- **Expected**: Mobile checkout works end-to-end
- **Fail If**: Form fields overflow, can't submit, confirmation not visible

---

## TEST 7: Product Buttons (All Variants)

### 7.1 Product Card (Grid View)
- [ ] Hover over product card (desktop)
- [ ] Buttons are visible and clickable:
  - [ ] "DETAILS" button
  - [ ] "BUY NOW" button
  - [ ] "+ CART" button
  - [ ] "WHATSAPP" button
- [ ] Click "DETAILS" → Opens product details
- [ ] Click "BUY NOW" → Opens customer form for single product
- [ ] Click "+ CART" → Adds to cart (badge updates)
- [ ] Click "WHATSAPP" → Opens WhatsApp (may open app or browser)
- **Expected**: All buttons work
- **Fail If**: Button missing, doesn't respond, wrong action

### 7.2 Product Details View
- [ ] Open product details (click DETAILS)
- [ ] In details overlay, verify buttons work:
  - [ ] Quantity +/- buttons change quantity
  - [ ] "BUY NOW" button with correct quantity
  - [ ] "ADD TO CART" button adds with quantity
  - [ ] "WHATSAPP" button sends message
- **Expected**: All controls responsive
- **Fail If**: Buttons don't work, quantity doesn't update

---

## TEST 8: Cart Functions

### 8.1 Quantity Controls
- [ ] Add 1 product to cart
- [ ] Open cart
- [ ] Click "+" button → Quantity increases to 2
- [ ] Click "-" button → Quantity decreases to 1
- [ ] Click "-" again → Quantity goes to 0, item removed from cart
- [ ] Cart shows "Your cart is empty"
- **Expected**: Quantity controls work correctly
- **Fail If**: Quantity doesn't change, item doesn't remove, errors appear

### 8.2 Remove Item
- [ ] Add 2 products to cart
- [ ] Open cart
- [ ] Click "×" (remove) button on first product
- [ ] Product is removed
- [ ] Cart shows only second product
- [ ] Click "×" on remaining product
- [ ] Cart is empty
- **Expected**: Remove works correctly
- **Fail If**: Item doesn't remove, wrong item removed, errors appear

### 8.3 Clear Cart
- [ ] Add 3 products to cart
- [ ] Open cart
- [ ] Click "CLEAR" button
- [ ] All products removed
- [ ] Cart badge shows "0"
- [ ] Page shows "Your cart is empty"
- **Expected**: Clear works correctly
- **Fail If**: Items remain, badge wrong, page errors

---

## TEST 9: Error Handling

### 9.1 Invalid Mobile Number
- [ ] Click "BUY NOW"
- [ ] Fill form with invalid mobile:
  - "123" (too short) → Should show error
  - "0876543210" (starts with 0) → Should show error
  - "abcdefghij" (letters) → Should show error
- [ ] Click "PLACE ORDER"
- **Expected**: Error message for each, form doesn't submit
- **Fail If**: Accepts invalid input, submits anyway

### 9.2 Invalid Pincode
- [ ] Fill form with invalid pincode:
  - "12345" (5 digits, need 6) → Should show error
  - "1234567" (7 digits) → Should show error
  - "abcdef" (letters) → Should show error
- [ ] Click "PLACE ORDER"
- **Expected**: Error message, form doesn't submit
- **Fail If**: Accepts invalid input

### 9.3 Missing Required Fields
- [ ] Click "BUY NOW"
- [ ] Leave "Full Name" empty
- [ ] Try to click "PLACE ORDER"
- **Expected**: Browser shows "Please fill in this field" or similar
- **Fail If**: Accepts empty name, submits form

### 9.4 Network Error Simulation
- [ ] Open dev tools (F12)
- [ ] Go to Network tab
- [ ] Set throttling to "Offline"
- [ ] Try to place an order
- **Expected**: Error message shows "Order could not be saved" or similar
- [ ] Set throttling back to "No throttling"
- **Fail If**: Order appears to succeed, page freezes

---

## TEST 10: Console & Browser Errors

### 10.1 Check Console for Errors
- [ ] Open browser console (F12 → Console tab)
- [ ] Reload page
- [ ] Perform all above tests
- **Expected**: Console should show NO red errors
- **Acceptable**: Yellow warnings (library stuff)
- **Acceptable**: 404 on favicon
- **Fail If**: Red JavaScript errors appear, especially:
  - "ReferenceError: [function] is not defined"
  - "TypeError: Cannot read property"
  - "Uncaught" errors
  - Repeated errors blocking functionality

### 10.2 Check Network for Errors
- [ ] Open browser dev tools (F12 → Network tab)
- [ ] Filter to "XHR" or "Fetch"
- [ ] Place an order
- [ ] Look for the RPC request: POST to `/graphql` or `/rest/v1/rpc`
- [ ] Response should show:
  - Status: 200 (success)
  - Response contains: `order_id`, `order_number`
- **Expected**: RPC succeeds
- **Fail If**: Status 400, 401, 403, 500, or response empty

---

## TEST 11: WhatsApp Integration

### 11.1 WhatsApp Button on Product
- [ ] Click "WHATSAPP" button on any product
- [ ] WhatsApp opens (app or web.whatsapp.com)
- [ ] Message is pre-filled with product name and SKU
- [ ] Chat with PowerRun number (+91 8700307676) is selected
- **Expected**: Correct WhatsApp integration
- **Fail If**: Wrong number, message empty, doesn't open WhatsApp

### 11.2 WhatsApp on Order Confirmation
- [ ] After placing order, click "WHATSAPP CONFIRMATION"
- [ ] WhatsApp opens with pre-filled message including:
  - "I placed an order"
  - Order ID
  - Customer name
  - Product details
- **Expected**: Full order details in message
- **Fail If**: Message incomplete, wrong number, doesn't open

### 11.3 WhatsApp from Cart
- [ ] Add products to cart
- [ ] Open cart
- [ ] Click "WHATSAPP" button
- [ ] Message shows: "I want to order/enquire about:" followed by list of products with quantities
- **Expected**: Correct product list
- **Fail If**: List missing items, wrong format

---

## SUMMARY

After completing ALL tests above, verify:

- [ ] Checkout flow works end-to-end (single and cart)
- [ ] Orders are created with correct data
- [ ] Order confirmation shows Order ID prominently
- [ ] My Orders loads for authenticated users
- [ ] My Orders shows placed orders
- [ ] View Order Details works
- [ ] All product buttons work
- [ ] Cart management works
- [ ] Mobile responsive
- [ ] No JavaScript errors in console
- [ ] WhatsApp integration works
- [ ] Error messages are clear and helpful

---

## FAILURE RESPONSE

If ANY test fails:
1. Open browser console (F12)
2. Take screenshot of error (if any)
3. Note the exact step that failed
4. Report the failure with:
   - Test number (e.g., "TEST 2.4")
   - Expected vs. actual result
   - Error message (if any)
   - Screenshot (if applicable)

---

**Status**: 🔴 AWAITING MANUAL TESTING

Once these tests pass, the site is production-ready for customer use.
