# Checklist System — Production Refactor

Goal: one editor, real AI comparison against owner reference images, automatic decisions with confidence threshold, owner review with Approve / Reject / Request Re-upload, submission locking, and real-time notifications.

## 1. Database migration

Add to `public.checklist_submissions`:
- `locked` boolean (default `false`) — read-only when true
- `reupload_count` integer (default 0)
- `reupload_item_ids` uuid[] — items the owner asked staff to re-upload
- `reupload_requested_at` timestamptz
- `reupload_requested_by` uuid
- `approved_at` timestamptz, `approved_by` uuid (nullable; NULL when auto-approved)
- `review_notes` text
- `parent_submission_id` uuid (nullable, links a re-upload back to the original)

Add to `public.checklists`:
- `ai_confidence_threshold` integer (default 75) — auto-approve if every AI-verified item scores ≥ threshold

Extend `checklist_submissions.status` enum with `review_required`. Loosen `owner_reviews.decision` CHECK to allow `request_reupload`. Add `checklist_notifications.kind` values: `approved`, `rejected`, `reupload_requested`, `review_required`.

Trigger: when `status` becomes `approved` or `ai_pass` and no re-upload pending → set `locked = true`. When a re-upload request is written → set `locked = false` and clear `approved_*`.

## 2. Edge function `verify-checklist-submission`

Existing per-item Gemini comparison stays. After results:
- If every AI-verified item is `match` AND its `confidence` ≥ checklist threshold → set `status = 'approved'`, `locked = true`, `approved_at = now()`, notify staff (`approved`).
- If any item is `no_match` / `poor_quality` / below threshold → `status = 'review_required'`, notify owners (`review_required`).
- Non-AI items still notify owners with `submitted`.

Never fabricate scores; keep the strict JSON prompt and `no_reference` / `poor_quality` branches.

## 3. Single editor (remove the "Untitled" flow)

`ChecklistLibraryPage`: replace instant create with a `NewChecklistDialog` that captures Name + Shift Type + Frequency before insert, then routes to `/checklists/:id/edit`. The full-page `ChecklistBuilderPage` remains the only editor for both create-continue and edit. No popup builder exists.

## 4. Staff submission flow (`ChecklistSubmitPage`)

- On load: fetch the latest submission for this staff + checklist.
  - If `locked` and no re-upload → show read-only "Already submitted" screen with status + AI panel; hide inputs and submit button.
  - If a re-upload is pending (`reupload_item_ids` populated) → render only those failed items, and on submit **update** that submission (clear `reupload_item_ids`, bump `reupload_count`, replace only the failed-item images/answers, set `status = 'pending'`, then re-invoke AI).
  - Otherwise → normal fresh submission (current behaviour).
- After submit, invoke `verify-checklist-submission`; render result.

## 5. Owner review (`ChecklistReviewPage`)

Each card shows staff name, submission time, per-item reference vs submitted image, tick/text answers, AI status + confidence + reason, `reupload_count` badge.

Three actions:
- **Approve** → `status='approved'`, `locked=true`, `approved_by=user`, notify staff `approved`.
- **Reject** → `status='rejected'`, `locked=true`, notify staff `rejected`.
- **Request Re-upload** → dialog to pick which items must be redone → writes `owner_reviews` (`request_reupload`), sets `status='pending'`, `locked=false`, `reupload_item_ids=<selected>`, `reupload_requested_at=now`, notifies staff `reupload_requested`.

## 6. Staff dashboard (`StaffChecklistsPage`)

New "Action needed" section listing submissions where `reupload_item_ids` is non-empty, linking straight into the re-upload view. Recent submissions list shows `approved` / `rejected` / `review_required` badges.

## 7. Notifications

- Staff receives: `assigned` (new assignment insert trigger), `approved`, `rejected`, `reupload_requested`.
- Owner receives: `submitted` (non-AI), `review_required` (AI issues), `ai_pass` optional summary.
Realtime already subscribes to `checklist_notifications`; no context change needed.

## 8. Locking / security

- DB trigger + edge-function writes are the only ways to flip `locked`.
- Staff RLS on `checklist_submissions`: `UPDATE` allowed only when `locked = false` AND `staff_user_id = auth.uid()`.
- Staff RLS on `submission_images` / `submission_answers`: `INSERT`/`UPDATE`/`DELETE` allowed only when parent submission is `locked = false`.
- Owner review policies unchanged.

## 9. Files touched

**Migration**: one new SQL migration for columns, enum extension, trigger, updated RLS.

**Edge function**: `supabase/functions/verify-checklist-submission/index.ts` (auto-approve + threshold + status wiring).

**Frontend**:
- `src/pages/checklist/ChecklistLibraryPage.tsx` — remove auto "Untitled", add dialog.
- `src/pages/checklist/ChecklistSubmitPage.tsx` — locking, re-upload mode, existing submission fetch.
- `src/pages/checklist/ChecklistReviewPage.tsx` — Request Re-upload dialog + item picker.
- `src/pages/checklist/StaffChecklistsPage.tsx` — Action-needed list.
- `src/pages/checklist/StaffChecklistHistoryPage.tsx` — show approved/reupload badges + notes.
- `src/hooks/checklist/useChecklistData.ts` — new hooks: `useLatestSubmission(checklistId)`, `usePendingReuploads()`, mutations.
- New component `src/components/checklist/RequestReuploadDialog.tsx`.
- New component `src/components/checklist/NewChecklistDialog.tsx`.

No changes to routes, sidebar, auth, or unrelated code. No changes to `supabase/config.toml`, `client.ts`, or `.env`.

## 10. Out of scope

- Video AI verification (still image-only).
- Bulk owner actions across multiple submissions.
- Push notifications outside the in-app bell (browser Notification API already wired via `src/lib/notifications.ts`).
