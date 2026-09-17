# PowerRun — आपकी website की पूरी जानकारी

> इस file को खोलकर आप सब कुछ खुद कर सकते हैं। किसी की मदद की ज़रूरत नहीं।
> **Password इस file में नहीं हैं** — वो सुरक्षित नहीं होता।

---

## 1. सारे पते (URL) — याद रखने लायक

### ग्राहक की website
| पता | क्या है |
|---|---|
| `powerrun.in` | Home page |
| `powerrun.in/products/` | सारे products |
| `powerrun.in/cart/` | ग्राहक का cart |
| `powerrun.in/checkout/` | Order देने की जगह |
| `powerrun.in/warranty/` | Warranty registration |
| `powerrun.in/service/` | Service request |
| `powerrun.in/dealer/` | Dealer enquiry |
| `powerrun.in/contact/` | Contact form |
| `powerrun.in/about/` | About us |
| `powerrun.in/track-order/` | Order ID से tracking |
| `powerrun.in/account/` | ग्राहक का account |

### 🔐 आपका Admin Panel
| पता | क्या है |
|---|---|
| **`powerrun.in/admin/`** | **यही खोलिए — बाकी सब अंदर है** |
| `powerrun.in/admin/login/` | Login page |
| `powerrun.in/admin/dashboard/` | आँकड़े |
| `powerrun.in/admin/products/` | Products — दाम, stock, तस्वीरें |
| `powerrun.in/admin/orders/` | सारे orders |
| `powerrun.in/admin/customers/` | ग्राहक |
| `powerrun.in/admin/warranty/` | Warranty registrations |
| `powerrun.in/admin/service/` | Service requests |
| `powerrun.in/admin/dealers/` | Dealer enquiries |
| `powerrun.in/admin/settings/` | GSTIN, shipping, payment |
| `powerrun.in/set-password/` | Password बदलना |

> **सिर्फ़ `powerrun.in/admin/` याद रखें।** बाकी सब बाईं तरफ़ के menu में मिल जाएगा।
> ये link किसी को न दें। Google पर भी नहीं दिखता।

**Login email:** `angadsingh12911@gmail.com`

### Product का पता कैसा होता है
```
powerrun.in/product/?slug=pr-hybrid-inverter-3-6kw-pr-001
```
हर product का अपना पता है। Admin → Products → Edit में "URL Slug" में दिखता है।
**इसे बदलेंगे तो पुराने link टूट जाएँगे।**

---

## 2. रोज़ के काम — कैसे करें

### दाम या stock बदलना
`powerrun.in/admin/products/` → product के आगे **Edit** → Price / MRP / Stock बदलें → **SAVE CHANGES**
→ website पर तुरंत बदल जाता है

### तस्वीर डालना
वही Edit वाली window → नीचे **"Product Images"** → file चुनें → **SAVE CHANGES**
→ एक product में 5 तक तस्वीरें

### Datasheet (PDF) डालना
वही Edit वाली window → **"Datasheet (PDF)"** → PDF चुनें → **SAVE CHANGES**
→ product page पर "DOWNLOAD DATASHEET" बटन आ जाता है · PDF 20 MB तक
→ नई PDF चुनेंगे तो पुरानी बदल जाएगी · हटाना हो तो **Remove** → SAVE

### नया order देखना
`powerrun.in/admin/orders/` → **Open** दबाएँ → पूरा detail
Status बदलें (Pending → Confirmed → Processing → Shipped → Delivered) → **SAVE ORDER**
→ ग्राहक को tracking page पर तुरंत दिखता है

### Product website से हटाना
Edit → **"Active (visible on website)"** का टिक हटाएँ → SAVE
(Delete मत कीजिए अगर उस product का कोई order आ चुका है)

### Stock खत्म हो जाए
Stock में `0` डालें → अपने आप "Out of stock" हो जाएगा, order नहीं लिया जाएगा

### Password बदलना
`powerrun.in/set-password/` (admin में login रहते हुए)

---

## 3. Supabase — आपका database

| | |
|---|---|
| Dashboard | https://supabase.com/dashboard/project/nnkopxkyxcmtiunftlgr |
| Project नाम | `powerrun-website` |
| Project ID | `nnkopxkyxcmtiunftlgr` |

**कब खोलना पड़ता है:** बहुत कम। आम काम admin panel से हो जाते हैं।
ज़रूरत पड़े तो:
- **Authentication → Users** — कौन-कौन login कर सकता है
- **Table Editor** — सारा data
- **Advisors → Security** — security की जाँच (यहाँ **0 errors** दिखना चाहिए)

---

## 4. Website का code कहाँ है

| | |
|---|---|
| आपके computer में | `C:\Users\angad\Projects\powerrun-website` |
| Internet पर | https://github.com/simpleboyangad/powerrun-website |
| Hosting | GitHub Pages (मुफ़्त) |

**बदलाव कैसे live होता है:** code में बदलाव → GitHub पर push → 1-2 मिनट में powerrun.in पर।

> ⚠️ **दाम/stock/तस्वीर के लिए code छूने की ज़रूरत नहीं** — वो admin panel से होता है।
> Code तब बदलता है जब नया feature या design चाहिए।

---

## 5. ज़रूरी बातें

- **दाम हमेशा GST सहित हैं** — ग्राहक वही देता है जो लिखा है
- **Order का total website तय करती है**, browser नहीं — कोई घटा-बढ़ा नहीं सकता
- **Admin सिर्फ़ वही खोल सकता है** जिसका नाम database की `admin_users` list में है
- **Order नंबर:** `PR-2026-00001` · Warranty: `PRW-…` · Service: `PRS-…` · Dealer: `PRD-…`
- **Razorpay अभी बंद है** — "Pay on Confirmation" चल रहा है। Keys डालते ही चालू हो जाएगा

---

## 6. कुछ टूट जाए तो

| दिक्कत | पहले ये करें |
|---|---|
| पुराना version दिख रहा है | `Ctrl + Shift + R` |
| Admin नहीं खुल रहा | `powerrun.in/admin/login/` से दोबारा login |
| Password भूल गए | `powerrun.in/set-password/` या Supabase → Authentication → Users |
| दाम बदला पर दिख नहीं रहा | `Ctrl + Shift + R`, फिर admin में जाँचें कि SAVE हुआ था |
| Order नहीं बन रहा | product का stock 0 तो नहीं? दाम डला है? |

---

## 7. अभी बचे हुए काम

1. **GSTIN + State** भरें — Admin → Settings → "Company & GST"
2. **तस्वीरें** — 25 में से 23 में नहीं हैं
3. **Solar के 5 दाम** — अभी "Out of stock" हैं
4. **Google Business Profile** बनाएँ — मुफ़्त, सबसे तेज़ फ़ायदा
5. Resend SMTP (email) · Razorpay keys — जब चाहें

---

*तकनीकी जानकारी `README.md` में है। Database की सारी फ़ाइलें `sql/` folder में।*
