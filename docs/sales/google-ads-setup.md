# Google Ads: 15 minute mein campaign chalaiye (step-by-step)

> Ye file sirf aapke liye hai: `docs/` folder website par nahi dikhta.
> Likha gaya: 11 Oct 2026. Google Ads ki screen thodi alag dikh sakti hai, lekin naam yahi rahenge.

## Pehle samajh lein: kya chalana hai

| Campaign | Kya karega | Budget (roz) |
|---|---|---|
| **1. Search: "Call / WhatsApp"** | Jab koi Google par *"e rickshaw lithium battery"* jaisa search kare, to upar aapka ad aayega. Click karne par website khulegi, ya ad se seedha call ho jayegi. | **₹300** |
| **2. Shopping** | Google Shopping mein aapke product **photo + price** ke saath dikhenge (Merchant Center approve ho chuka hai). | **₹200** |

**Kul: ₹500 roz, yaani 7 din mein ~₹3,500 + 18% GST.** 7 din baad dekhenge ki kya chala, phir badhayenge ya band karenge.

> **Asli target order nahi, enquiry hai.** Pehle hafte mein 10-20 call/WhatsApp aayein to ad kaam kar raha hai.

---

## Step 0: Account banana (aap khud karein, 5 minute)

1. **ads.google.com** kholein aur **usi Gmail** se login karein jisse Merchant Center chalta hai.
2. Agar Google **"Smart campaign"** ya "simple setup" dikhaye, to neeche chhota link **"Switch to Expert Mode"** dabayein. Smart campaign mein control nahi milta.
3. Agar woh campaign banwane ko kahe, to **"Create an account without a campaign"** chunein.
4. Billing country: **India**, Time zone: **(GMT+05:30) India**, Currency: **INR**. **Currency baad mein nahi badalti, dhyaan se chunein.**
5. **Billing:** apna card/UPI aap khud daalein. Payment type **Automatic** rakhein. **GSTIN: 09GTVPS7660P1ZZ** daalein, taaki 18% GST ka input credit mile.
6. Agar **"Spend ₹X, get ₹Y credit"** jaisa naya-advertiser offer dikhe, to use le lijiye (shart padh lein).

## Step 1: Merchant Center aur Google Analytics jodna (2 minute)

1. Google Ads mein upar **Tools (🔧) → Data manager → Linked accounts** kholein.
2. **Google Merchant Center** chunein, account **5856704164** ke saamne **Link** dabayein. (Merchant Center mein ek request aayegi, use **Approve** karein.)
3. Isi jagah **Google Analytics (GA4)** bhi link karein: property **powerrun.in**.

## Step 2: Conversions (taaki pata chale ad se kitni enquiry aayi)

1. **Goals → Conversions → Summary → + New conversion action → Import → Google Analytics 4 → Web**.
2. Ye events chunein (jo dikhein): **contact_click** (call/WhatsApp click), **begin_checkout**, **purchase**.
3. **generate_lead** abhi list mein nahi aayega: jab pehli quote/contact form enquiry aayegi tab dikhega, tab ise bhi import kar lena.
4. Call ad se aane wali calls ke liye kuch alag nahi karna: Step 3 mein "Call asset" lagate hi Google khud ginti karega.

---

## Step 3: Campaign 1, Search (₹300 roz)

**+ New campaign → Objective: "Leads" → Campaign type: "Search"** → Website: `https://powerrun.in`, aur "Phone calls" bhi tick karein, number: **+91 80575 73040**.

**Settings (ek-ek karke):**

| Setting | Kya chunein |
|---|---|
| Campaign name | `Search - Battery & Inverter` |
| Networks | ❌ **Search partners hata dein** · ❌ **Display Network hata dein** (dono ke tick hata dein: inmein paisa jaldi jaata hai, enquiry kam aati hai) |
| Locations | **Uttar Pradesh**, Delhi, Haryana, Uttarakhand, Rajasthan, Madhya Pradesh, Bihar |
| Location options (Presets ke neeche "Location options") | **"Presence: People in or regularly in your included locations"** (pehle wala "Presence or interest" NAHI) |
| Languages | English **aur** Hindi |
| Bidding | **"Clicks"** → ✅ "Set a maximum cost per click bid limit": **₹20** (shuru mein; conversion data aane ke baad "Conversions" par badlenge) |
| Budget | **₹300 / day** |
| Ad schedule | Subah **8 se raat 9** (jab aap phone utha sakte hain) |
| AI Max / Broad match / "Automatically created assets" | Agar option dikhe, to **band** rakhein (shuruat mein hum keywords khud chunenge) |

### Ad group 1: E-Rickshaw Battery

Keywords (bilkul aise hi, quote `" "` ke saath, isse "phrase match" banta hai):
```
"e rickshaw lithium battery"
"e rickshaw battery price"
"lithium battery for e rickshaw"
"e rickshaw battery 51.2v"
"e rickshaw lithium battery price"
"erickshaw battery"
"e loader battery"
"e rickshaw battery near me"
```
Final URL: `https://powerrun.in/e-rickshaw-batteries/`

### Ad group 2: Inverter Lithium Battery

```
"lithium battery for inverter"
"lifepo4 battery"
"inverter lithium battery price"
"24v lithium battery"
"48v lithium battery"
"solar lithium battery"
"lithium battery for solar inverter"
"100ah lithium battery"
```
Final URL: `https://powerrun.in/lithium-batteries/`

### Ad group 3: Hybrid Solar Inverter

```
"hybrid solar inverter"
"hybrid inverter price"
"solar inverter 5kw"
"solar inverter 3kw"
"mppt solar inverter"
"on grid off grid inverter"
"hybrid inverter for home"
```
Final URL: `https://powerrun.in/hybrid-inverters/`

### Negative keywords (campaign level, bahut zaroori)

**Keywords → Negative keywords → + → "Add to campaign"**, ye sab ek-ek line mein:
```
job
jobs
salary
repair
second hand
used
old
scrap
course
training
pdf
diagram
how to make
diy
toy
car battery
mobile battery
laptop
battery cell 18650
wholesale china
alibaba
amazon
flipkart
free
```
(Agar aap repair ya used battery ka kaam bhi karte hain, to "repair", "used", "old" wale shabd yahan se hata dein.)

### Ad text (Responsive search ad: har ad group mein ek)

**Headlines (har ek 30 akshar se kam, sab 15 daal dein):**
```
PowerRun Lithium Battery
E-Rickshaw Lithium Battery
LiFePO4 Battery 3 Yr Warranty
Hybrid Solar Inverter 3.6kW
Inverter Battery 5 Yr Warranty
Kasganj Se Pan-India Delivery
GST Bill Ke Saath
WhatsApp Par Rate Poochhein
Lead-Acid Se Lithium Upgrade
6000+ Cycles LiFePO4 Battery
Solar Inverter Rs 29,650 Se
E-Rickshaw Battery Rs 69,499
Smart BMS, Bluetooth App
Call Now For Best Price
Dealer Rates Available
```

**Descriptions (4, har ek 90 akshar se kam):**
```
LiFePO4 lithium battery for e-rickshaw, inverter and solar. GST bill and warranty.
Hybrid solar inverters 3.6kW to 12kW with built-in MPPT. 2 year warranty. Call now.
Lead-acid se pareshan? Lithium lijiye: 4000+ cycles, no maintenance, 3 yr warranty.
Kasganj, UP se poore India mein delivery. Dealer aur mechanic ke liye special rate.
```

> **Tip:** E-Rickshaw ad group mein "E-Rickshaw Lithium Battery" headline ko **pin** kar dein (headline ke paas 📌, "Position 1"). Inverter wale ad group mein "Hybrid Solar Inverter 3.6kW" ko. Isse search ke hisaab se sahi headline upar aayegi.

### Assets (ad ke neeche extra links, ye CTR badhate hain)

**Sitelinks** (4):

| Text | URL | Line 1 | Line 2 |
|---|---|---|---|
| E-Rickshaw Batteries | powerrun.in/e-rickshaw-batteries/ | 51.2V LiFePO4, 3 yr warranty | 110Ah se 314Ah tak |
| Hybrid Inverters | powerrun.in/hybrid-inverters/ | 3.6kW se 12kW | Built-in MPPT |
| Battery Calculator | powerrun.in/battery-calculator/ | Kitna backup chahiye? | Free calculator |
| Become a Dealer | powerrun.in/dealer/ | Dealer aur installer rate | Abhi apply karein |

**Call asset:** +91 80575 73040, schedule: subah 8 se raat 9.
**Callouts:** `GST Bill` · `Pan-India Delivery` · `Up to 5 Yr Warranty` · `WhatsApp Support`
**Location asset:** Google Business Profile link karein (Assets → + → Location). Isse ad mein aapka pata aur rating dikhegi.

> Phone number abhi temporary hai. Pakka number aate hi **Call asset** mein bhi badalna hai.

---

## Step 4: Campaign 2, Shopping (₹200 roz)

**+ New campaign → Objective: "Sales" → Campaign type: "Shopping"** → Merchant Center account **5856704164** → Country of sale **India** → **"Standard Shopping campaign"** chunein.

(Agar sirf **Performance Max** ka option aaye, to wahi chunein, aur Step 4 ki jagah neeche "Agar sirf Performance Max ho" wala hissa padhein.)

| Setting | Kya chunein |
|---|---|
| Campaign name | `Shopping - All` |
| Bidding | **Manual CPC**, default bid **₹12** |
| Budget | **₹200 / day** |
| Networks | ❌ Search partners · ❌ YouTube/Gmail/Discover (sab hata dein) |
| Locations | Poora **India** (Shopping mein delivery sab jagah hai), "Presence" wala option |
| Campaign priority | Low |

**Product groups (ad group ke andar):** "All products" ko **Category / Product type** se baantein, aur bid aise rakhein:

| Product group | Bid |
|---|---|
| E-Rickshaw Batteries | ₹15 |
| Lithium Batteries | ₹15 |
| Hybrid Inverters | ₹15 |
| Solar Panels | ₹8 (panel bhaari hai, shipping mehngi; zyada order door se aaye to ghaata) |
| BMS, Balancers, Chargers | ₹5 (sasta saamaan, kam margin) |

**Negative keywords** wahi list Shopping campaign mein bhi daal dein.

### Agar sirf Performance Max ho
- Budget ₹200/day, bidding **"Conversions"** (target CPA mat daalein).
- **Asset group:** Merchant Center ke products, aur upar wale headlines/descriptions, 5 photos (`photos/listing/` se), logo `assets/powerrun-logo.png`.
- **Final URL expansion: OFF** rakhein.
- Locations: India, "Presence" wala option.
- Brand exclusion mein kuch nahi chahiye.

---

## Step 5: Roz 5 minute check (7 din tak)

Har shaam **Campaigns → Search keywords (Insights and reports → Search terms)** kholein:
1. Jo search aapke kaam ka nahi hai (jaise *"e rickshaw battery job"*, *"car battery"*), use tick karke **"Add as negative keyword"** karein. **Ye sabse zaroori kaam hai.** Isse paisa bachta hai.
2. Calls aur WhatsApp ginein. Jo log enquiry karein, unhe admin panel → **Leads** mein **source: google** ke saath daalein.
3. Koi ad group 3 din mein ₹500+ kha jaye aur ek bhi call/WhatsApp na aaye, to use **Pause** karein.

## 7 din baad faisla

| Kya hua | Kya karein |
|---|---|
| 10+ enquiry aayi | Budget dheere-dheere badhaayein (₹100/day har hafte) |
| 3-10 enquiry | Wahi budget chalne dein, aur jo keyword enquiry de rahe hain, sirf woh rakhein |
| 0-2 enquiry | Mujhe search terms ka screenshot bhejiye. Keyword aur ad badal kar dobara try karenge |

**Kya NAHI karna:**
- Google ka "Recommendations" / "Optimization score" badhane ke liye **har suggestion "Apply" mat karein**. Usmein aksar budget badhane aur broad match ke suggestions hote hain.
- Google ke rep ka phone aaye to unki baat sun lein, lekin **budget ya campaign type bina soche na badlein**.
- Pehle 7 din mein roz settings mat badlein. Google ko seekhne mein 3-5 din lagte hain.
