# WhatsApp Marketing — permanent runbook (TPS Xperts Group)

WhatsApp marketing MUST use a **Meta-approved template**. Create it **once** in Meta
WhatsApp Manager, get it approved (minutes–hours), then run campaigns from the portal
(**Business → WhatsApp Campaigns**) as many times as you like — no re-approval unless you
change the wording.

**The golden rule**
- **New wording → new Meta approval (one time).**
- **Same approved template, new people / new event → NO approval.** Just paste numbers and send.
- Any message *you* start needs a template — even to 1 number. Free text is only allowed if the
  customer messaged you first (a 24-hour reply window), which is live-chat, not this portal.

---

## The two live templates

Both use a **PDF (document) header** = the company brochure, hosted at
`https://portal.tpsxpert.com/tps-brochure.pdf`.

### 1 — `tps_intro_named` (general marketing, any time)
- **Category:** Marketing · **Language:** English
- **Header:** Media → **Document** → upload the brochure PDF as the sample
- **Body** (variable `{{1}}` = name; sample value `Sir/Madam`):
```
Hello {{1}}, greetings from *TPS Xperts Group* 🙏

Regulatory & compliance experts for nutraceutical, food & health supplement products. 20+ years, 500+ clients across India & global markets.

How we help:
• Global Nutraceutical & food regulatory consulting
• Label & claims compliance
• International market entry (USA, UAE, UK)
• FSSAI registration & licensing
• FoSTaC and food safety training
• HACCP / GMP / food safety compliances

Planning a product, approval or launch? Just reply here and our team will guide you.
```
- **Footer:** `Reply STOP to unsubscribe`
- **Buttons:** Visit website → `Visit Website` → `https://www.tpsxperts.com`

### 2 — `tps_expo_thankyou` (post-exhibition thank-you)
- **Category:** Marketing · **Language:** English
- **Header:** Media → **Document** → upload the brochure PDF as the sample
- **Body** (`{{1}}` = name, sample `Sir/Madam`; `{{2}}` = event, sample `IPHEX, Delhi 2026`):
```
Hello {{1}}, it was a pleasure meeting you at *{{2}}*! 🤝

Thank you for the wonderful discussion. As regulatory & compliance experts for nutraceutical, food & health supplement products (20+ years, 500+ clients), we'd be glad to support you with:
• Global Nutraceutical & food regulatory consulting
• Label & claims compliance
• International market entry (USA, UAE, UK)
• FSSAI registration & licensing
• FoSTaC and food safety training
• HACCP / GMP / food safety compliances

To take it forward, simply reply here.
```
- **Footer:** `Reply STOP to unsubscribe`
- **Buttons:** Visit website → `Visit Website` → `https://www.tpsxperts.com`

> `*text*` renders **bold** in WhatsApp. One header per template (Document *or* Image, not both).

---

## How to submit a template in Meta (once per new template)
1. **business.facebook.com** → **WhatsApp Manager** (or business.facebook.com/wa/manage/message-templates).
2. Sidebar → **Manage templates** → **Create template**.
3. **Category → Marketing**. **Name** in lowercase_underscores (e.g. `tps_intro_named`). **Language → English**. Continue.
4. **Header → Media → Document** → upload the brochure PDF (the sample).
5. **Body** → paste the text above. Add variable(s) and give each a **sample value**.
6. **Footer** → `Reply STOP to unsubscribe`.
7. **Buttons** → Visit website → `Visit Website` → `https://www.tpsxperts.com`.
8. **Submit**. Status goes Pending → **Approved**.

**To get approved (avoid rejection):** no ALL-CAPS, no "FREE!!!"/price hype, minimal emojis,
keep the STOP line, use the Marketing category, upload a real sample document.

---

## How to run a campaign (every time, no approval needed)
1. Portal → **Business → WhatsApp Campaigns → New Campaign**.
2. **Campaign name** (your label) + **Approved template name** (exactly, e.g. `tps_intro_named`).
3. **Header → PDF brochure** (the brochure URL is pre-filled).
4. Tick **Personalize with recipient name** → sets a **Fallback name** (Sir/Madam) and, for the
   expo template, an **Event / extra variables** box → type the event, e.g. `IPHEX, Delhi 2026`
   (that becomes `{{2}}`). For multiple extra variables, separate them with a `|`.
5. **Phone numbers**: paste (one per line, with country code) or **Upload CSV**
   (col 1 = phone, optional col 2 = name; a header row is skipped). Only **opted-in** contacts.
6. **Create campaign** → **Start sending**. The portal throttles (20 every 3 min) and skips
   opted-out numbers. Progress shows live.

---

## How to change the brochure PDF
- **For one campaign:** in New Campaign → Header → PDF brochure, paste a **different public PDF
  URL** in the box. Done.
- **To change the default brochure everywhere:** send the new PDF and ask to "update the brochure"
  — it's replaced at `portal.tpsxpert.com/tps-brochure.pdf` (URL stays the same) and redeployed
  in a couple of minutes. (The file lives in the repo at `public/tps-brochure.pdf`.)

---

## Compliance
- Only message contacts who **consented**. Honour **STOP** replies (added to the suppression list).
- Meta bills per marketing conversation (~₹0.7–0.8 in India).
