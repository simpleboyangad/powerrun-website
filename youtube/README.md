# PowerRun Industries — YouTube Channel का पूरा Plan

> यह file आपके लिए है, ग्राहक के लिए नहीं। Google पर नहीं दिखेगी (`robots.txt` में बंद है)।
>
> **Channel खुद बनाना पड़ेगा** — YouTube account बनाने के लिए Google password डालना होता है,
> वो मैं नहीं कर सकता और किसी को देना भी नहीं चाहिए। नीचे हर click लिखा है, 15 मिनट का काम है।
> बाकी सब — नाम, description, banner, thumbnail, 30 video का plan — यहाँ तैयार है।

---

## 1. Channel बनाने के steps (15 मिनट)

1. `youtube.com` खोलें → उसी Google account से login करें जो business का हो
   (निजी Gmail नहीं — बाद में staff को access देना मुश्किल हो जाता है)।
2. ऊपर दाएँ अपनी photo → **Settings** → **Add or manage your channel(s)** → **Create a channel**।
3. **"Use a business or other name" चुनें** — इसे *Brand Account* कहते हैं।
   फ़ायदा: बाद में किसी भी बंदे को manager बना सकते हैं **बिना password दिए**।
   (Settings → Managers → Invite → उसका Gmail)
4. नाम डालें: **PowerRun Industries**
5. **Customise channel** → तीन tab भरने हैं:
   - **Branding** → Profile picture, Banner, Video watermark (नीचे section 4)
   - **Basic info** → Description, Handle, Links, Contact (नीचे section 3)
   - **Layout** → Featured video, Playlists (नीचे section 5)
6. Settings → Channel → **Advanced settings** → Country = **India**, Keywords भरें (section 10)।
7. Settings → Channel → **Feature eligibility** → phone number verify करें
   (इसके बिना 15 मिनट से लंबी video, custom thumbnail और live कुछ नहीं होगा — **ये ज़रूर करें**)।

---

## 2. नाम और Handle

| क्या | क्या रखें |
|---|---|
| Channel name | **PowerRun Industries** |
| Handle (पहली पसंद) | **@powerrunindustries** |
| अगर वो ले लिया गया हो | `@powerrun_in` → `@powerrunenergy` → `@powerrunindia` |

> Handle वही रखें जो website है — `powerrun.in` और `@powerrunindustries` साथ में भरोसा बनाते हैं।
> Handle बाद में बदल सकते हैं, पर पुराने link टूटते हैं — एक बार में सही चुन लें।

---

## 3. Basic info — जैसा है वैसा copy कर दें

### Description (About box)

```
PowerRun Industries — लिथियम बैटरी, हाइब्रिड इन्वर्टर और सोलर सिस्टम।

इस channel पर आपको मिलेगा:
• LiFePO4 लिथियम बैटरी — असली सच्चाई, बिना बढ़ा-चढ़ाकर
• हाइब्रिड इन्वर्टर (3.6kW से 12kW तक) — setting, install, demo
• सोलर पैनल और पूरा सोलर सिस्टम — खर्च का असली हिसाब
• E-रिक्शा बैटरी — रेंज, बचत, कितने साल चलेगी
• आपके घर/दुकान के लिए कितना size चाहिए — calculator से 10 सेकंड में

हम बनाते और सप्लाई करते हैं: LiFePO4 बैटरी पैक (25.6V / 51.2V),
MPPT वाले हाइब्रिड इन्वर्टर, Mono PERC व bifacial सोलर मॉड्यूल,
और e-रिक्शा/e-लोडर बैटरी। पूरे भारत में डिलीवरी।

🛒 Products और दाम: https://powerrun.in/products/
🔋 फ्री Battery Calculator: https://powerrun.in/battery-calculator/
☀️ फ्री Solar Calculator: https://powerrun.in/solar-calculator/
🤝 Dealership के लिए: https://powerrun.in/dealer/
🛡️ Warranty रजिस्टर करें: https://powerrun.in/warranty/
🔧 Service request: https://powerrun.in/service/

📞 +91 86075 65520  (WhatsApp: https://wa.me/918607565520)
✉️ service@powerrun.in

नई video हर मंगलवार। Sizing में मदद चाहिए तो comment करें — जवाब देते हैं।
```

### Links (banner पर दिखते हैं — ज़्यादा से ज़्यादा 5, पहला banner पर आता है)

| क्रम | Title | URL |
|---|---|---|
| 1 | Website | `https://powerrun.in/` |
| 2 | WhatsApp | `https://wa.me/918607565520` |
| 3 | Products | `https://powerrun.in/products/` |
| 4 | Free Calculator | `https://powerrun.in/battery-calculator/` |
| 5 | Dealership | `https://powerrun.in/dealer/` |

### Contact info
Business email: `service@powerrun.in`

---

## 4. Branding — files बनी-बनाई रखी हैं

इसी folder में, सीधे upload करने लायक:

| File | कहाँ लगाना है | Size |
|---|---|---|
| `powerrun-youtube-banner.png` | Branding → **Banner image** | 2560 × 1440 |
| `powerrun-profile-picture.png` | Branding → **Picture** | 800 × 800 |
| `powerrun-logo-dark.png` | Branding → **Video watermark**, और video edit में भी काम आएगा | पारदर्शी (transparent) |
| `powerrun-thumbnail-example.png` | नमूना — thumbnail ऐसा दिखेगा | 1280 × 720 |

Watermark लगाते वक़्त **"Entire video"** चुनें — subscribe button पूरी video में दिखता रहेगा।

> Banner का सारा text बीच के "safe area" में है — मोबाइल, laptop और TV तीनों पर
> नाम, नंबर और website पूरे दिखेंगे। किनारे सिर्फ़ नारंगी धारियाँ कटेंगी।

### नया thumbnail बनाना हो (हर video के लिए)

```bash
python scripts/youtube_art.py "LITHIUM" "VS LEAD" "5 SAAL KA HISAAB" lithium-vs-lead.png
```

तीन text — पहली लाइन (सफ़ेद), दूसरी लाइन (नारंगी), नीचे पीली लाइन — और आख़िर में file का नाम।
File `youtube/` folder में बन जाएगी। फिर CapCut/Canva में उस पर product की photo चिपका दें
(दाईं तरफ़ खाली डिब्बा उसी के लिए छोड़ा है)।

> **Thumbnail का text Roman में लिखें** (`KITNE GHANTE?`), देवनागरी में नहीं —
> इस Python में हिंदी की मात्राएँ गलत जगह छपती हैं, इसलिए वो चलाने पर मना कर देगा।
> हिंदी thumbnail चाहिए तो Canva में इसी रंग-ढंग की नक़ल कर लें।

Banner या profile picture दोबारा बनानी हो तो बिना कुछ लिखे:

```bash
python scripts/youtube_art.py
```

---

## 5. Playlists — पहले दिन ही बना लें

Website की categories से मिलती-जुलती रखी हैं, ताकि ग्राहक को वही भाषा दिखे:

1. **हाइब्रिड इन्वर्टर — पूरी जानकारी**
2. **लिथियम बैटरी (LiFePO4) — A to Z**
3. **सोलर पैनल और सोलर सिस्टम**
4. **E-रिक्शा बैटरी**
5. **कौन सा size लें? — Calculator से**
6. **Installation, Setting और Service**
7. **PowerRun Dealer बनें**
8. **ग्राहक की कहानी / Unboxing**

हर playlist के description में website का सही link डालें
(जैसे इन्वर्टर playlist में `https://powerrun.in/products/`)।

---

## 6. पहली 30 Videos — पूरा plan

क्रम से बनाएँ। ऊपर वाली 10 सबसे ज़रूरी हैं — यही search में मिलती हैं और यही ग्राहक लाती हैं।

### चरण 1 — नींव (video 1–10): "लोग Google/YouTube पर यही पूछते हैं"

| # | Title (यही लिखें) | Video में क्या दिखाएँ |
|---|---|---|
| 1 | Lithium Battery vs Lead Acid Battery — 5 साल में कौन सस्ता? पूरा हिसाब | board पर खर्च का हिसाब: शुरू का दाम, कितनी बार बदलनी पड़ी, बिजली की बचत |
| 2 | LiFePO4 क्या होता है? 3 मिनट में पूरी बात | असली cell हाथ में, BMS दिखाएँ, safety की बात |
| 3 | Hybrid Inverter और Normal Inverter में फ़र्क़ क्या है? | दोनों सामने रखकर, MPPT और grid+solar+battery तीनों input समझाएँ |
| 4 | घर के लिए कितने kW का इन्वर्टर चाहिए? (2 मिनट में पता करें) | Screen recording — `powerrun.in/battery-calculator/` भरकर दिखाएँ |
| 5 | 51.2V 100Ah बैटरी कितने घंटे चलेगी? — असली गणित | पंखा, फ्रिज, LED, AC का load जोड़कर घंटे निकालें |
| 6 | Solar Panel 550W vs 600W — आपके लिए कौन सा सही? | दोनों पैनल, छत की जगह की गणना, पैसे का फ़र्क़ |
| 7 | E-रिक्शा में लिथियम बैटरी लगाएँ या नहीं? महीने की बचत | चार्जिंग का खर्च, रोज़ की कमाई, बैटरी बदलने का चक्कर |
| 8 | BMS क्या करता है? बैटरी की जान इसी में है | BMS board, over-charge / over-current / temperature cut दिखाएँ |
| 9 | 3kW सोलर सिस्टम का पूरा खर्च — छुपा हुआ कुछ नहीं | पैनल + इन्वर्टर + बैटरी + wire + structure सब जोड़कर |
| 10 | PowerRun 6.2kW Hybrid Inverter — Unboxing और पहली Setting | डिब्बा खोलने से लेकर पहली बार चालू करने तक |

### चरण 2 — Product और Demo (video 11–20): "दिखाओ, सिर्फ़ बताओ मत"

| # | Title | Video में क्या दिखाएँ |
|---|---|---|
| 11 | PR LFP 51.2V 200Ah बैटरी — Unboxing और अंदर क्या है | वज़न, terminal, BMS, display |
| 12 | इन्वर्टर की 5 ज़रूरी Setting — Solar पहले या Grid पहले? | मीनू में जाकर एक-एक setting |
| 13 | MPPT vs PWM — सोलर से कितनी बिजली ज़्यादा मिलती है? | दोनों से एक ही पैनल पर reading लेकर |
| 14 | दो बैटरी Parallel में कैसे जोड़ें — और क्या कभी न करें | सही wiring, फिर आम 3 गलतियाँ |
| 15 | सोलर पैनल किस कोण (angle) पर लगाएँ? भारत के लिए | छत पर, दिशा और angle की बात |
| 16 | 1.5 टन AC हमारे 8.2kW इन्वर्टर पर — Load Test | AC चालू करते हुए meter की reading |
| 17 | 72V 100Ah E-रिक्शा बैटरी — असली Range Test | रिक्शा के साथ सड़क पर, सुबह से शाम तक |
| 18 | गर्मी और बरसात में सोलर कितना कम बनता है? असली आँकड़े | दो अलग दिन की reading |
| 19 | Warranty कैसे रजिस्टर करें — 2 मिनट में (Website Demo) | `powerrun.in/warranty/` screen recording |
| 20 | Website से order और फिर tracking कैसे करें — पूरा तरीका | products → cart → checkout → track-order |

### चरण 3 — भरोसा और Business (video 21–30)

| # | Title | Video में क्या दिखाएँ |
|---|---|---|
| 21 | PowerRun की Factory/Warehouse — अंदर से देखिए | माल, testing, packing |
| 22 | PowerRun Dealer कैसे बनें? Margin, support और पूरा तरीका | `powerrun.in/dealer/` form भरते हुए |
| 23 | ग्राहक की कहानी — [शहर] में सोलर लगने के बाद बिल कितना आया | ग्राहक खुद बोले, बिल दिखाएँ |
| 24 | कुछ खराब हो जाए तो? Service Request का सही तरीका | `powerrun.in/service/` demo |
| 25 | लिथियम बैटरी में लोग ये 5 गलतियाँ करते हैं | खराब हुई बैटरी के उदाहरण |
| 26 | असली और नकली LFP सेल कैसे पहचानें? | वज़न, QR, capacity test |
| 27 | इन्वर्टर बार-बार Overload पर trip हो रहा है? ये करें | load निकालकर दिखाएँ |
| 28 | बैटरी 10 साल चलानी है? ये 7 बातें याद रखें | charging habit, तापमान, DoD |
| 29 | आपके सवाल — हमारे जवाब (Comment Q&A #1) | comments स्क्रीन पर लेकर जवाब |
| 30 | इस महीने का PowerRun Offer और Coupon कैसे लगाएँ | website पर coupon box भरते हुए |

---

## 7. Shorts — हफ़्ते में 2 (हर Short 20–45 सेकंड)

लंबी video से ही काट लें, दोबारा shoot करने की ज़रूरत नहीं:

1. "लेड एसिड 3 साल, लिथियम 10 साल — हिसाब लगाइए"
2. "बैटरी का ये नंबर देखे बिना मत खरीदिए" (cycle life)
3. "51.2V का मतलब क्या है?"
4. "BMS क्या बचाता है — 30 सेकंड में"
5. "सोलर पैनल पर धूल = कितने रुपये का नुकसान"
6. "इन्वर्टर पर AC चलेगा या नहीं? ये देख लीजिए"
7. "E-रिक्शा वाले भाइयों के लिए एक हिसाब"
8. "छत पर कितनी जगह चाहिए 3kW के लिए?"
9. "Calculator में 10 सेकंड — size पता"
10. "पैक खुलते ही सबसे पहले ये check करें"
11. "ये तार पतला है — यही जलती है"
12. "सर्दी में बैटरी कम क्यों चलती है?"
13. "Warranty रजिस्टर नहीं की तो?"
14. "MPPT इतना ज़रूरी क्यों है?"
15. "बैटरी full charge पर छोड़ देना ठीक है?"
16. "Grid पहले या Solar पहले — एक setting"
17. "Dealer margin — एक मिनट में"
18. "हमारी packing ऐसे होती है" (dispatch की clip)
19. "सबसे ज़्यादा पूछा जाने वाला सवाल"
20. "कितने साल की warranty — किस product पर"

---

## 8. हर Video का ढाँचा (यही formula हर बार)

| समय | क्या |
|---|---|
| 0–5 सेकंड | **सवाल या नतीजा सीधे बोलें।** "लिथियम महँगी लगती है — पर 5 साल में सस्ती पड़ती है। हिसाब देखिए।" कोई intro music नहीं, कोई "नमस्कार दोस्तों, कैसे हैं आप" नहीं। |
| 5–20 सेकंड | क्या-क्या बताएँगे — एक लाइन में |
| मुख्य भाग | **दिखाएँ** — product हाथ में, meter की reading, screen recording। सिर्फ़ बोलते रहेंगे तो लोग भाग जाते हैं |
| अंत से 30 सेकंड पहले | "आपके घर के लिए कितना चाहिए, ये calculator 10 सेकंड में बता देगा — link नीचे है" |
| आख़िरी 15 सेकंड | Subscribe + अगली video का card |

**कभी दाम मुँह से न बोलें** — "आज का दाम website पर है" कहें। दाम बदलते हैं, video रह जाती है।

---

## 9. Description का साँचा (हर video में यही चिपकाएँ)

```
<यहाँ 2 लाइन में बताएँ कि video में क्या है — पहली 2 लाइन ही search में दिखती हैं>

⏱️ Timestamps
00:00 शुरुआत
00:xx ...
00:xx ...

🔗 इस video से जुड़े link
🔋 फ्री Battery Calculator — https://powerrun.in/battery-calculator/
☀️ फ्री Solar Calculator — https://powerrun.in/solar-calculator/
🛒 सारे products और आज का दाम — https://powerrun.in/products/
🛡️ Warranty रजिस्टर करें — https://powerrun.in/warranty/
🔧 Service request — https://powerrun.in/service/
🤝 Dealership — https://powerrun.in/dealer/

📞 सीधे बात करें: +91 86075 65520
💬 WhatsApp: https://wa.me/918607565520
✉️ service@powerrun.in
🚚 पूरे भारत में डिलीवरी

PowerRun Industries — लिथियम बैटरी, हाइब्रिड इन्वर्टर और सोलर सिस्टम।

#lithiumbattery #solarinverter #lifepo4 #solarpanel #erickshaw #powerrun
```

**Pinned comment** (हर video पर, upload के तुरंत बाद):

```
अपने घर/दुकान के लिए सही size 10 सेकंड में पता करें 👇
🔋 https://powerrun.in/battery-calculator/
☀️ https://powerrun.in/solar-calculator/
सवाल नीचे comment में पूछें — हम जवाब देते हैं। WhatsApp: +91 86075 65520
```

---

## 10. Keywords और Tags

**Channel keywords** (Settings → Channel → Advanced — कॉमा से अलग):

```
lithium battery, lifepo4 battery, hybrid inverter, solar inverter, solar panel,
e rickshaw battery, solar system india, inverter battery, mppt inverter,
battery bms, 51.2v battery, 48v lithium battery, solar installation india,
powerrun, powerrun industries, lithium battery dealer
```

**Video tags** — हर video में 8–12: विषय के हिसाब से 3–4 Hindi में
(जैसे `लिथियम बैटरी`, `सोलर इन्वर्टर`), बाकी English में, और आख़िर में हमेशा
`powerrun`, `powerrun industries`, `powerrun.in`।

> Tags का असर कम है, **title + thumbnail + पहली 2 लाइन** का असर सबसे ज़्यादा है।
> मेहनत वहीं लगाएँ।

---

## 11. Thumbnail के 5 नियम

1. **3–4 शब्द से ज़्यादा नहीं।** मोबाइल पर thumbnail अंगूठे जितना दिखता है।
2. रंग हमेशा वही — काला background, नारंगी `#ff5a00`, ज़ोर देने के लिए पीला `#ffd400`।
3. एक चेहरा या एक product — दोनों नहीं, भीड़ बिल्कुल नहीं।
4. Title में जो लिखा है, thumbnail में वही शब्द दोबारा **मत** लिखें — नई बात लिखें।
5. हर बार वही command चलाएँ (section 4) — पूरी series एक जैसी दिखेगी।
   एक जैसा दिखना ही पहचान बनाता है: लोग scroll करते हुए रंग से पहचान लेते हैं।

---

## 12. Shooting का सामान (ज़्यादा खर्च की ज़रूरत नहीं)

| चीज़ | क्या लें | क्यों |
|---|---|---|
| Camera | आपका फ़ोन, पीछे वाला camera, 1080p 30fps | काफ़ी है |
| **आवाज़** | ₹700–1500 का collar mic | **सबसे ज़रूरी** — धुँधली video चल जाती है, भारी आवाज़ नहीं |
| Light | दिन की रोशनी, खिड़की सामने हो | मुफ़्त |
| Stand | कोई भी tripod | हिलती video कोई नहीं देखता |
| Edit | CapCut (मोबाइल, मुफ़्त) | Subtitle अपने आप बन जाते हैं |

**Subtitle ज़रूर डालें** — बहुत सारे लोग बिना आवाज़ के देखते हैं।

---

## 13. 90 दिन का Schedule

| हफ़्ता | क्या डालें |
|---|---|
| 1 | Channel setup + video 1 और 2 + 2 Shorts |
| 2–4 | हर मंगलवार 1 लंबी video (video 3–5) + हफ़्ते में 2 Shorts |
| 5–8 | video 6–10 + Shorts + पहली playlist पूरी |
| 9–12 | video 11–16 + पहली ग्राहक कहानी (video 23) |

**नियम:** हफ़्ते में एक video, हर हफ़्ते — 3 महीने बिना नागा।
रोज़ 4 video डालकर फिर गायब हो जाना, इससे बुरा कुछ नहीं।

पहले 7 दिन: हर comment का जवाब 24 घंटे में। शुरुआत में यही सबसे तेज़ बढ़ाता है।

---

## 14. Video से ग्राहक तक — रास्ता

```
YouTube video  →  Calculator (powerrun.in)  →  Products  →  Cart / Checkout
                        ↓
                 WhatsApp +91 86075 65520  →  Order / Dealer enquiry
```

- हर video में **calculator** का link दें — वही सबसे ज़्यादा click होता है, क्योंकि मुफ़्त है और काम का है।
- Dealer वाली video में सीधे `powerrun.in/dealer/` भेजें।
- YouTube **Cards** (video के बीच में) और **End screen** दोनों में website लगाएँ।
- जो coupon चल रहा हो, उसका code pinned comment में डालें — फिर admin panel में
  गिन सकते हैं कि YouTube से कितने order आए।

---

## 15. ये कभी न करें

- ऐसी warranty न बोलें जो `powerrun.in/warranty/` पर लिखी बात से अलग हो।
- कोई certification/ISO/BIS तब तक न बोलें जब तक कागज़ हाथ में न हो।
- किसी दूसरी कंपनी का नाम लेकर बुरा न कहें — कानूनी लफड़ा और bad image, दोनों।
- "100% safe", "कभी खराब नहीं होगी" जैसे शब्द नहीं। "LFP chemistry ज़्यादा सुरक्षित है" — यह कहने का सही तरीका है।
- दाम video में न बोलें — website पर भेजें।
- दूसरों की video, गाने या फ़ोटो न लगाएँ — copyright strike में channel चला जाता है।
- किसी ग्राहक का नाम, नंबर या घर तब तक न दिखाएँ जब तक वो खुद हाँ न कहे।

---

## 16. पहले हफ़्ते की Checklist

- [ ] Brand Account से channel बना
- [ ] Handle `@powerrunindustries` लिया
- [ ] Profile picture (`powerrun-profile-picture.png`) लगाई
- [ ] Banner (`powerrun-youtube-banner.png`) लगाया
- [ ] Description (section 3) चिपकाई
- [ ] 5 links लगाए
- [ ] Contact email `service@powerrun.in` डाला
- [ ] Country = India, Keywords डाले
- [ ] फ़ोन verify किया (custom thumbnail के लिए ज़रूरी)
- [ ] 8 playlists बनाईं
- [ ] Video 1 upload — description साँचा + pinned comment + thumbnail
- [ ] Watermark ("Entire video") लगाया
- [ ] Website के footer में YouTube का link (नीचे section 17)

---

## 17. Channel बन जाए तो मुझे बताएँ

Channel का URL देते ही मैं website में ये जोड़ दूँगा:

1. Footer में YouTube का icon और link
2. Home और About page के schema में `sameAs` — इससे Google को पता चलता है कि
   यह channel इसी कंपनी का है (दोनों आपस में जुड़ जाते हैं)
3. About page पर "हमें YouTube पर देखें" वाला section, चाहें तो video embed के साथ

बस इतना लिखकर भेज दें: `youtube link: https://youtube.com/@…`
