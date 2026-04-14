# GlassyVision Lab Workflow Research

Scope: how a small Indian optical lab (tracer + patternless edger + manual mounting bench) actually turns an online Rx order into a shipped parcel, and what that implies for our work-order format, lab dashboard, and status model.

---

## 1. Physical workflow (order received -> courier handoff)

**Bottom line: a realistic small-lab workflow has 12-14 discrete stations, not 5. Cycle time is 35-55 min of hands-on labor for single-vision, 60-90 min for progressive, but wall-clock time is dominated by coating/AR cure queues and batch tinting.**

Refined step list:

1. **Order intake / Rx verification** - optician re-reads Rx, checks sanity (cyl axis 0-180, add >=0.75 for PAL, power within lab capability, PD sensible for face width).
2. **Job ticket generation** - printed work order with barcode/QR; tray allocated; all components for the job live in that tray until ship.
3. **Frame pick** - from rack or supplier box; frame traced on a **tracer** (e.g. Huvitz CFR-4000, Nidek LT, Essilor Kappa) to capture the bezel shape as a digital pattern.
4. **Lens blank selection** - correct material (CR-39, poly, Trivex, 1.60, 1.67, 1.74), correct base curve for the Rx, correct diameter (60/65/70/75 mm) so the blank actually covers after decentration.
5. **Lensometer check of uncut blank** - confirm sphere/cyl/axis/add of the blank matches the Rx before cutting. This catches wrong-blank picks before they become scrap.
6. **Layout / blocking** - mark optical centre and (for PAL) fitting cross on the blank using a layout blocker or manual marker, then mount a **block** (leap pad / alloy block) on the front surface. This is where PD and fitting height become physical reality.
7. **Edging** - patternless edger (Huvitz CAB-4000, Nidek Lex/Me, Santinelli LE/ME, Weco) cuts the lens to trace shape with the chosen bevel (standard V-bevel, groove for rimless, drill for 3-piece).
8. **Deblock + hand-finish** - remove block, safety-bevel edges, polish bevel if high-index.
9. **Coating / tinting (if ordered)** - dip tint bath (CR-39 only), photochromic pre-coated, AR coating is almost always outsourced or done in a separate vacuum chamber with multi-hour cure. Small Indian labs typically buy AR-stock lenses rather than run their own AR line.
10. **Mounting / insertion** - warm frame (salt pan or warm-air heater), snap lens in, check symmetry.
11. **Final lensometer + QC** - verify sphere/cyl/axis/add/prism on the mounted lens, check optical centre height, check for scratches/chips, check tightness of screws, check frame alignment (pantoscopic tilt, wrap).
12. **Clean + case + accessories** - microfiber, case, cleaning cloth, Rx card copy.
13. **Pack** - bubble wrap, outer box, waybill + commercial invoice.
14. **Dispatch** - courier pickup, tracking number logged against order.

Typical hands-on time, small lab:
- **Single-vision stock Rx, stock frame:** 30-45 min labor, same-day possible.
- **Progressive (PAL):** 60-90 min labor, plus mandatory 10-20 min "rest" between layout and edging so the block sets. Same-day if in by noon.
- **High-index + AR + PAL:** usually 2-4 days because the coated blank is ordered in from a wholesaler (Essilor India, GKB, Vision Rx Lab).

Machines to model in the dashboard as "resources" (for capacity planning later): **tracer, blocker, edger, lensometer, tinting unit, UV/AR oven, hand-edge bench**. A one-bench lab has 1 of each; the edger is the bottleneck.

---

## 2. Work-order document - required fields (and what software-only work orders forget)

**Bottom line: software work orders routinely forget fitting height, monocular PD, and frame box measurements - and those are exactly the fields that cause remakes. Print a physical ticket with a QR code AND ship the digital record; the physical ticket rides in the tray.**

Minimum field set (group them on the ticket in this order so the optician reads them naturally):

**Customer / order**
- Order ID, customer name, phone, destination country
- Order date, promised ship date, priority flag
- Barcode / QR of order ID

**Prescription**
- OD: sphere, cylinder, axis, add, prism (H + V + base direction)
- OS: sphere, cylinder, axis, add, prism
- **Monocular PD (OD / OS)** - not just binocular. PAL and high-power Rx need mono.
- **Near PD** if reading-only
- **Fitting height** (OC height for SV, fitting cross height for PAL) - measured from the lowest point of the lens to pupil centre. THIS IS THE FIELD MOST OFTEN MISSING.
- Dominant eye (for PAL troubleshooting)
- Back vertex distance, pantoscopic tilt, wrap angle (only required for "compensated" PALs and freeform; for MVP, capture-if-known)

**Lens**
- Type: SV / bifocal (FT-28, FT-35, round) / PAL / office / reading
- Material: CR-39, poly, Trivex, 1.60, 1.67, 1.74, glass
- Brand/design if branded (Varilux Comfort, Zeiss Progressive Plus, Kodak Unique, generic)
- Base curve (lab can derive, but capture if customer/supplier specified)
- Diameter of uncut blank
- Coating stack: HMC / AR / SHMC / blue-cut / photochromic / polarized / mirror
- Tint: colour, %, gradient or solid
- **Decentration** (in/out, up/down in mm) - derived from PD and frame A/DBL but should be printed on the ticket so the blocker can double-check.

**Frame**
- SKU, model, colour
- **Box measurements: A (eye size), B (vertical), ED (effective diameter), DBL (bridge), temple length**. The "50-18-140" on the temple is not enough - ED matters for blank-size selection.
- Frame type: full-rim / half-rim (nylor/supra) / rimless (drill) / metal / acetate / TR90 - determines bevel or drilling.
- Material note if fragile (titanium snap, wood, buffalo horn).

**Ops**
- Who built it (technician initials), when started, when finished, QC pass/fail with reason code.
- Remake flag and link to parent job if this is rework.
- Notes field (free text) for the optician to flag anything odd.

Fields commonly forgotten in software-only work orders and that we MUST include:
1. Fitting height
2. Monocular PD (both eyes)
3. Effective diameter (ED) of the frame
4. Pantoscopic tilt / wrap (for premium PAL)
5. A "special instructions" free-text line
6. Technician initials + timestamp per station
7. A clear remake-vs-new-job flag.

---

## 3. Status states for the lab dashboard

**Bottom line: aim for ~10 operational states mapped 1:1 to physical stations, plus 3 exception states. Fewer and ops is blind; more and the bench staff stops updating.**

Recommended MVP state machine:

1. `NEW` - order received, not yet acknowledged by lab
2. `RX_VERIFIED` - optician signed off Rx and frame choice
3. `MATERIALS_READY` - frame in hand, correct blank in hand (or ordered in)
4. `BLANK_ON_ORDER` - waiting on coated stock from wholesaler (exception queue)
5. `TRACED_BLOCKED` - shape captured, lens blocked
6. `EDGED` - cut to shape
7. `MOUNTED` - lens in frame
8. `QC_PASS` / `QC_FAIL` - lensometer + visual
9. `REMAKE` - failed QC, parent job linked, reason code captured
10. `PACKED`
11. `DISPATCHED` - courier has it, tracking number recorded
12. `DELIVERED` - webhook from courier

Exception states to surface separately on the board, not inline in the main flow:
- `ON_HOLD_CUSTOMER` (ambiguous Rx, needs customer confirm)
- `ON_HOLD_SUPPLIER` (waiting on lens/frame shipment)
- `ESCALATED` (any job stuck >48h auto-lands here).

What DVI, Innereye, RxUniverse and similar do: they typically have 15-25 micro-states but collapse them into ~6 "phases" on the technician view. We should do the same - full state on the audit log, 6-wide kanban on the shop-floor tablet.

Kanban columns for the tablet: **Inbox | Ready to cut | On edger | On bench | QC | Ship**. Each card shows order ID, customer first name, promised date, Rx type badge (SV/PAL/BF), and a red dot if any field is missing.

---

## 4. QC / quality control

**Bottom line: two-stage QC. Pre-mount lensometer check of the cut lens, then post-mount verification with a photograph. Every QC pass must capture 4 datapoints per eye.**

Capture at QC:
- **Lensometer reading** - sphere, cyl, axis, add, prism - typed in by tech or ideally pulled via RS-232/USB from the lensometer into the job record. Compare to ordered Rx with tolerance per ANSI Z80.1 / IS 14896 (e.g. +/-0.13 D on sphere up to 6.50, axis +/-2 deg for cyl >=0.75).
- **Optical centre height measurement** vs ordered fitting height.
- **Cosmetic check** - scratches, chips, coating defects, AR haze.
- **Frame check** - screws tight, temples aligned, pantoscopic tilt symmetric, no stress marks at eyewire.
- **Before-ship photo** - one front, one 3/4 - stored against the order. Serves as dispute evidence and trains the team.
- **Tech signature** (PIN login on the tablet) so we know who passed it.

A QC fail should force a reason-code dropdown (axis off, power off, wrong PD, chipped edge, scratch, coating defect, frame damage, wrong frame, wrong tint, other) before the job can be moved to REMAKE. Those codes become our pareto chart in week 2.

---

## 5. Common failure modes

**Bottom line: 80% of remakes come from 5 causes: wrong axis transcription, PD/fitting-height errors, edging chips, blank-selection mistakes, and frame damage during mounting. The dashboard should actively defend against each.**

| Failure | Where it happens | Dashboard defense |
|---|---|---|
| Axis mis-keyed (e.g. 70 vs 170) | Order intake | Require double-entry of axis for cyl >= 1.00, flash red if outside 0-180 |
| Wrong PD used | Layout/blocking | Require mono PD, show PD range warning vs frame DBL+A |
| Fitting height missing for PAL | Rx verify | Block state transition to MATERIALS_READY if PAL and no height |
| Wrong blank material/base curve | Blank pick | Barcode scan the blank, cross-check rule engine (e.g. poly for kids/drill mounts, high-index for power > 4D) |
| Chipped edge on high-index | Edger | Capture "chip" as QC reason; flag edger for dressing/calibration if >3 in a week |
| Decentration error on high wrap | Blocking | Enforce ED-based min-blank-size calculator at order intake |
| Scratched during deblock | Hand finish | Pre-apply edge tape rule for AR lenses |
| Frame cracked at mount | Mounting | Capture frame-warmer temperature log; flag brittle SKUs |
| Wrong Rx transcribed from customer upload | Intake | Two-person verify for any Rx over +/-4D or with prism |
| Lost job | Physical tray | Tray barcode scanned at every station; dashboard flags jobs not moved in >8 working hours |

---

## 6. India-specific context

**Bottom line: assume WhatsApp-native ops, UPS/inverter for power, Chinese/Korean edgers, Hindi/regional terms on the bench, and that GST on Rx eyewear is 18%, with 5% on frames alone and 12% on Rx lenses - check with the lab's CA for current rates.**

- **Power**: 2-4 hour daily outages in tier-2 cities are normal. Edgers need clean power - budget for a 5-10 kVA online UPS or generator with AVR on the edger + tracer + lensometer. Dashboard should handle offline: tablet caches last state, syncs when LAN returns.
- **Machinery brands common in India**: Huvitz (Korea) dominates small labs; Nidek, Topcon, Takubo for higher end; Chinese (Supore, Shanghai Lambda) for budget; Essilor Kappa/Mr Blue in larger Lenskart-tier labs. Tinting is usually BPI units.
- **Orders today**: small labs run on **WhatsApp + paper book**. The founder's friend probably gets Rx as a JPEG photo of a handwritten prescription. Our system must accept a photo upload and let the optician manually transcribe it into structured fields, keeping the photo attached to the job.
- **Terminology**: "spec" = spectacles; "number" = dioptre; "cut" = edge; "frame fitting" = mounting; "white glass" = CR-39 clear; "bifocal" usually means FT-28 segment; "progressive" or "PAL" increasingly common; "cylinder" pronounced "cyl" as in the West. Lab timings usually 10am-8pm six days, Sunday off or half-day.
- **GST** (confirm with CA): frames 5-12%, prescription lenses 12%, sunglasses without Rx 18%, contact lenses 18%. HSN 9001/9003/9004. For export, GST is zero-rated (LUT filing) so the lab ships without charging GST but must file LUT yearly.
- **Other compliance**: BIS standard IS 14896 for ophthalmic lenses; Legal Metrology if selling within India.

---

## 7. Cross-border shipping India -> US/Canada

**Bottom line: DHL Express and FedEx International Priority are the only realistic options for 2-6 day delivery of a single pair; budget USD 22-45 per parcel at ~500 g. Rx eyewear into the US is a Class I medical device requiring FDA Establishment Registration of the lab and FDA Prior Notice on every shipment; into Canada it is a Class I medical device under MDR but personal importation by the patient is generally permitted.**

Realistic courier options for a 300-600 g parcel, DEL/BOM -> US:
- **DHL Express Worldwide** - 3-5 days, INR 1,800-3,500 (~USD 22-42). Most reliable for eyewear, best tracking.
- **FedEx International Priority** - 3-6 days, similar pricing. Good US customs handling.
- **Aramex** - 5-8 days, 15-20% cheaper, weaker US last-mile.
- **Shiprocket X / Shyplite / Pickrr** - aggregators that resell DHL/FedEx/Aramex/UPS; good for a small shop because they bundle label, commercial invoice, KYC, and sometimes handle LUT export docs. Expect the same transit times as the underlying carrier.
- **India Post Speed Post (EMS)** - cheapest (~USD 8-12) but 10-21 days and no meaningful tracking; avoid for a premium brand.
- **Delhivery One** - primarily domestic; international via aggregator partner.

Customs paperwork the lab must prepare per shipment:
- **Commercial invoice** with HSN 9004.90 (spectacles, prescription) or 9004.10 (sunglasses), unit value, country of origin India, "Made in India".
- **Shipping bill** filed on ICEGATE (the aggregator does this) - needed for GST refund / LUT export record.
- **KYC**: IEC (Import Export Code) of the seller entity is mandatory for exports above small-value thresholds; AD Code registered with the port of export.
- **LUT (Letter of Undertaking)** filed annually on GST portal so the export is zero-rated without paying IGST upfront.
- **AWB** from the courier, attached to the box.

**FDA (US) - critical**:
- Prescription ophthalmic lenses are **FDA Class I medical devices (21 CFR 886.5842)**. Frames are also Class I (886.5842). Sunglasses without Rx are Class I (886.5850).
- The **lab (foreign establishment) must register with FDA** under 21 CFR Part 807 and list the products. A **US Agent** is required for a foreign establishment.
- **FDA Prior Notice** (Bioterrorism Act) is for food only - it does NOT apply to eyewear. What DOES apply is an **FDA entry filing (product code 86LYO for Rx lenses)** when the shipment crosses the border; the courier's customs broker handles this if you give them the FDA registration number and product code.
- General controls: labeling must include manufacturer, lot/serial (order ID), and "Caution: Federal law restricts this device to sale by or on the order of a licensed practitioner" - which is satisfied because we hold a valid Rx on file.
- No 510(k) required for standard Rx lenses and frames (exempt).

**Health Canada**: Rx lenses and frames are Class I medical devices under the Medical Devices Regulations. Class I devices don't need a device licence, but the importer/distributor in Canada needs an MDEL (Medical Device Establishment Licence). If we ship directly to the end consumer who ordered their own Rx, that is generally treated as personal importation and is permitted; if we set up a Canadian distributor, MDEL applies to that entity.

**Duties/taxes at destination** (delivered-duty-unpaid is the norm for small shops; DDP is friendlier for the customer and should be the long-term goal):
- **US**: HTS 9004.90.00 Rx spectacles are duty-free; sales tax is collected at state level by the marketplace/seller depending on nexus. De minimis USD 800 per shipment per day per recipient covers single-pair orders.
- **Canada**: HS 9004.90 is duty-free under MFN; 5% GST + provincial tax applies above CAD 20 de minimis (CAD 40 for courier under CUSMA). Build DDP into the checkout price.

**Implication for the dashboard**: the PACKED->DISPATCHED transition should require (a) commercial invoice PDF generated from the order, (b) destination-country compliance checklist ticked (FDA reg #, HSN, Rx on file link), (c) courier AWB entered. Missing any of these blocks shipping.

---

## Appendix: what this means for the MVP lab dashboard

- Tray-level barcode, not order-level, is the physical unit of work.
- Tablet-first UI with large touch targets, offline cache, PIN login per tech.
- 10 operational states + 3 exceptions, shown as a 6-column kanban with per-card warnings.
- Intake form that enforces the "commonly forgotten" fields (mono PD, fitting height, ED) as hard blockers.
- QC step captures lensometer reading + front photo + tech PIN before PACKED.
- Shipping gate enforces commercial invoice + FDA product code + AWB.
- Remake reason codes feed a weekly pareto surfaced on the dashboard home.
