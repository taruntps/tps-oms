# WhatsApp Marketing Template — copy-paste system (TPS Xperts Group)

WhatsApp marketing messages MUST use a **Meta-approved template**. Create it once in
**Meta WhatsApp Manager → Message Templates → Create Template**, get it approved
(usually a few hours), then run the campaign from the portal (WhatsApp Campaigns).

Reuse this file for every future template: copy the fields below into Meta, tweak the
wording, submit for approval.

---

## Template 1 — "tps_marketing_intro" (general intro, no variables — easiest to approve)

- **Category:** Marketing
- **Name:** `tps_marketing_intro`  (lowercase + underscores only)
- **Language:** English
- **Header:** Media → **Image** → upload the banner sample
  (`https://portal.tpsxpert.com/tps-signature.jpg`)
- **Body:**

```
Greetings from *TPS Xperts Group* — regulatory & compliance experts for food, nutraceutical, dietary supplement & health products. 20+ years, 500+ clients across India & global markets.

End-to-end support:
• FSSAI registration & licensing
• Nutraceutical & food regulatory consulting
• Label & claims compliance
• Ingredient & product approvals
• HACCP / GMP / food safety
• FoSTaC & compliance training
• International market entry (USA, UAE, UK)

Planning a product, approval or market launch? Reply here and our team will guide you. See you at *IPHEX 2026*!
```

- **Footer:** `Reply STOP to unsubscribe`
- **Buttons:**
  - Type **Visit Website** → Text: `Visit Website` → URL: `https://www.tpsxperts.com`

---

## Template 2 — "tps_marketing_intro_named" (personalised — needs a name column)

Same as above, but start the body with a variable:

```
Hello {{1}}, greetings from *TPS Xperts Group*!
```
- Provide a **sample value** for {{1}} when submitting (e.g. "Sir/Madam").
- Only use this if your recipient list has a name column.

---

## Approval tips (so Meta says yes)
- Keep it professional; avoid ALL-CAPS words, excessive emojis, "free!!!", price hype.
- Always keep the **STOP / opt-out** line in the footer.
- Image header must be a real sample (the banner is fine).
- Marketing category is correct for promotional content.

## After approval
1. Portal → **WhatsApp Campaigns** → New Campaign.
2. Enter the **template name** exactly (`tps_marketing_intro`) and the **header image URL**
   (`https://portal.tpsxpert.com/tps-signature.jpg`).
3. Add phone numbers: **paste** them (one per line, country code e.g. `9198…`) or click
   **Upload CSV** — first column = phone, optional second column = name. Only **opted-in** contacts.
   (Two Excel columns pasted directly also work.)
4. To greet each contact by name, tick **Personalize with recipient name** — this needs a
   template with a `{{1}}` name variable (e.g. `tps_marketing_intro_named`). Set a **fallback**
   like "Sir/Madam" for rows without a name.
5. Send — the portal throttles and skips opted-out numbers.

## Compliance
- Only message contacts who consented. Honour STOP replies (added to the suppression list).
- Meta bills per marketing conversation (~₹0.7–0.8 in India).
