
# AI-Powered Staff Checklist Management System

A production feature for MAXORA POS that lets Owners/Admins build checklists, assign them to staff, and use AI Vision (via Lovable AI Gateway with `google/gemini-2.5-pro`) to verify staff selfies against owner-uploaded uniform references. Integrates cleanly with existing Auth, Merchant, Store, Staff, and Attendance modules — nothing existing is removed or modified beyond additive routes/menu entries.

## Scope

Build in **one implementation** across three layers: database + storage + RLS, edge functions for AI verification and notifications, and the full React UI for Owner and Staff.

## 1. Database (single migration)

New tables in `public` (all with GRANTs + RLS + policies + `updated_at` triggers):

- `checklists` — `merchant_id`, `store_id`, name, description, department, frequency (`daily|weekly|monthly|before_shift|after_shift|custom`), custom_cron, is_active, created_by
- `checklist_items` — `checklist_id`, title, description, `answer_type` (`yes_no|text|number|photo|video|signature|multi_photo`), required, photo_required, video_required, gps_required, time_required, ai_verify, order_index
- `checklist_assignments` — `checklist_id`, `assigned_role` (nullable), `assigned_user_id` (nullable), `store_id`, active
- `checklist_submissions` — `checklist_id`, `staff_user_id`, `store_id`, `merchant_id`, `submitted_at`, shift, status (`pending|ai_pass|ai_fail|approved|rejected`), overall_score, gps_lat, gps_lng
- `submission_answers` — `submission_id`, `item_id`, `answer_json`
- `submission_images` — `submission_id`, `item_id` (nullable for selfie), `kind` (`selfie|item_photo`), `storage_path`, `thumb_path`, `taken_at`
- `uniform_reference_images` — `merchant_id`, `kind` (`front|back|side|cap|apron|shoes|other`), `storage_path`, `version`, `is_current`, `uploaded_by`
- `ai_verification_results` — `submission_id`, `raw_response jsonb`, per-category scores as jsonb, overall_score, result (`pass|fail`), reason text, model
- `owner_reviews` — `submission_id`, `reviewer_id`, decision (`approved|rejected`), notes
- `checklist_notifications` — `user_id`, kind, payload jsonb, read_at
- `checklist_templates` — seed data of ~20 default items (Uniform, Hair, Nails, Shoes, Cap, Mask, Gloves, Apron, ID Card, Face Clean, Counter Clean, Kitchen Clean, Temperature, Hand Wash, Cash Drawer, Machine Check, Opening/Closing Cleaning, Food Quality, Expiry)
- `checklist_activity_logs` — audit trail (`entity_type`, `entity_id`, action, actor_id, meta jsonb)

All tables get `GRANT SELECT/INSERT/UPDATE/DELETE ... TO authenticated; GRANT ALL ... TO service_role;`.
Storage: staff face uploads reuse patterns from `staff-faces`; add `submission_images` writes via signed URLs.

RLS (using existing `has_role` / merchant-scope helpers where present, otherwise inline):
- Owners/merchant/admin/super_admin: full access to rows where `merchant_id` matches theirs.
- Staff: SELECT on assignments/checklists targeting them; INSERT own submissions/answers/images; no UPDATE on AI results or reviews.
- `owner_reviews` write restricted to owner/admin roles.

## 2. Storage buckets

Two private buckets created via `supabase--storage_create_bucket`:
- `uniform-reference` — owner uploads, versioned
- `staff-checklist` — per-submission staff uploads

Storage RLS on `storage.objects`: only members of the same `merchant_id` (path-prefixed `merchant_id/...`) can read; staff can insert into their own submission prefix.

## 3. Edge functions

- `verify-checklist-submission` — takes `submission_id`, loads current uniform references + submission images, calls Lovable AI Gateway `google/gemini-2.5-pro` (multimodal, image inputs by signed URL) with a strict system prompt returning JSON:
  `{ categories: { uniform, hair, shoes, nails, cap, mask, gloves, id_card, face_visible, cleanliness }, overall_score, result: "pass"|"fail", reason }`
  Persists to `ai_verification_results`, updates `checklist_submissions.status` to `ai_pass`/`ai_fail`, writes activity log, emits notifications to owners on fail/submit.
- `checklist-notify` — insert notification rows + realtime channel broadcast for staff & owner events.

Both use CORS shared headers, JWT validation via `SUPABASE_ANON_KEY` client, and `SUPABASE_SERVICE_ROLE_KEY` for writes.

## 4. Frontend

New route tree under `/checklists`:

- `ChecklistsHubPage` — role-aware landing.
- Owner:
  - `ChecklistBuilderPage` — dnd-kit builder for items with all answer types + AI toggle. Frequency, department, outlet, role/staff assignment.
  - `ChecklistLibraryPage` — list / edit / delete / duplicate; template gallery to bootstrap defaults.
  - `UniformReferencePage` — upload front/back/side/cap/apron/shoes, versioned, replace anytime.
  - `ChecklistReviewPage` — cards for submissions with AI score, images, side-by-side image compare (reference vs selfie, zoom/rotate/fullscreen), timeline, approve/reject.
  - `ChecklistReportsPage` — Today/Weekly/Monthly completion, failed items, avg AI score, top staff, late, pending, rejected. CSV export using existing `reportCsvUtils`.
  - `ChecklistAuditPage` — activity log viewer.
- Staff:
  - `StaffChecklistsPage` — assigned checklists list (from `checklist_assignments` filtered by role/user).
  - `ChecklistSubmitPage` — completes items one by one, forces `<input type="file" accept="image/*" capture="environment">` (camera-only, no gallery — use `getUserMedia` when available and fall back to `capture` attribute; gallery `<input>` without capture is never rendered), captures live selfie via `getUserMedia`, uploads to storage, on submit invokes `verify-checklist-submission`.
  - `MyChecklistHistoryPage` — past submissions with AI result & owner decision.

Reusable components under `src/components/checklist/`:
`ChecklistItemEditor`, `AnswerTypePicker`, `LiveCameraCapture`, `ImageCompareViewer`, `AiScorePanel`, `SubmissionTimeline`, `NotificationBell` (top bar addition).

React Query hooks in `POSDataContext` style under `src/hooks/checklist/`: `useChecklists`, `useChecklistSubmissions`, `useUniformReferences`, `useChecklistNotifications` — with realtime subscriptions via existing `RealtimeContext`.

Guards: `RequireRole` for owner-only pages (`owner`, `merchant`, `admin`, `super_admin`); staff pages allowed for `staff`, `cashier`, `store_manager`.

## 5. Navigation

Add "Checklists" entry to `AppSidebar` (owner group) and staff sidebar. No existing menu items removed.

## 6. Audit + notifications

Every create/edit/delete/assign/submit/AI-run/approve/reject writes a row to `checklist_activity_logs` (via a shared client helper wrapping existing `logSecurityAction` pattern) and, where relevant, a `checklist_notifications` row. Realtime channel updates both bells.

## 7. UI system

Uses existing semantic tokens (`--primary`, `--card`, etc.), shadcn components, glassmorphism cards (`bg-card/60 backdrop-blur`), rounded-2xl, framer-motion for open/close, fully responsive (mobile-first grids, sticky action bars on mobile). Respects dark/light via existing `ThemeContext`.

## Technical notes

- AI call goes through the edge function only; `LOVABLE_API_KEY` stays server-side. Prompt enforces JSON output and reuses the identity-focused guardrails already in `verify-face`.
- Camera-only enforcement: capture component uses `navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" | "environment" } })`; file `<input>` fallback always sets `capture` and no gallery picker path exists.
- Image compression: client uses `browser-image-compression` (already used elsewhere if present; otherwise a small canvas resize helper) to keep uploads under ~800KB and generates 256px thumbnails.
- Offline queue: submissions cached in IndexedDB (reusing `src/lib/idb.ts`) and retried when online.
- Nothing in `src/integrations/supabase/client.ts`, `.env`, or Attendance code is touched.

## Out of scope

Video answer type is stored but AI verification runs on images only in v1. Signature capture uses a canvas and stores PNG in `submission_images`.
