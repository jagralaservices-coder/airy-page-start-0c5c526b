# Production Readiness Test Plan

Scope: validate operational stability of the Offline-First stack (Phases 1–3) against real workflows. No new architecture. Goal is to surface production bugs, not add features.

---

## 0. Test Environment

| Item | Setup |
|---|---|
| Devices | 2 desktops (Chrome + Safari), 1 tablet (iPad Safari), 1 Android phone (Chrome) |
| Network | Wi-Fi, 4G throttled (Fast 3G in devtools), Offline (DevTools "Offline") |
| Accounts | 1 owner, 1 store_manager, 2 cashiers across 2 stores under the same merchant |
| Data baseline | Seed 50 menu items, 20 customers, 10 inventory products, 5 historical orders per store |
| Observability | SyncQueuePanel open on each device; Supabase logs tail on `sync-store-data`; browser console captured |

Pass criteria for every scenario: no data loss, no duplicate writes, queue drains to 0, health badge returns to **Healthy**, no `metadata_version_conflict` left unresolved in `idb.conflicts` after reconciliation.

---

## 1. Functional Workflows

### 1.1 Billing
- B1: Ring up cash sale, 3 line items, apply discount, finalize → order appears on second device within 2s via realtime.
- B2: Split payment (cash + card), print receipt, void one line before finalize.
- B3: Refund a finalized order; verify ledger entry and stock reversal.
- B4: Finalize sale while offline → queued; reconnect → single order row server-side (no dup).

### 1.2 QR Orders
- Q1: Customer scans table QR, places order from phone; POS receives within 3s.
- Q2: Two customers submit QR orders for the same table simultaneously → both land, no overwrite.
- Q3: QR order placed while POS is offline → POS picks it up on reconnect.

### 1.3 Inventory
- I1: Adjust stock on Device A; Device B sees new qty via realtime.
- I2: Concurrent stock edit on A (offline) and B (online) for same SKU → on reconnect, conflict logged, last-writer-with-higher-version wins, loser surfaced in panel.
- I3: Receive PO of 100 units, sell 5, verify on-hand = 95.

### 1.4 Menu Updates
- M1: Edit price on Device A → reflected on B's POS and QR menu within 3s.
- M2: Toggle item availability offline → queued → applied on reconnect.
- M3: Bulk import 200 menu items → batch upserts in chunks of 50, queue drains < 30s.

### 1.5 Customer Creation
- C1: Create customer at POS; appears in customer list on other device.
- C2: Same phone number entered on two devices within 5s → dedup behavior verified (expected: two rows with distinct ids, merge tool surfaces duplicate).
- C3: Edit customer name offline; reconnect; verify name persisted, version_number incremented.

### 1.6 Reports
- R1: Daily sales report matches sum of orders for the day across devices.
- R2: Run report immediately after offline reconnect → values stabilize once queue drains; no partial totals reported as final.
- R3: Multi-store report aggregates correctly; switching store filter does not leak data.

### 1.7 Credit Workflows
- CR1: Sell on credit to customer with available limit → ledger debit recorded.
- CR2: Customer pays down balance → credit ledger entry, customer balance updates on all devices.
- CR3: Attempt credit sale exceeding limit → blocked with clear error.
- CR4: Offline credit sale → queued; on reconnect, balance reconciles correctly even if another device also posted a payment in the interim.

---

## 2. Multi-Store / Multi-Device / Multi-User

### 2.1 Multi-Store
- S1: User with access to Store A and Store B switches stores → realtime channels rebind, no Store A rows leak into Store B view.
- S2: Cashier scoped to Store A cannot see Store B data (RLS check).
- S3: Owner edits menu in Store A → no propagation to Store B menu.

### 2.2 Multi-Device
- D1: 4 devices logged into same store, simultaneous edits across orders, menu, inventory → all converge within 5s, no duplicates.
- D2: Device clock skew (±5 min) on one device → version_number ordering still wins; updated_at skew does not corrupt sort.

### 2.3 Multi-User
- U1: Two cashiers edit the same customer record within the same second → one accepted, other receives `metadata_version_conflict`, conflict logged, user prompted to retry with fresh data.
- U2: Manager voids a cashier's order mid-edit → cashier UI reflects voided state on next sync tick.

---

## 3. Offline / Reconnect / Restart

### 3.1 Offline Mode
- O1: Go offline, perform 20 mixed ops (orders, menu edits, customer creates, inventory adjusts) → all queued, IDB intact, UI responsive.
- O2: Offline for 1 hour, then reconnect → full drain, zero data loss, conflicts (if any) surfaced.
- O3: Offline indicator visible and accurate within 2s of network change.

### 3.2 Reconnect Scenarios
- RC1: Flap network (offline → online → offline → online within 10s) → no duplicate writes, queue idempotent.
- RC2: Reconnect while sync mid-batch → batch resumes without dup or skip.
- RC3: Realtime channel drops and reconnects → coalesced sync fires once, not per event.

### 3.3 Store Switching
- SW1: Switch store while queue has pending items for previous store → items still drain to correct store, new store channels bind cleanly.
- SW2: Rapid store switch (3 toggles in 5s) → no channel leaks, no cross-store data shown.

### 3.4 Browser Refresh
- BR1: Hard refresh (Cmd+Shift+R) with 10 queued items → queue persists, drains after reload.
- BR2: Refresh mid-sync → no partial-state corruption; queue items either acked or retried.

### 3.5 Browser Restart
- BS1: Quit browser with pending queue, relaunch 10 min later → queue intact, drains on reconnect.
- BS2: Quit browser offline, relaunch offline, perform more ops, reconnect → all ops in order, no loss.

### 3.6 Multi-Tab
- MT1: Open POS in 2 tabs same store → both subscribe, edits in tab A appear in tab B, queue not duplicated.
- MT2: Close one tab mid-sync → other tab continues drain.

---

## 4. Performance & Stability

- P1: 1000-order backfill pull → completes < 60s, UI remains responsive, IDB write-skipping > 50% on re-pull.
- P2: 200-item menu bulk update → batched upserts ≤ 4 round trips.
- P3: 24-hour soak on one device with periodic activity → no memory growth > 150MB, no zombie channels, health badge stays Healthy.
- P4: SyncQueuePanel metrics (throughput, conflicts, skipped writes) match expected counts within ±2%.

---

## 5. Regression Gates

Block release if any of the following occur:
1. Any order, payment, or credit ledger entry is lost or duplicated.
2. Cross-store data leakage in UI or API response.
3. Queue stuck > 5 min with network healthy.
4. Unresolved `metadata_version_conflict` not surfaced in UI.
5. Health badge stays **Unhealthy** > 2 min after reconnect.
6. Realtime channel fails to rebind on store switch.

---

## 6. Execution & Reporting

1. Run sections 1–4 across the device matrix; each scenario logged as Pass / Fail / Blocked with evidence (screenshot, console excerpt, queue snapshot).
2. File every Fail as a production bug with: scenario id, device, repro steps, expected vs actual, queue + conflict state.
3. Re-run failed scenarios after each fix; track in a Validation Tracker.
4. Deliver **Production Validation Report** when all P0/P1 scenarios pass and gates in §5 are clear.

No new features or architecture work until the report is signed off.
