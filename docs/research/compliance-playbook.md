# GlassyVision Compliance Playbook (US + CA, Phase 1)

**Scope:** Rx eyewear + sunglasses, DTC to US/CA, fulfilled from India, self-upload Rx, no third-party verification partner.

**Status:** Architectural scoping, NOT legal advice. Sections flagged **LAWYER** require licensed counsel before launch. Drafted from training knowledge (web tools unavailable in this session); a lawyer should validate specific paragraph numbers and any post-April-2026 amendments.

---

## 1. FTC Eyeglass Rule (16 CFR Part 456)

**Bottom line: Possession of a valid, unexpired Rx is sufficient — you do NOT have to call the doctor — but you must (a) have it on file before dispensing, (b) retain it 3+ years, (c) reject expired Rx. A self-uploaded image DOES satisfy "have on file."**

Operative requirements for an online seller:

- **Prescriber release (456.2):** The Rule obligates the *prescriber* to hand the Rx to the patient at no charge. The 2024 amendments added a signed Patient Acknowledgment of Prescription Receipt — that burden is on the prescriber, not you. Net effect: customers should already have a copy to upload.
- **"Have on file" via patient upload:** 456.1(h) defines dispensing as providing eyewear pursuant to a valid Rx. The Rule does not require seller-to-prescriber contact. Customer upload of a legible Rx image is industry-standard and how Zenni, EyeBuyDirect, GlassesUSA, and online-channel Warby Parker operate.
- **Validity/expiration:** The Rule defers to the prescriber's stated expiration OR state law. Most states set 1 year (CA, NY) or 2 years (TX, FL). **Operational rule: reject Rx with a past expiration; if none is stated, treat as valid 1 year from issue.** Matches conservative competitor posture.
- **Retention:** Minimum 3 years of Rx records + sale records (456.3 as amended). Store image, typed values, attestation, timestamp, IP, and linked order.
- **Disclosures:** No mandated banner, but FTC Act Section 5 prohibits deception. Do NOT imply doctor verification if you don't do it. Collect Rx before payment or at minimum before shipping.
- **PD:** 2024 amendments do not require prescribers to include PD. Measure or ask — standard practice.

**Hubble Contacts FTC settlement (Vision Path, Inc., 2022, ~$3.5M):** Violated the **Contact Lens Rule** (different rule), but lessons transfer. Hubble (1) shipped without valid prescriptions or via sham "passive verification" (auto-approve on prescriber non-response), (2) substituted brands without authorization, (3) used deceptive reviews, (4) failed the 8-business-hour prescriber verification window.

**Lessons for GlassyVision:** Never dispense without an Rx on file; never substitute lens power/material/coatings from what was ordered against the Rx; no fake reviews; if you ever add prescriber contact, actually log it — don't auto-approve.

**LAWYER:** Confirm exact 2024 amendment text and effective date; produce a 50-state Rx expiration matrix OR accept a 1-year hard default.

---

## 2. FDA Requirements (Rx Spectacle Lenses)

**Bottom line: Finished Rx spectacle lenses are FDA Class I (21 CFR 886.5842), 510(k)-exempt, but as importer of record you MUST register your US establishment, list the device, and maintain impact-resistance records. NO de minimis volume exemption. Spectacle lenses are NOT radiation-emitting — Form 2877 does not apply.**

What a small importer must do:

- **Establishment Registration (21 CFR 807):** Annual registration via FURLS. FY2026 user fee ~$9,280 (confirm current year). **Flat fee regardless of volume — your single biggest fixed FDA cost.**
- **Device Listing:** List "spectacle lens" (product code HQY) and "spectacle frame" (HQF). Free in FURLS.
- **US entity vs. foreign facility:** If the India facility ships finished devices to the US, the India facility generally must also register as a foreign establishment and designate a US Agent — *doubling* the fee. Many small importers avoid this by structuring India as a components/subassembly supplier and the US entity as the "manufacturer" (final QC/labeling/packout in the US). **LAWYER / FDA regulatory consultant — this is structural and material to cost.**
- **Prior Notice:** Prior Notice under FSMA is for FOOD, not devices. **Not required for eyewear.** Every shipment still clears FDA via ACE with correct product codes; customs broker handles this.
- **Impact Resistance (21 CFR 801.410):** ALL Rx and non-Rx eyeglass/sunglass lenses sold in the US must be impact-resistant; the seller must keep records (drop-ball test or equivalent) for 3 years. Applies to glass and plastic, Rx and non-Rx. **Load-bearing — failure here is a top cause of FDA import refusal for eyewear.** Your India lab must run drop-ball testing on representative samples and issue compliance certificates.
- **Form 2877:** NOT applicable. 2877 is for lasers/x-ray/sunlamps/microwaves.
- **QSR (21 CFR 820):** Class I exempt devices are exempt from most QSR *except* complaint handling (820.198) and general records.
- **MDR (21 CFR 803):** Yes, even Class I. Report deaths/serious injuries within 30 days. Have a one-page SOP.

**De minimis:** None. 10/day or 10,000/day, the registration fee, listing, impact-resistance records, and MDR obligations are identical.

**LAWYER / regulatory consultant:** Confirm entity structure to minimize registration footprint; current user fee; correct product codes for your SKUs.

---

## 3. FTC Contact Lens Rule — Scope Discipline

**Bottom line: The Contact Lens Rule (16 CFR Part 315) is a *different* rule with strict 8-business-hour prescriber verification mandates. It does NOT apply if you don't sell contacts. Keep it that way in phase 1.**

Site hygiene:
- No listing, advertising, or linking to contacts anywhere on GlassyVision in phase 1.
- Avoid "contacts" as a keyword (except "contact us" in the CS sense).
- Reject any uploaded Rx with BC (base curve) or DIA (diameter) fields — that's a contact lens Rx. Return a clear error.
- If a customer uploads a contact Rx by mistake, the rejection email should say "GlassyVision does not sell contact lenses."

If you add contacts in phase 2, budget a full Contact Lens Rule buildout: real-time prescriber verification, 8-hour timer, audit logs, substitution prohibitions. Materially larger than the Eyeglass Rule. Hubble's $3.5M is the precedent for getting it wrong.

---

## 4. Canada Compliance

**Bottom line: Optical dispensing is provincially regulated (Ontario COO, Quebec OOQ, BC). Enforcement against foreign DTC e-commerce has been light in practice — Zenni/EyeBuyDirect/GlassesUSA all ship DDP to all provinces — but legal risk is non-zero, especially in Quebec. Tax registration at CAD $30K/12-month is the firmer obligation.**

### Optical regulation

- **Ontario (College of Opticians of Ontario):** Opticianry Act, 1991. COO has historically sent C&Ds to some online sellers but foreign enforcement is light.
- **Quebec (Ordre des Opticiens d'Ordonnances du Québec):** Historically the most aggressive; pursued Coastal Contacts. **Treat Quebec as elevated risk.**
- **British Columbia (now under the College of Health and Care Professionals of BC, post-2024 amalgamation):** Similar statute, light foreign-seller enforcement.
- **Other provinces:** Similar schemes, lighter enforcement.

**Practical posture:** Match competitors — ship to all 10 provinces, require valid Rx on file, display "not a substitute for in-person fitting" disclaimer, do NOT claim licensed opticians on staff unless true, respond to any C&D through counsel and geo-block that province if needed.

**LAWYER:** Canadian healthcare regulatory counsel (Ontario + Quebec ideal) for current 2026 enforcement posture, T&C drafting, and Quebec French-language disclaimers (Bill 96 tightened requirements in 2023).

### Tax (GST/HST/PST/QST)

- **Small-supplier threshold:** CAD $30,000 over any 4 rolling quarters. Under — optional; over — mandatory registration ~30 days.
- **Rates:** Federal GST 5%; HST 13% (ON) / 15% (NB, NL, NS, PE). Non-HST provinces: GST 5% + PST/QST separately.
- **PST provinces:** BC 7% (non-resident threshold tightened to CAD $10K in 2023), Saskatchewan 6%, Manitoba 7%, Quebec QST 9.975% (CAD $30K non-resident threshold).
- **Rx eyewear is zero-rated for GST/HST** under Schedule VI, Part II, Excise Tax Act — prescription eyewear dispensed on the order of an eye care professional. Non-Rx sunglasses are fully taxable. **Real advantage: most Rx SKUs collect 0% GST/HST, but you still register and file zero-rated returns.** QST treats Rx eyewear similarly.

### Customs

- **De minimis (CUSMA):** CAD $40 duties / CAD $150 taxes — **applies to shipments from US/Mexico only**. Shipments from India fall under the old CAD $20 threshold, so most attract GST/HST and any MFN duty. DDP is mandatory for decent UX.
- **HS codes:** 9004.90 (Rx spectacles) and 9003.xx (frames). Most Rx spectacles are duty-free under MFN from India; verify exact 10-digit classification with broker.
- Use a Canadian customs broker (Livingston, Cole, UPS/FedEx) for LVS clearance.

**LAWYER / tax advisor:** Canadian sales tax specialist to confirm zero-rating mechanics, non-resident GST/HST simplified vs. standard regime, and BC/QC/SK thresholds.

---

## 5. Shopify-Native Compliance Tooling

**Bottom line: Shopify Markets + Shopify Tax covers ~80% of the geo/tax problem out of the box. There is no native Shopify Rx intake — build it yourself or use a commodity upload app. Most "Rx verification" apps are snake oil.**

- **Shopify Markets:** Geo-route by country. Create a "US-CA only" market for Rx SKUs; a "Global" market for non-Rx sunglasses only. Block Rx checkout outside US/CA.
- **Shopify Tax (US):** Nexus tracking, rooftop-accurate rates. Paid after $100K revenue threshold; worth it.
- **Shopify Tax (CA):** Calculates GST/HST/PST/QST but does NOT register or file for you. Pair with a CA accountant or tax service.
- **Checkout UI extensions / Shopify Functions:** Gate Rx SKUs on "prescription uploaded = true." Cleanest place to enforce "no Rx, no ship."
- **Shopify Flow:** Auto-hold orders when Rx is missing/unreadable; route to CS queue.
- **File upload:** Not native. Cheapest: a commodity app like Uploadery or Easify (~$5-15/mo). Best long-term: custom app using Files API with line-item property. Avoid post-purchase email collection — bad audit trail.
- **Snake oil:** Anything branded "Rx verification" or "prescription compliance" charging per verification. Either thin upload forms or third-party verification partners (the exact thing you don't want).
- **Legit adjuncts:** Klaviyo (Rx follow-ups), Gorgias (Rx review queue).

---

## 6. Minimum Viable Compliance Checklist (Launch-Blocking)

**Bottom line: 13 load-bearing items. Everything else is polish.**

1. **Incorporate a US entity** (DE C-corp or LLC) as importer of record and FDA-registered establishment. Isolates liability; cleanest FDA posture.
2. **FDA establishment registration + device listing** (HQY, HQF) via FURLS; pay annual user fee. Legal requirement; no de minimis.
3. **Impact-resistance records** from your India lab (drop-ball per 21 CFR 801.410), retained 3 years. Top cause of FDA import refusal for eyewear.
4. **Mandatory Rx image upload** gated at add-to-cart or checkout. Store image, typed values, attestation, timestamp, IP. Satisfies "have on file."
5. **Rx expiration logic** — reject past expirations; default to 1 year from issue if none stated. Prevents dispensing against stale Rx.
6. **3-year retention** of Rx records in S3 (or equivalent) with versioning + access logs. FTC Rule + FDA complaint-file requirements.
7. **Customer attestation checkbox:** "I certify this prescription is current, valid, and issued to me by a licensed eye care professional." Shifts liability; auditable.
8. **Order-hold workflow** when Rx is missing/illegible. Prevents dispensing on bad data.
9. **Complaint log + MDR SOP** (even if unused). One-pager + spreadsheet. Satisfies 820.198 + Part 803.
10. **Shopify Markets geo-block** so Rx SKUs only check out in US + CA. No UK scope creep.
11. **GST/HST registration** as you approach CAD $30K; QST + BC PST registration above their thresholds. Canadian tax law.
12. **Labeling** — every shipment shows US importer name/address, "Rx only," lens material. 21 CFR 801.
13. **Terms of Sale + disclaimers** — "not a substitute for in-person exam," jurisdictional limits, return policy, Rx handling policy. FTC Act Section 5 + commercial hygiene.

**Deliberately NOT on the list:** prescriber verification calls, provincial Canadian optician licensure, Form 2877, UK MHRA registration, Contact Lens Rule compliance, CE marking.

---

## 7. What Competitors Actually Do

**Bottom line: All four accept self-uploaded Rx or typed values, do not call doctors, rely on customer attestation plus disclaimers. Match their flow — don't be more conservative than the market.**

- **Zenni:** Upload image OR type values OR "we'll contact your doctor" (optional courtesy, not default). Mandatory PD with "how to measure" guide. Attestation checkbox. Disclaimer: "not a substitute for a comprehensive eye exam." Stores Rx to profile.
- **EyeBuyDirect:** Typed form is default; image upload as backup. No doctor contact. Attestation that Rx is current. One page.
- **GlassesUSA:** Typed or uploaded; attestation; ship. Has a "send to my doctor" button that just emails a template — no real verification loop.
- **Warby Parker:** Most conservative (also runs retail optometry). Online: typed Rx or upload + attestation + disclaimer. US-lab partnerships, FDA registered.

**Patterns worth stealing:**
- Single-page Rx entry with field-level tooltips (OD/OS, SPH, CYL, AXIS, ADD, PD).
- Image upload with client-side OCR preview to reduce legibility rejections.
- Explicit attestation checkbox with specific legal language.
- "Not a substitute for an eye exam" disclaimer near the submit button.
- Rx saved to profile for reorders, subject to expiration check.
- Human review queue for illegible/ambiguous images.

**Draft disclaimer language:** "Your prescription is your responsibility. GlassyVision does not perform eye exams and does not verify prescriptions with your eye care professional. By submitting this prescription you certify it is current, valid, and issued to you. Online eyewear is not a substitute for a comprehensive eye examination."

---

## Open Questions for Lawyer/Consultant

1. FDA entity structure (US-only vs. US + foreign establishment) — material cost impact.
2. State-by-state Rx expiration defaults — 50-state matrix or 1-year default.
3. Quebec enforcement posture in 2026 — recent OOQ actions against foreign e-commerce?
4. Non-resident GST/HST simplified vs. standard regime — which is cheaper given zero-rated Rx?
5. Exact attestation checkbox language — drafted by US counsel for maximum weight.
