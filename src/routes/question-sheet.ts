// Question Sheet — Event Briefing Form (printable) — BW Productions v2

import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { layout } from '../lib/layout.js'
import type { AuthUser } from '../lib/auth.js'

type Env = { Bindings: { DB: D1Database }; Variables: { user: AuthUser } }

const questionSheet = new Hono<Env>()
questionSheet.use('*', requireAuth)

questionSheet.get('/', async (c) => {
  const user = c.get('user')

  // Fetch clients and suppliers for dropdowns
  const [clients, suppliers] = await Promise.all([
    c.env.DB.prepare('SELECT id, name FROM clients WHERE active=1 ORDER BY name').all<any>(),
    c.env.DB.prepare('SELECT id, name FROM suppliers WHERE active=1 ORDER BY name').all<any>(),
  ])

  const clientOpts = clients.results.map((cl: any) =>
    `<option value="${cl.id}">${cl.name}</option>`
  ).join('')

  const supplierOpts = suppliers.results.map((s: any) =>
    `<option value="${s.id}">${s.name}</option>`
  ).join('')

  const body = `
    <!-- PRINT TOOLBAR (screen only) -->
    <div class="no-print" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">
      <div>
        <div style="font-size:13px;color:var(--muted)">Complete this form before every event brief · Print or save as PDF for the file</div>
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="clearForm()" class="btn btn-outline btn-sm">
          <i class="fas fa-rotate-left"></i> Clear
        </button>
        <button onclick="window.print()" class="btn btn-gold">
          <i class="fas fa-print"></i> Print / Save PDF
        </button>
      </div>
    </div>

    <div id="qs-form">

    <!-- ══════════════════════════════════════════
         HEADER (print letterhead)
    ══════════════════════════════════════════ -->
    <div class="print-header no-screen" style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #C9A84C">
      <div style="font-family:'Georgia',serif;font-size:28px;font-weight:900;color:#C9A84C;letter-spacing:0.08em">BW PRODUCTIONS</div>
      <div style="font-size:11px;letter-spacing:0.18em;color:#555;text-transform:uppercase;margin-top:4px">Event Question & Briefing Sheet · Confidential · Internal Use Only</div>
    </div>

    <!-- SECTION 1 — EVENT DETAILS -->
    <div class="qs-section">
      <div class="qs-section-title">
        <span class="qs-num">1</span> Event Details
      </div>
      <div class="qs-grid qs-grid-3">
        <div class="qs-field full">
          <label>Event / Job Name *</label>
          <input type="text" name="event_name" placeholder="e.g. SAB Castle Lite Activation — Soweto">
        </div>
        <div class="qs-field">
          <label>Client</label>
          <input type="text" name="client_name" placeholder="Client name" list="client-list">
          <datalist id="client-list">
            ${clientOpts.replace(/<option value="[^"]*">/g, '<option value="').replace(/<\/option>/g, '">')}
          </datalist>
        </div>
        <div class="qs-field">
          <label>Client Contact Person</label>
          <input type="text" name="client_contact" placeholder="Full name">
        </div>
        <div class="qs-field">
          <label>Client Contact Number</label>
          <input type="tel" name="client_phone" placeholder="082 000 0000">
        </div>
        <div class="qs-field">
          <label>Event Date</label>
          <input type="date" name="event_date">
        </div>
        <div class="qs-field">
          <label>Setup Date</label>
          <input type="date" name="setup_date">
        </div>
        <div class="qs-field">
          <label>Strike / Breakdown Date</label>
          <input type="date" name="strike_date">
        </div>
        <div class="qs-field">
          <label>Event Start Time</label>
          <input type="time" name="start_time">
        </div>
        <div class="qs-field">
          <label>Event End Time</label>
          <input type="time" name="end_time">
        </div>
      </div>
    </div>

    <!-- SECTION 2 — VENUE -->
    <div class="qs-section">
      <div class="qs-section-title">
        <span class="qs-num">2</span> Venue & Location
      </div>
      <div class="qs-grid qs-grid-3">
        <div class="qs-field full">
          <label>Venue Name *</label>
          <input type="text" name="venue" placeholder="e.g. Wanderers Club, Constitution Hill, etc.">
        </div>
        <div class="qs-field full">
          <label>Full Address</label>
          <input type="text" name="venue_address" placeholder="Street address, suburb, city">
        </div>
        <div class="qs-field">
          <label>City / Town</label>
          <input type="text" name="venue_city" placeholder="e.g. Johannesburg">
        </div>
        <div class="qs-field">
          <label>GPS Coordinates / Plus Code</label>
          <input type="text" name="venue_gps" placeholder="-26.2041, 28.0473 or 4FRW+2R JHB">
        </div>
        <div class="qs-field">
          <label>Venue Contact (On-site)</label>
          <input type="text" name="venue_contact" placeholder="Name & number">
        </div>
        <div class="qs-field">
          <label>Access / Gate Hours</label>
          <input type="text" name="access_hours" placeholder="e.g. From 06:00, access code: 1234">
        </div>
        <div class="qs-field">
          <label>Loading Bay Available?</label>
          <select name="loading_bay">
            <option value="">— Select —</option>
            <option>Yes — dedicated bay</option>
            <option>Yes — shared</option>
            <option>No — street offload</option>
            <option>No — manual carry only</option>
          </select>
        </div>
        <div class="qs-field">
          <label>Floor Surface</label>
          <select name="floor_surface">
            <option value="">— Select —</option>
            <option>Concrete / Paving</option>
            <option>Grass / Lawn</option>
            <option>Gravel</option>
            <option>Wood / Parquet</option>
            <option>Mixed</option>
          </select>
        </div>
        <div class="qs-field">
          <label>Parking for Crew?</label>
          <select name="crew_parking">
            <option value="">— Select —</option>
            <option>Yes — free</option>
            <option>Yes — paid</option>
            <option>No</option>
          </select>
        </div>
      </div>
      <div class="qs-grid qs-grid-1" style="margin-top:10px">
        <div class="qs-field">
          <label>Venue Notes / Access Restrictions</label>
          <textarea name="venue_notes" rows="2" placeholder="Height restrictions, no-go zones, forklift availability, weight limits on floors, etc."></textarea>
        </div>
      </div>
    </div>

    <!-- SECTION 3 — PAX & SCALE -->
    <div class="qs-section">
      <div class="qs-section-title">
        <span class="qs-num">3</span> Scale & Pax
      </div>
      <div class="qs-grid qs-grid-3">
        <div class="qs-field">
          <label>Expected Pax (Guests)</label>
          <input type="number" name="pax" placeholder="e.g. 500" min="1">
        </div>
        <div class="qs-field">
          <label>Pax (Staff / Crew)</label>
          <input type="number" name="pax_crew" placeholder="e.g. 20">
        </div>
        <div class="qs-field">
          <label>VIP / Hospitality Guests?</label>
          <select name="has_vip">
            <option value="">— Select —</option>
            <option>Yes</option>
            <option>No</option>
          </select>
        </div>
        <div class="qs-field">
          <label>Is this a SAB Event?</label>
          <select name="is_sab">
            <option value="">— Select —</option>
            <option>Yes</option>
            <option>No</option>
          </select>
        </div>
        <div class="qs-field">
          <label>Estimated Pallets / Payload</label>
          <input type="text" name="pallets" placeholder="e.g. 8 pallets, ~4 tons">
        </div>
        <div class="qs-field">
          <label>Suggested Load Class</label>
          <select name="load_class">
            <option value="">— Auto / TBC —</option>
            <option>L1 — Bakkie / 1-ton</option>
            <option>L2 — ~4-ton truck</option>
            <option>L3 — 8-ton truck</option>
            <option>L4 — 14-ton / 10-ton</option>
          </select>
        </div>
      </div>
    </div>

    <!-- SECTION 4 — FLEET & LOGISTICS -->
    <div class="qs-section">
      <div class="qs-section-title">
        <span class="qs-num">4</span> Fleet & Logistics
      </div>
      <div class="qs-grid qs-grid-3">
        <div class="qs-field">
          <label>Vehicles Required</label>
          <input type="text" name="vehicles_required" placeholder="e.g. 1× bakkie, 1× 4t, 1× 8t">
        </div>
        <div class="qs-field">
          <label>Driver Requirements</label>
          <input type="text" name="driver_req" placeholder="e.g. Code 10 + PDP required">
        </div>
        <div class="qs-field">
          <label>Dispatch Point</label>
          <input type="text" name="dispatch_point" placeholder="e.g. Randvaal Warehouse, 05:30">
        </div>
        <div class="qs-field">
          <label>Return Trip?</label>
          <select name="return_trip">
            <option value="">— Select —</option>
            <option>Yes — same day</option>
            <option>Yes — next day</option>
            <option>No — one-way</option>
            <option>Multi-day — crew stays over</option>
          </select>
        </div>
        <div class="qs-field">
          <label>Estimated Distance (one-way km)</label>
          <input type="number" name="distance_km" placeholder="e.g. 45">
        </div>
        <div class="qs-field">
          <label>Isuzu KB 250 Can Sign-Off?</label>
          <select name="suzu_baki_signoff">
            <option value="">— Select —</option>
            <option>Yes — Isuzu KB 250 1-ton can sign off this load</option>
            <option>No — requires heavier vehicle</option>
            <option>N/A</option>
          </select>
        </div>
      </div>
      <div class="qs-grid qs-grid-1" style="margin-top:10px">
        <div class="qs-field">
          <label>Special Logistics Notes</label>
          <textarea name="logistics_notes" rows="2" placeholder="Offloading requirements, special handling, refrigerated items, hazmat, etc."></textarea>
        </div>
      </div>
    </div>

    <!-- SECTION 5 — EQUIPMENT & STRUCTURES -->
    <div class="qs-section">
      <div class="qs-section-title">
        <span class="qs-num">5</span> Equipment & Structures Required
      </div>
      <div class="qs-grid qs-grid-3">
        <div class="qs-field">
          <label>Marquees / Tents</label>
          <input type="text" name="eq_marquees" placeholder="e.g. 2× 6×6m, 1× 10×5m">
        </div>
        <div class="qs-field">
          <label>Staging / Stage</label>
          <input type="text" name="eq_staging" placeholder="e.g. 6×4m @ 600mm high">
        </div>
        <div class="qs-field">
          <label>Fencing (LM)</label>
          <input type="text" name="eq_fencing" placeholder="e.g. 200m Mojo fencing">
        </div>
        <div class="qs-field">
          <label>Tables</label>
          <input type="text" name="eq_tables" placeholder="e.g. 20× round + 10× trestle">
        </div>
        <div class="qs-field">
          <label>Chairs</label>
          <input type="text" name="eq_chairs" placeholder="e.g. 200× banquet">
        </div>
        <div class="qs-field">
          <label>Power (kVA)</label>
          <input type="text" name="eq_power" placeholder="e.g. 2× 60kVA generators">
        </div>
        <div class="qs-field">
          <label>Cooling / Chillers</label>
          <input type="text" name="eq_cooling" placeholder="e.g. 4× industrial fans, 1× chiller unit">
        </div>
        <div class="qs-field">
          <label>Branding / Signage</label>
          <input type="text" name="eq_branding" placeholder="e.g. Backdrops, tensabarriers, banners">
        </div>
        <div class="qs-field">
          <label>Toilets / Ablutions</label>
          <input type="text" name="eq_toilets" placeholder="e.g. 4× portable units">
        </div>
      </div>
      <div class="qs-grid qs-grid-1" style="margin-top:10px">
        <div class="qs-field">
          <label>Other Equipment / Special Items</label>
          <textarea name="eq_other" rows="2" placeholder="Bar units, POS stations, branded ice buckets, LED walls, generators, etc."></textarea>
        </div>
      </div>
    </div>

    <!-- SECTION 6 — SUPPLIERS -->
    <div class="qs-section">
      <div class="qs-section-title">
        <span class="qs-num">6</span> Suppliers & Sub-Contractors
      </div>
      <div class="qs-grid qs-grid-1">
        <div class="qs-field">
          <label>Primary Supplier (Structures / Equip)</label>
          <input type="text" name="supplier_primary" placeholder="e.g. Events Guys — Gary 082 555 1001" list="supplier-list">
          <datalist id="supplier-list">
            ${supplierOpts.replace(/<option value="[^"]*">/g, '<option value="').replace(/<\/option>/g, '">')}
          </datalist>
        </div>
      </div>
      <div class="qs-grid qs-grid-3" style="margin-top:10px">
        <div class="qs-field">
          <label>Labour Supplier</label>
          <input type="text" name="supplier_labour" placeholder="e.g. Pro Staffing SA">
        </div>
        <div class="qs-field">
          <label>Branding / Print Supplier</label>
          <input type="text" name="supplier_branding" placeholder="e.g. Inkredible Print">
        </div>
        <div class="qs-field">
          <label>Power Supplier</label>
          <input type="text" name="supplier_power" placeholder="e.g. PowerGen SA">
        </div>
        <div class="qs-field">
          <label>Cooling Supplier</label>
          <input type="text" name="supplier_cooling" placeholder="e.g. CoolZone Rentals">
        </div>
        <div class="qs-field">
          <label>Fencing Supplier</label>
          <input type="text" name="supplier_fencing" placeholder="e.g. Rapid Fencing">
        </div>
        <div class="qs-field">
          <label>Other Supplier</label>
          <input type="text" name="supplier_other" placeholder="Name + contact">
        </div>
      </div>
    </div>

    <!-- SECTION 7 — STAFFING & LABOUR -->
    <div class="qs-section">
      <div class="qs-section-title">
        <span class="qs-num">7</span> Staffing & Labour
      </div>
      <div class="qs-grid qs-grid-3">
        <div class="qs-field">
          <label>Setup Crew Required</label>
          <input type="text" name="crew_setup" placeholder="e.g. 8 general workers, 2 riggers">
        </div>
        <div class="qs-field">
          <label>Event Day Crew</label>
          <input type="text" name="crew_event" placeholder="e.g. 4 floor staff, 2 bar staff">
        </div>
        <div class="qs-field">
          <label>Strike Crew</label>
          <input type="text" name="crew_strike" placeholder="e.g. 6 general workers">
        </div>
        <div class="qs-field">
          <label>BW Site Manager</label>
          <input type="text" name="bw_site_manager" placeholder="Who is on-site lead?">
        </div>
        <div class="qs-field">
          <label>Client On-Site Rep</label>
          <input type="text" name="client_site_rep" placeholder="Client's event manager name">
        </div>
        <div class="qs-field">
          <label>Security Required?</label>
          <select name="security_required">
            <option value="">— Select —</option>
            <option>Yes — client's own</option>
            <option>Yes — BW to arrange</option>
            <option>No</option>
          </select>
        </div>
      </div>
    </div>

    <!-- SECTION 8 — VOUCHERS & FINANCIALS -->
    <div class="qs-section" style="border-color:rgba(239,68,68,0.25)">
      <div class="qs-section-title" style="color:#f87171">
        <span class="qs-num" style="background:#ef4444">8</span> Vouchers & Financials
        <span class="qs-badge-closed">VOUCHERS CLOSED</span>
      </div>
      <div class="qs-closed-notice">
        <i class="fas fa-ban" style="font-size:16px;flex-shrink:0"></i>
        <div>
          <strong>Voucher system is closed.</strong> No new vouchers are to be issued, processed or accepted for this event or any event. All spend is to be pre-approved and invoiced through the standard supplier process. Queries: Finance Director.
        </div>
      </div>
      <div class="qs-grid qs-grid-3" style="margin-top:14px">
        <div class="qs-field">
          <label>Quoted Budget (Excl. VAT)</label>
          <input type="text" name="budget_quoted" placeholder="R — from quote">
        </div>
        <div class="qs-field">
          <label>Approved PO Number</label>
          <input type="text" name="po_number" placeholder="PO or order reference">
        </div>
        <div class="qs-field">
          <label>Payment Terms</label>
          <select name="payment_terms">
            <option value="">— Select —</option>
            <option>30 days from invoice</option>
            <option>60 days from invoice</option>
            <option>Prepayment required</option>
            <option>50% deposit + balance on delivery</option>
          </select>
        </div>
        <div class="qs-field">
          <label>Deposit Received?</label>
          <select name="deposit_received">
            <option value="">— Select —</option>
            <option>Yes — full prepayment</option>
            <option>Yes — 50% deposit</option>
            <option>No — 30-day terms</option>
            <option>No — awaiting PO</option>
          </select>
        </div>
        <div class="qs-field">
          <label>Invoice Reference</label>
          <input type="text" name="invoice_ref" placeholder="BW-INV-XXXX">
        </div>
        <div class="qs-field">
          <label>Quote Reference</label>
          <input type="text" name="quote_ref" placeholder="BW-Q-XXXX">
        </div>
      </div>
    </div>

    <!-- SECTION 9 — SIGN-OFF -->
    <div class="qs-section">
      <div class="qs-section-title">
        <span class="qs-num">9</span> Briefing Sign-Off
      </div>
      <div class="qs-grid qs-grid-3">
        <div class="qs-field">
          <label>Brief Completed By</label>
          <input type="text" name="brief_by" placeholder="Full name">
        </div>
        <div class="qs-field">
          <label>Date of Brief</label>
          <input type="date" name="brief_date">
        </div>
        <div class="qs-field">
          <label>Signed Off By (Ops)</label>
          <input type="text" name="signoff_ops" placeholder="Brian (Sipho) Ndlovu">
        </div>
        <div class="qs-field">
          <label>Signed Off By (Accounts)</label>
          <input type="text" name="signoff_accounts" placeholder="Name">
        </div>
        <div class="qs-field">
          <label>Quote Approved By Client?</label>
          <select name="quote_approved">
            <option value="">— Select —</option>
            <option>Yes — verbal</option>
            <option>Yes — written</option>
            <option>No — pending</option>
          </select>
        </div>
        <div class="qs-field">
          <label>Brief Version</label>
          <input type="text" name="brief_version" placeholder="e.g. v1 · v2 · Final">
        </div>
      </div>
      <div class="qs-grid qs-grid-1" style="margin-top:10px">
        <div class="qs-field">
          <label>Additional Notes / Open Items</label>
          <textarea name="additional_notes" rows="3" placeholder="Anything outstanding, special instructions, client requests, team callouts…"></textarea>
        </div>
      </div>

      <!-- SIGNATURE BLOCKS (print) -->
      <div class="sig-row no-screen">
        <div class="sig-block">
          <div class="sig-line"></div>
          <div class="sig-label">Signed: BW Ops Director (Brian/Sipho)</div>
          <div class="sig-label">Date: _______________________</div>
        </div>
        <div class="sig-block">
          <div class="sig-line"></div>
          <div class="sig-label">Signed: Client Representative</div>
          <div class="sig-label">Date: _______________________</div>
        </div>
        <div class="sig-block">
          <div class="sig-line"></div>
          <div class="sig-label">Signed: BW Finance</div>
          <div class="sig-label">Date: _______________________</div>
        </div>
      </div>
    </div>

    </div><!-- /qs-form -->

    <style>
      /* ── QUESTION SHEET LAYOUT ── */
      .qs-section {
        background: var(--navy-card);
        border: 1px solid var(--navy-border);
        border-radius: 12px;
        padding: 20px 22px;
        margin-bottom: 18px;
      }
      .qs-section-title {
        font-family: 'Cinzel', serif;
        font-size: 13px;
        font-weight: 700;
        color: var(--gold-lt);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .qs-num {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px; height: 22px;
        background: linear-gradient(135deg, var(--gold-dk), var(--gold));
        color: #000;
        border-radius: 50%;
        font-size: 11px;
        font-weight: 800;
        font-family: 'Inter', sans-serif;
        flex-shrink: 0;
      }
      .qs-badge-closed {
        margin-left: auto;
        background: rgba(239,68,68,0.15);
        color: #f87171;
        border: 1px solid rgba(239,68,68,0.4);
        border-radius: 20px;
        font-size: 10px;
        font-weight: 800;
        padding: 2px 10px;
        letter-spacing: 0.06em;
        font-family: 'Inter', sans-serif;
      }
      .qs-closed-notice {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        background: rgba(239,68,68,0.08);
        border: 1px solid rgba(239,68,68,0.25);
        border-radius: 8px;
        padding: 14px 16px;
        color: #fca5a5;
        font-size: 13px;
        line-height: 1.6;
      }
      .qs-grid {
        display: grid;
        gap: 12px 16px;
      }
      .qs-grid-3 { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
      .qs-grid-1 { grid-template-columns: 1fr; }
      .qs-field { display: flex; flex-direction: column; gap: 5px; }
      .qs-field.full { grid-column: 1 / -1; }
      .qs-field label {
        font-size: 10px;
        font-weight: 700;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .qs-field input,
      .qs-field select,
      .qs-field textarea {
        background: var(--navy);
        border: 1px solid var(--navy-border);
        border-radius: 7px;
        padding: 8px 11px;
        color: var(--white);
        font-family: 'Inter', sans-serif;
        font-size: 13px;
        transition: border-color 0.15s;
        width: 100%;
      }
      .qs-field input:focus,
      .qs-field select:focus,
      .qs-field textarea:focus {
        outline: none;
        border-color: var(--gold);
        box-shadow: 0 0 0 2px rgba(201,168,76,0.1);
      }
      .qs-field select option { background: #161b22; }
      .qs-field textarea { resize: vertical; }

      /* ── SIGNATURE BLOCKS (screen only — shown in print mode) ── */
      .sig-row {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 24px;
        margin-top: 32px;
        padding-top: 16px;
        border-top: 1px solid var(--navy-border);
      }
      .sig-block { display: flex; flex-direction: column; gap: 8px; }
      .sig-line {
        height: 1px;
        background: #555;
        margin-bottom: 6px;
        margin-top: 32px;
      }
      .sig-label { font-size: 11px; color: #888; }

      /* ── PRINT MEDIA ── */
      @media print {
        .no-print { display: none !important; }
        .sidebar, .topbar, .main > .topbar { display: none !important; }
        .main { margin-left: 0 !important; }
        .content { padding: 0 !important; }
        body { background: #fff !important; color: #111 !important; font-size: 11px !important; }
        .qs-section {
          background: #fff !important;
          border: 1px solid #ccc !important;
          border-radius: 4px !important;
          page-break-inside: avoid;
          padding: 12px 14px !important;
          margin-bottom: 10px !important;
        }
        .qs-section-title { color: #333 !important; font-size: 11px !important; border-bottom: 1px solid #C9A84C; padding-bottom: 6px; margin-bottom: 10px !important; }
        .qs-num { background: #C9A84C !important; color: #000 !important; }
        .qs-field input, .qs-field select, .qs-field textarea {
          background: #fff !important;
          border: 1px solid #bbb !important;
          color: #111 !important;
          font-size: 11px !important;
          padding: 5px 8px !important;
          border-radius: 3px !important;
        }
        .qs-field label { color: #555 !important; font-size: 9px !important; }
        .qs-closed-notice { background: #fff3f3 !important; border-color: #f87171 !important; color: #b91c1c !important; font-size: 11px !important; }
        .qs-badge-closed { background: #fee2e2 !important; color: #b91c1c !important; border-color: #f87171 !important; }
        .no-screen { display: block !important; }
        .print-header { display: block !important; }
        .sig-row { display: grid !important; }
        .sig-line { background: #333 !important; }
        .sig-label { color: #555 !important; }
        .stat-card, .card { box-shadow: none !important; }
      }
      @media screen { .no-screen { display: none !important; } }
    </style>

    <script>
      function clearForm() {
        if (!confirm('Clear all fields and start fresh?')) return
        document.querySelectorAll('#qs-form input, #qs-form select, #qs-form textarea').forEach(el => {
          if (el.type === 'checkbox') el.checked = false
          else el.value = ''
        })
      }

      // Auto-set brief date to today
      const briefDate = document.querySelector('input[name="brief_date"]')
      if (briefDate && !briefDate.value) {
        const today = new Date().toISOString().split('T')[0]
        briefDate.value = today
      }

      // Pre-fill signed-off by Brian (Sipho) as default ops sign-off
      const signoffOps = document.querySelector('input[name="signoff_ops"]')
      if (signoffOps && !signoffOps.value) {
        signoffOps.value = 'Brian (Sipho) Ndlovu'
      }
    </script>
  `

  return c.html(layout('Event Question Sheet', body, user, 'question-sheet'))
})

export default questionSheet
