# GH-18 — R1 change register

Revision R1 (Oct 2026) of the GH-18 model, Celebrity Homes, Palam Vihar, Gurugram. Client: Mr. Praveen Kumar Yadav.

This register maps every input of Oct 2026 to what R1 does with it:
- the owner's change list
- the Vastu red-line register (items 1–18 and T)
- the Plumbing Layout Rev A clouds (P1–P10)
- the Electrical Layout Rev A clouds (A1–A8, B1–B9)

R1 is a separate version of the model. Its data is in `house_r1.json`, its plans in `plans/r1/`, and its 3D tour at `/v1/`. The main site is unchanged. The R1 item numbers (A1 … E14) refer to ASSUMPTIONS.md section E, where each change is described in full.

**Checks behind the "done" entries** (re-run with the commands in README.md):
- `plans/r1/check_report.txt`: every PDF dimension still holds.
- `plans/r1/services_report.txt`: plumbing, electrical and Vastu placements. 278 pass, 4 warnings, 0 fail.

**Status key:**
- **Done**: in the model and checked.
- **Done, differs**: done in another way. The reason is given.
- **Hold**: needs a decision or design by the architect, structural engineer, consultant, vendor or RWA.
- **Not modelled**: outside the model's scope. Passed to the trade named.

---

## 1. Owner's change list (Oct 2026)

| # | Owner's request | R1 item | What R1 does | Status |
|---|---|---|---|---|
| 1 | Family lounge, TV, dining and a small washbasin | B3 | The drawing room becomes a Family Lounge. The TV and AC go on the west wall, and the L-sofa is turned to face the TV. The dining is kept. A hand-wash basin with a mirror light goes in the niche by the kitchen wall. | Done |
| 2 | Dimensions in feet instead of metres | A2 | All plans, room labels and the 3D tour show feet-inches with metres in brackets. The model stays in mm. | Done |
| 3 | Servant-room washroom | — | Left as it is (owner: "ignore"). Its plumbing and electrical points are now in the model (E12, E13). | Done (unchanged) |
| 4 | Pantry slab with storage instead of the cupboard by the lift | C8 | A 4'-11" (1.5 m) stone pantry counter with wall cupboards above, 10" (250 mm) clear of the lift door. It gets two counter sockets and an under-cupboard light. No sink. | Done |
| 5 | Revert the bathroom layout of bedroom 3 / kids room | C9 | The kids toilet returns beside the stair at its R0 size, on stack SS-3. The four R0 toilet dimensions pass again. | Done |
| 6 | Bath tub in the master washroom | C10 | A 5'-7" × 2'-6" (1.7 × 0.75 m) tub with an over-tub shower screen. | Done |
| 7 | Kitchen washing area: no outside construction allowed | B4 | The wash-yard walls, gate and back door are removed and GL-4 returns. A wash nook (double sink, drainer, cabinet) goes inside the kitchen on the north side, with an exhaust into the OTS. | Done |
| 8 | Mandir + store becomes a work table, sofa, settee (sethi) and TV for guests | B5 | Guest Lounge / Study: desk on the east wall, 2-seater sofa, TV on the west wall, settee with bolsters, coffee table and rug. | Done |
| 9 | A small mandir | B6 (revised) | First placed in the guest room's NE corner (red-line 2). **Revised:** the owner does not want a mandir in a bedroom. It now stands as a small open mandir on the family lounge's east wall at its NE corner, following the owner's reference photo. The devotee faces east, with no toilet behind or above it. The lift is on the west side, so the mandir is not beside it; the owner chose the NE corner. | Done |
| 10 | Storage beneath the stairs | B7 | Cupboards cut to the stair soffit, a low cupboard under the landing, and a ventilated inverter / battery / network rack. DB-1 moves to the kitchen east wall. | Done |
| 11 | Master: swap dresser and washroom, door on the dresser side | C10 | Washroom and dresser are swapped. The route is bedroom → dresser → washroom. The WC is on the OTS stack. | Done; **hold**: see red-line 11 |
| 12 | SF washing area: washing machine, ironing, utility and clothes drying on the terrace | D11 | An open utility outside the SF lobby door: washer-dryer, utility sink, ironing counter and tall cupboard. Two drying racks go under the polycarbonate roof, and the washing room becomes a store. | Done |
| — | Plumbing, electrical and wiring inputs shown in 3D | E12, E13 | Both are in the model, checked, and shown in the 3D tour under *Services: Plumbing / Electrical*. | Done |
| — | Tulsi (follow-up requests) | B15 | First placed in the front lawn's NE; **moved by the owner to the back garden**. It now stands in the back garden's north-east corner, against the east boundary wall just short of the deck. The devotee faces east and it is open to the sky. It follows the owner's reference photo: marble plinth, carved pedestal, brass diyas and bamboo planters. The fluted cladding with a brass Om goes on the existing boundary wall (no new construction). | Done; **warn**: SE zone of the plot (tulsi is usually N / NE / E), for the Vastu consultant |
| — | Materials (follow-up): tiles, pipes, wires, paint, POP, granite, timber, MDF board in wardrobes, lights | F16 | A quantity schedule for every item, measured from the model by `tools/boq.py`: Excel (`plans/r1/GH-18_R1_materials.xlsx`, one sheet per item plus rooms) and PDF. Living-area floors are given both ways: Italian marble or large-format tiles, for the owner to decide. MDF for wardrobes as asked; BWP ply only for wet units (vanities, sink base, utility, terrace). Kitchen and pantry counter tops become 20 mm black granite in the model. A *Materials & quantities* view in the 3D tour colours every surface by material and shows each room's quantities. | Done; floors: **owner to choose** A (marble) or B (tiles) |

## 2. Vastu red-line register (owner instruction to the architect, overlaid on R0)

| # | Space / zone | Red-line instruction | R1 | Status |
|---|---|---|---|---|
| 1 | GF entrance foyer, N | Keep the N entry; light-coloured main door; foyer bright and uncluttered | Foyer unchanged: shoe console, mirror and planter only. | Done |
| 2 | GF guest room, NE / ENE | No heavy wardrobe on the NE wall (put it on the S or W wall); puja niche preferred in the NE corner | Wardrobe on the south wall. The mandir was in the NE corner, but the owner moved it to the family lounge (owner item 9). | Done, differs (owner) |
| 3 | GF toilet, E / ESE | WC at the south (ESE) end, wash at the north end; soil stack aligned with the FF toilet; falls to a rear drain with chambers | WC at the south end. Its soil drains to IC-2 at the foot of stack SS-1 in the OTS, which also serves the FF toilet above. The drain runs to the front through chambers, not the rear (P3, P6). The vanity is still at the south end, as in R0. | Done, differs: vanity position for the architect |
| 4 | GF electrical panel, centre | Move the DB / panel out of the Brahmasthan, preferably to the SE (kitchen side) | DB-1 is in a 400 mm cabinet on the kitchen east wall, SE zone. The check confirms it is outside the centre ninth. | Done |
| 5 | GF rear lawn, S / SW | Tall trees / heavy planters on the S and SW boundary; no water body, bore well or soak pit | No pit, chamber, tank or pipe in the rear lawn (P1, P6). The tulsi stands in its NE corner (B15): a small planter, not a water body. Tree planting is not modelled. | Done; trees to landscape |
| 6 | GF front lawn, NE | RWH pit / water feature in the NE front lawn, 1.5 m clear of footings, overflow to the storm drain | The NE corner holds the 5000 L underground tank (water in the NE). The RWH pit is in the entrance court (north), 2.2 m from the tank as the plumbing sheet requires. Its overflow goes to the storm drain. | Done, differs: RWH north, not NE |
| 7 | GF kitchen, SE | Retain; hob on the SE wall (cook faces E); sink on the N side; grease trap before the drain | Hob on the east wall, so the cook faces east (checked). The sink is in the north wash nook (B4). Grease trap GT-1 is in the OTS. | Done |
| 8 | GF study, NW / NNW | Desk facing N or E; light colours; no heavy storage | Guest Lounge / Study: the desk faces east, and there is no tall storage. | Done |
| 9 | GF lift, W | Retain; vendor pit, shaft and overrun; check clashes with footings and drains | Lift kept. No drain runs under the lift. | Hold: lift vendor |
| 10 | GF OTS, E | Retain; structural design of the opening and trimmer beams | OTS kept. It now carries SS-1, DT-1, R-1, GT-1 and IC-2, and the bedroom-3 AC refrigerant pipe. | Hold: structural |
| 11 | FF master toilet, SE / SSE | No toilet–dresser swap; WC at the ESE end of the existing toilet, no slab cutting | **The owner chose the swap** (owner item 11, C10). The washroom now sits over the kitchen. It needs a new sunken floor, waterproofing with a flood test, and no exposed soil pipes in the kitchen ceiling (WC on SS-1 in the OTS). | Done, differs (owner); **hold**: architect + structural + plumber |
| 12 | FF dresser, ESE | Retain; mirror on the N or E wall | Dresser now in the old washroom zone (C10). Mirror and mirror light on the east wall. | Done |
| 13 | FF master bedroom, SW / S | Headboard on the S wall; wardrobes on the S / SW walls; check the stone floor load | Wardrobes on the south wall. The headboard is on the west wall, as the Electrical sheet (B2) also assumes. | Differs: headboard W vs S, for the Vastu consultant |
| 14 | FF centre toilet | Retain over the GF toilet; shared stack; vent to the terrace | Kept (now the bedroom-3 toilet). It shares SS-1, which is vented 1 m above the roof. | Done |
| 15 | FF toilet (bedroom 3), WNW | Retain; separate stack on the W side | Kept as the kids toilet (C9), on its own stack SS-3 in a boxed duct. | Done |
| 16 | FF front curved balcony, N / NW | Keep open; light planters only; cantilever and railing checks | In the model the front curve is the kids-room GL-9 glazing; there is no open balcony there. Nothing added. | Hold: architect to confirm the R0 front balcony |
| 17 | FF stair / lift, W | Retain; headroom and lift overrun at the terrace | Kept. The overrun is beside the SF roof tank. | Done; hold: lift vendor |
| 18 | FF rear balcony, SW | Retain; waterproofing, 1:100 slope, overflow spout | Kept, with weatherproof sockets and lights. Its outlet and spout are not modelled. | Done; spout to plumber |
| T | Terrace | Overhead tank on the SW / W on an RCC stand; open terrace on the N / NE; new rooms only in the S / SW; check pressure at the FF showers | The tank is on the SF roof, on the W side beside the lift overrun (checked). The front terrace (N / NE) is kept open; two AC outdoor units stand against the stair wall in its NW. Pressure is checked: fine for the FF; the SF washroom gets a small pump. The proposed SF rooms are in the centre and east, not the S / SW. | Differs: SF room zoning, for the Vastu consultant; hold: tank stand |

## 3. Plumbing Layout Rev A clouds

| Cloud | Rev A correction | R1 | Status |
|---|---|---|---|
| P1 | Rear lawn: SS-2, IC-1 and the grease trap moved inside the plot; RCP-1 removed | With the R1 layout none of these is needed. SS-2 is dropped because the master WC is on SS-1. The kitchen waste now drains north to GT-1 in the OTS. Nothing is in the rear lawn. | Done, differs (simpler) |
| P2 | Kitchen sink + dishwasher waste to a grease trap | Wash nook → GT-1 → IC-2, all in the OTS. | Done |
| P3 | Sewer under the GF toilet, lobby and foyer, sleeved, with sealed cleanouts CO-1 / CO-2; nothing under the guest room; R-1 in the E-wall chase | As Rev A. The check confirms nothing is under the guest room. R-1 runs in the east-wall chase above floor level. | Done |
| P4 | UGT in the NE front lawn, 2 m from the sewer and RWH; IC-3 to the front court; inlet does not cross the sewer | UGT 3.4 m from the sewer and 2.2 m from the RWH pit. IC-3 is in the entrance court. The inlet does not cross the sewer. | Done |
| P5 | No sewage to the storm drain; only IC-5 to the municipal sewer; heavy-duty covers in the parking | As Rev A. | Done; hold: RWA / MCG connection |
| P6 | Rear lawn: no pit or water body; terrace rain to the front | Four 100 mm RWPs on the front face run to the RWH pit. | Done |
| P7 | FF master toilet: geyser inside, cleanout on the WC run, access panel at the bath, DT-1 branch in a chase with a valve | Geyser inside on the east wall, 2 m from the shower. The cleanout, bath access panel and valve are not modelled. | Done; details to plumber |
| P8 | FF WNW toilet: SS-3 in a boxed internal duct | SS-3 is in a boxed duct, which also carries the guest-lounge AC refrigerant pipe. | Done |
| P9 / P10 | Front balcony RWP to RWH; rear balcony spout to the lawn | No front balcony in the model (see red-line 16). The rear balcony spout is not modelled. | Not modelled: plumber |
| Sheet 2 | Terrace plan: OHT, DT-1 / DT-2, vents, RWPs, solar | The OHT and solar heater are on the SF roof (D11). DT-1, DT-2 and the vents are modelled. | Done, differs (SF built) |
| Sheet 3 | UGT about 5–6 days' storage | 5000 L UGT. | Done |

## 4. Electrical Layout Rev A clouds

| Cloud | Rev A change | R1 | Status |
|---|---|---|---|
| A1 | Rear lawn: IP65 socket, irrigation pump point, rear CCTV, ODU for the drawing-room AC | IP65 socket, pump point and CCTV are in. The lounge AC's outdoor unit goes on the back terrace (up the balcony west wall), so there is no equipment in the rear lawn. | Done, differs |
| A2 | Drawing / dining: TV and AC on the W wall; pendant; 2-way switches at both ends; smoke detector | All in place in the Family Lounge (B3). | Done |
| A3 | Kitchen: hob / chimney on the E wall; EF to the rear wall; fridge and DW points; heat detector; DB-1 in the SE | All in place. A second EF goes in the wash nook, into the OTS (B4). | Done |
| A4 | GF toilet: EF on the OTS wall; socket away from the basin; switchboard outside | All in place. The socket is 0.68 m from the basin. | Done |
| A5 | Lobby: DB-1 out of the centre; 2-way stair switching; inverter + rack in the panel room; smoke detector | Inverter and rack go under the stair (B7). Everything else as Rev A. | Done |
| A6 | Guest room: TV on the W wall; AC on the N wall with a front-lawn ODU; bedside points both sides | As Rev A. The AC sits above GL-1 at 8'-0" (2.45 m). | Done; **warn**: the outdoor unit is in the NE zone, for the Vastu consultant |
| A7 | Study: desk sockets, data and UPS on the E wall | In the Guest Lounge / Study, plus a TV point (B5). | Done |
| A8 | Gate lights and outdoor VDP | Done. | Done |
| B1 / B9 | Balconies: IP65 sockets | Two on the rear balcony. | Done |
| B2 | Master bedroom: AC off the glazed wall to the W wall; sockets / USB and 2-way both sides; smoke detector | All in place. The AC pipe goes straight up to the back terrace. | Done |
| B3 / B4 | Master toilet: switchboard outside, geyser out of the splash zone; dresser mirror light; DB-2 stacked over DB-1 | The switchboard is at the dresser door, because wardrobes flank the washroom door. Geyser and mirror light as Rev A. **DB-2 moves** to the dresser's west wall (still SE): the washroom (C10) is now the space above DB-1. | Done, differs |
| B5 | Centre toilet: EF on the OTS wall; mirror light; switchboard outside in the lobby | The door now opens from bedroom 3, so the switchboard is in the bedroom niche by the door. | Done, differs |
| B6 | Bedroom 2: ODU route to confirm (possible party wall) | The east wall is a party wall, so the refrigerant runs through the toilet ceiling and the OTS to the back terrace's SE corner (14.3 m). | Done |
| B7 | WNW toilet: EF and geyser swapped, EF on the external W wall | The W wall is the GH-19 party wall, so the EF becomes a ceiling fan ducted up to the open front terrace. The geyser is on the inner wall. | Done, differs |
| B8 | Bedroom 3: sockets and 2-way both sides; smoke detector | Done (now the kids room). The kids AC's outdoor unit is on the NW of the front terrace. | Done |
| Sheet 2 | Point schedule, circuits, about 41 kW load | Every sheet row is met or exceeded, room by room. 43 circuits within the sheet's limits. 45.9 kW connected and about 25 kW demand, so a 3-phase supply. | Done; hold: load sanction |

## 5. Open items and hold points

| Item | For | Notes |
|---|---|---|
| Master washroom over the kitchen (C10, red-line 11) | Architect, structural, plumber | New sunken floor, waterproofing, flood test; SS-2 not needed |
| Tulsi in the back garden: the SE zone of the plot (B15) | Vastu consultant | The owner's choice; it sits at the garden's NE corner and the devotee faces east |
| Guest-room AC outdoor unit in the NE (A6) | Vastu consultant | The sheet's own choice. The alternative is a longer run to the terrace. |
| DB-3 in the E zone (SF) | Vastu consultant | The SF has no indoor SE space |
| Master headboard W vs red-line S (13) | Vastu consultant | The Electrical sheet assumes W |
| SF rooms not in the S / SW (red-line T) | Vastu consultant, architect | The SF is a proposal (not on R0) |
| Deck pergola under "no outside construction" | Owner | Kept for now |
| Tank stand on the SF roof, OTS opening, lift pit and overrun, balconies | Structural, lift vendor | |
| Sewer invert levels and the municipal connection | Plumber, RWA / MCG | |
| Front curved balcony (red-line 16, P9) | Architect | Not in the model; the kids-room glazing forms the curve |
| GF toilet vanity at the south end (red-line 3) | Architect | R0 position kept |
| Cleanouts, valves, balcony spouts, condensate drains | Plumber | Not modelled |
| Cable sizes, load sanction, testing | Electrical contractor | Design intent only |
| Vastu re-check of R1 before freeze | Vastu consultant | `services_report.txt` → VASTU PLACEMENTS lists what is checked automatically |
