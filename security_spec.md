# GuestPilot AI — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants & Master Source of Truth

1. **Zero-Trust Default Deny**: Every path not explicitly matched is denied via `match /{document=**} { allow read, write: if false; }`.
2. **Explicit Admin Authorization (`isAdmin()`)**:
   - Only verified Google users (`request.auth != null && request.auth.token.email_verified == true`) who are either the bootstrapped administrator (`request.auth.token.email == 'appbuilder078@gmail.com'`) or have an explicit document in `/admins/$(request.auth.uid)` may read or mutate business records.
   - No user-editable `role` or `isAdmin` field is trusted on `/users/{userId}` or any other collection.
3. **Strict Ownership (`ownerId == request.auth.uid`)**:
   - Every business collection (`users`, `websites`, `suppliers`, `clients`, `leads`, `orders`, `payments`, `outreach`, `deliveries`, `settings`, `activityLogs`) requires `ownerId == request.auth.uid` on `create`, enforces immutability of `ownerId` and `createdAt` on `update`, and enforces `existing().ownerId == request.auth.uid` on `list` and `get`.
4. **Cost-Optimized `allow list`**:
   - No `get()` or `exists()` calls are placed inside `allow list` rules. List queries enforce `isBootstrappedAdmin() && existing().ownerId == request.auth.uid`.
5. **Temporal Integrity**:
   - `createdAt == request.time` on `create`.
   - `updatedAt == request.time` on `update`, and `createdAt == existing().createdAt`.
   - `activityLogs` are append-only (`allow update: if false;`).
6. **Path Variable Hardening (`isValidId`)**:
   - All single-document operations (`get`, `create`, `update`, `delete`) validate the document ID against `^[a-zA-Z0-9_\-]+$` with `size() <= 128`.
7. **Strict Key & Size Validation (`isValid[Entity]`)**:
   - Every `create` and `update` invokes `isValid[Entity](incoming())` checking `keys().hasAll(...)`, `keys().hasOnly(...)`, type safety, enums, and string `.size()` bounds.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 (Unauthenticated Read/Write)**: `auth = null` attempting `get` or `create` on `/websites/web_1`. -> `PERMISSION_DENIED`
2. **Payload 2 (Unverified Email Spoofing)**: `auth = { uid: 'spoof_1', token: { email: 'appbuilder078@gmail.com', email_verified: false } }` attempting `create` on `/websites/web_1`. -> `PERMISSION_DENIED`
3. **Payload 3 (Unauthorized Signed-In User)**: `auth = { uid: 'intruder_1', token: { email: 'hacker@example.com', email_verified: true } }` attempting `get` or `list` on `/clients`. -> `PERMISSION_DENIED`
4. **Payload 4 (Shadow Field / Privilege Escalation)**: Admin attempting `create` on `/users/admin_1` with an extra field `{ role: 'superadmin' }`. -> `PERMISSION_DENIED`
5. **Payload 5 (Cross-Owner Identity Spoofing)**: Admin `uid = 'admin_1'` attempting `create` on `/orders/ord_1` with `ownerId: 'someone_else'`. -> `PERMISSION_DENIED`
6. **Payload 6 (ID Poisoning Attack)**: Admin attempting `create` on `/websites/invalid id with spaces!` or ID > 128 chars. -> `PERMISSION_DENIED`
7. **Payload 7 (Value Poisoning on Update)**: Admin attempting `update` on `/websites/web_1` setting `da: "not-a-number"` or `domain` > 253 chars. -> `PERMISSION_DENIED`
8. **Payload 8 (Timestamp Forgery on Create)**: Admin attempting `create` on `/suppliers/sup_1` with a past or future `createdAt != request.time`. -> `PERMISSION_DENIED`
9. **Payload 9 (Immortal Field Mutation on Update)**: Admin attempting `update` on `/clients/cli_1` mutating `createdAt` or `ownerId`. -> `PERMISSION_DENIED`
10. **Payload 10 (Invalid Workflow Status Enum)**: Admin attempting `update` on `/orders/ord_1` with `status: 'HACKED_STAGE'`. -> `PERMISSION_DENIED`
11. **Payload 11 (Audit Log Tampering)**: Admin attempting `update` on `/activityLogs/log_1` to alter historical audit details. -> `PERMISSION_DENIED`
12. **Payload 12 (Unconstrained Query Scraping)**: Client attempting `list` on `/websites` without matching `ownerId == request.auth.uid`. -> `PERMISSION_DENIED`
