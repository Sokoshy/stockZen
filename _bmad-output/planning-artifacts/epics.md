---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
---

# gestionnaire-stock - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for gestionnaire-stock, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Users can create products with name, category, unit, price, and barcode
FR2: Users can modify and delete existing products
FR3: Users can view the list of all their products with filters (category, alert, search)
FR4: Users can record stock entries (supplier receipts)
FR5: Users can record stock exits (sales, consumption, losses)
FR6: System automatically calculates available stock after each movement
FR7: Users can view complete movement history per product
FR8: Users can configure 3 stock threshold levels per product (critical/attention/healthy)
FR9: System automatically generates alerts when a threshold is reached
FR10: Alerts are visually classified by criticality (Red/Orange/Green)
FR11: Users receive email notifications for critical alerts
FR12: Users can view a dashboard of active alerts sorted by priority
FR13: Users can mark an alert as "handled" or "ignored"
FR14: Administrators can configure default alert thresholds for their account
FR15: Users can create an account with email and password
FR16: Users can log in and log out of the application
FR17: Users can reset their password
FR18: Administrators can invite other users to join their account
FR19: Administrators can assign roles to users (Admin/Manager/Operator)
FR20: System controls access to features based on user role
FR21: Operators cannot see product purchase prices
FR22: Application works entirely without internet connection (offline mode)
FR23: Data entered offline is stored locally on the device
FR24: System automatically synchronizes data when connection returns
FR25: Users can see synchronization status (sync in progress/up to date/conflict)
FR26: System resolves data conflicts ("last modified wins" strategy)
FR27: Users can view a stock overview dashboard
FR28: Dashboard displays products on alert by criticality order
FR29: Users can see basic statistics (number of products, active alerts)
FR30: System displays the PMI (Peace of Mind Index) indicator in the dashboard
FR31: Each customer account is isolated from others (separate data)
FR32: Users can only access their own account data
FR33: System automatically applies subscription plan limits (max products, max users)
FR34: Users can view their current subscription plan
FR35: Users can upgrade/downgrade their plan
FR36: System applies plan restrictions (Free: 20 products/1 user, Starter: 50/2, Pro: 150/3)
FR37: Users receive automatic monthly invoices
FR38: Users can bulk import products via CSV file
FR39: System validates CSV format and reports import errors

### NonFunctional Requirements

NFR1: (NFR-P1) Main actions (create product, stock entry/exit) must complete in < 2 seconds (95th percentile)
NFR2: (NFR-P2) Dashboard must load in < 3 seconds on 3G connection
NFR3: (NFR-P3) Offline/online synchronization must process 100 movements in < 10 seconds
NFR4: (NFR-P4) Application must work on smartphone with minimum 2GB RAM
NFR5: (NFR-P5) Application size < 50MB (installable PWA)
NFR6: (NFR-S1) All data encrypted in transit (TLS 1.3 minimum)
NFR7: (NFR-S2) All data encrypted at rest (AES-256)
NFR8: (NFR-S3) Passwords hashed with bcrypt (cost 12 minimum)
NFR9: (NFR-S4) Multi-factor authentication available for Enterprise accounts
NFR10: (NFR-S5) Strict multi-tenant isolation (no inter-account access possible)
NFR11: (NFR-S6) Audit logs of all sensitive actions (logins, stock modifications)
NFR12: (NFR-S7) Session timeout after 30 minutes of inactivity
NFR13: (NFR-S8) GDPR compliance (right to erasure, data portability)
NFR14: (NFR-S9) Daily automatic backup with 30-day retention
NFR15: (NFR-SC1) Support for 1000+ simultaneously active accounts (MVP)
NFR16: (NFR-SC2) Support for 10,000+ accounts (Growth phase)
NFR17: (NFR-SC3) Each account can manage up to 1000 products (Pro/Business)
NFR18: (NFR-SC4) Architecture allowing horizontal scaling (adding servers without downtime)
NFR19: (NFR-A1) 99.5% uptime (excluding planned maintenance < 4h/month)
NFR20: (NFR-A2) 99.9% SLA for Enterprise plans (response time < 4h)
NFR21: (NFR-A3) Offline mode guarantees 100% operation without connection
NFR22: (NFR-A4) 0 data loss (ACID transactional)
NFR23: (NFR-A5) RPO (Recovery Point Objective) < 5 minutes
NFR24: (NFR-A6) RTO (Recovery Time Objective) < 2 hours
NFR25: (NFR-M1) Continuous deployment without downtime (blue-green deployment)
NFR26: (NFR-M2) Centralized logs for debugging (90-day retention)
NFR27: (NFR-M3) Real-time monitoring (alerts if errors > 1% or latency > 3s)
NFR28: (NFR-M4) Complete API documentation (OpenAPI/Swagger)
NFR29: (NFR-M5) Integrated user guide in the app (contextual)
NFR30: (NFR-U1) Responsive interface (mobile 320px → desktop 1920px)
NFR31: (NFR-U2) Color contrast compliant with WCAG 2.1 AA
NFR32: (NFR-U3) Keyboard navigation possible (no mouse)
NFR33: (NFR-U4) Labels and tooltips for all interactive elements
NFR34: (NFR-U5) i18n ready architecture (future multi-language support)
NFR35: (NFR-U6) Localized date and number formats (FR by default)

### Additional Requirements

- Architecture: Next.js (App Router) + TypeScript; Bun used for package manager (and optionally runtime in dev scripts).
- Architecture: PostgreSQL 18 as primary datastore; Drizzle ORM + drizzle-kit SQL migrations checked into the repo.
- Architecture: Multi-tenancy enforced with Postgres RLS (tenant_id on tenant-scoped tables); API must set tenant context via `SET LOCAL app.tenant_id = '<uuid>'` per request/transaction.
- Architecture: Inventory uses an append-only ledger (`stock_movements`) with derived stock state (`current_stock`).
- Architecture: Offline conflict strategy is server-authoritative “last modified wins” using server timestamps/versions; use idempotency keys for sync replays.
- Architecture: Offline sync uses local IndexedDB (Dexie) + outbox and a dedicated sync endpoint (e.g. `/api/sync`); UI may gate features but server remains authoritative.
- Architecture: Authentication uses Better Auth (pin to maintained 1.x and enforce >= 1.2.10); cookie-based sessions stored in Postgres (no stateless JWT for primary auth).
- Architecture: Centralized authorization/policy layer (RBAC: Admin/Manager/Operator) guards all server-side mutations and sensitive reads.
- Architecture: Security cross-cutting requirements include TLS 1.3+, audit logging for sensitive actions, and rate limiting (especially auth endpoints and sync).
- Architecture: API documentation is tRPC-only (no OpenAPI generation).
- Architecture: Deployment is Docker-first on Fly.io (standalone Next.js output); separate staging and production environments; secrets managed via provider secrets.
- Architecture: Observability includes structured JSON logs (pino with correlation + redaction) and Sentry for client/server error monitoring; backups are provider-managed plus scheduled logical `pg_dump` exports stored off-provider with a restore runbook.
- Architecture: Billing/invoicing assumes Stripe integration and webhook ingestion; plan enforcement impacts quotas and permissions.
- UX: Primary “3-click” stock movement loop (select product → enter quantity → confirm) should complete in < 10 seconds and cover ~80–90% of actions.
- UX: PWA, mobile-first responsive design from 320px to 1920px; dashboard-first navigation (minimal/no menu for daily tasks).
- UX: Offline-first UX: identical UI online/offline, invisible auto-sync with subtle status indicator (green/orange/red) and offline queue with auto-retry; no manual “sync now” actions.
- UX: Touch targets at least 56px; quantity uses numeric keyboard; auto-focus first field; real-time validation (debounced) with contextual per-field errors and clear recovery steps.
- UX/A11y: WCAG 2.1 AA target; keyboard navigation, focus management (including focus trap for modals), and `aria-live` for status/error feedback.
- UX: Error/feedback patterns include persistent warning toasts (no auto-hide) when action is required; undo should be available for ~5 seconds after validation; confirm destructive actions; autosave drafts where applicable.

### FR Coverage Map

### FR Coverage Map

FR1: Epic 2
FR2: Epic 2
FR3: Epic 2
FR4: Epic 2
FR5: Epic 2
FR6: Epic 2
FR7: Epic 2
FR8: Epic 3
FR9: Epic 3
FR10: Epic 3
FR11: Epic 3
FR12: Epic 4
FR13: Epic 3
FR14: Epic 3
FR15: Epic 1
FR16: Epic 1
FR17: Epic 1
FR18: Epic 1
FR19: Epic 1
FR20: Epic 1
FR21: Epic 1
FR22: Epic 2
FR23: Epic 2
FR24: Epic 2
FR25: Epic 2
FR26: Epic 2
FR27: Epic 4
FR28: Epic 4
FR29: Epic 4
FR30: Epic 4
FR31: Epic 1
FR32: Epic 1
FR33: Epic 6
FR34: Epic 6
FR35: Epic 6
FR36: Epic 6
FR37: Epic 6
FR38: Epic 5
FR39: Epic 5

## Epic List

### Epic 1: Accounts, Team & Secure Access (Multi-tenant)
Users can create an account, authenticate, manage team members and roles, and be securely isolated per customer account.
**FRs covered:** FR15, FR16, FR17, FR18, FR19, FR20, FR21, FR31, FR32

### Epic 2: Offline-First Inventory Core (Products + Stock Movements + Sync)
Users can manage products and record stock movements with full offline capability, local storage, automatic sync, sync status visibility, and conflict handling.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR22, FR23, FR24, FR25, FR26

### Epic 3: Thresholds & Alerting (Actionable Alerts)
Users can configure thresholds and the system generates, classifies, notifies, and tracks alerts with triage actions.
**FRs covered:** FR8, FR9, FR10, FR11, FR13, FR14

### Epic 4: Operational Dashboards (Stock Overview + Alerts View + PMI)
Users can view stock and alert dashboards with key stats and the Peace of Mind Index.
**FRs covered:** FR12, FR27, FR28, FR29, FR30

### Epic 5: Bulk Product Import (CSV)
Users can import products via CSV with validation and clear error reporting.
**FRs covered:** FR38, FR39

### Epic 6: Subscription Plans, Quotas & Invoicing (Post-MVP)
Users can view/change plans; the system enforces plan limits and generates invoices.
**FRs covered:** FR33, FR34, FR35, FR36, FR37

<!-- Repeat for each epic in epics_list (N = 1, 2, 3...) -->

## Epic 1: Accounts, Team & Secure Access (Multi-tenant)

Users can create an account, authenticate, manage team members and roles, and be securely isolated per customer account.
**FRs covered:** FR15, FR16, FR17, FR18, FR19, FR20, FR21, FR31, FR32

<!-- Repeat for each story (M = 1, 2, 3...) within epic N -->

### Story 1.1: Set up Initial Project from Starter Template (Create T3 App)

As a developer,
I want to initialize the project using the selected starter template and baseline tooling,
So that the team can implement features consistently on a working foundation.

**FRs:** N/A (Architecture requirement: selected starter template)

**Acceptance Criteria:**

**Given** the architecture specifies “Create T3 App” as the selected starter
**When** I initialize the project with `bun create t3-app@latest apps/web`
**Then** the repository contains a working Next.js (App Router) TypeScript app scaffold
**And** the project builds and starts locally using the standard dev command(s)

**Given** the architecture specifies Drizzle ORM as authoritative
**When** starter defaults would introduce conflicting ORM choices
**Then** the project is aligned to use Drizzle + drizzle-kit for migrations going forward
**And** no Prisma-only assumptions remain in the baseline

### Story 1.2: Sign up + Create Tenant (Admin) + Start Session

As a new user,
I want to create an account and a new tenant,
So that I can start using StockZen with my organization securely isolated.

**FRs:** FR15, FR31, FR32

**Acceptance Criteria:**

**Given** I am not authenticated
**When** I sign up with a valid email and password
**Then** the system creates a new tenant and a user account
**And** the user is added to that tenant as `Admin`
**And** a session is created and stored server-side (DB-backed session)
**And** an auth cookie is set (httpOnly; `secure` in production)

**Given** an email is already in use
**When** I attempt to sign up with the same email
**Then** the system rejects the request with a clear validation error
**And** no tenant/user is created

**Given** I provide an invalid email or a weak/invalid password
**When** I attempt to sign up
**Then** the system rejects the request with field-level validation errors
**And** no tenant/user is created

**Given** I just signed up successfully
**When** I call an authenticated endpoint
**Then** I am authenticated as the created user
**And** all tenant-scoped access is constrained to my tenant (tenant context established for the request)

**Given** a server error occurs during signup
**When** the operation fails
**Then** the system does not leave partial data (no orphan tenant without admin user)
**And** I receive a non-sensitive error response

### Story 1.3: Login + Logout (Short Session + “Remember Me”)

As a user,
I want to log in and log out securely,
So that I can access my tenant while keeping my account safe.

**FRs:** FR16

**Acceptance Criteria:**

**Given** I have a valid account
**When** I log in with correct email and password
**Then** the system creates a server-side (DB-backed) session
**And** sets an auth cookie (httpOnly; `secure` in production)
**And** the session is short-lived by default

**Given** I select “Remember me” during login
**When** I log in successfully
**Then** the system creates a persistent session with a longer expiration than the default session
**And** the user remains logged in across browser restarts until expiration or explicit logout

**Given** I submit wrong credentials
**When** I attempt to log in
**Then** the system rejects the login with a generic error (no user enumeration)
**And** no session is created

**Given** I am logged in
**When** I log out
**Then** the server invalidates my session in the database
**And** the auth cookie is cleared/expired
**And** subsequent authenticated requests fail with “not authenticated”

**Given** I am logged in
**When** I call any authenticated endpoint
**Then** the request establishes tenant context for DB access (tenant-scoped operations remain constrained to my tenant)

### Story 1.4: Password Reset via Email Link (One-Time Token)

As a user,
I want to reset my password via an email link,
So that I can regain access if I forget my password.

**FRs:** FR17

**Acceptance Criteria:**

**Given** I am not authenticated
**When** I request a password reset for my email
**Then** the system responds with a generic success message (no user enumeration)
**And** if the email exists, the system generates a one-time reset token with a short expiration
**And** sends an email containing a reset link

**Given** I open a reset link with a valid, unexpired token
**When** I set a new valid password
**Then** the system updates my password securely
**And** the reset token is invalidated (cannot be reused)
**And** existing sessions for my user are invalidated

**Given** the token is invalid, expired, or already used
**When** I attempt to use the reset link
**Then** the system rejects the request with a non-sensitive error
**And** prompts me to request a new reset link

**Given** I submit an invalid/weak new password
**When** I attempt to reset my password
**Then** the system rejects with field-level validation errors
**And** the password is not changed

### Story 1.5: Team Membership + Roles Management (Admin/Manager/Operator)

As an Admin,
I want to manage tenant members and their roles,
So that I can control who can access which features in my organization.

**FRs:** FR19, FR20

**Acceptance Criteria:**

**Given** I am authenticated as an `Admin` in a tenant
**When** I view the tenant members list
**Then** I can see all members of my tenant with their current roles
**And** I cannot access members from other tenants

**Given** I am authenticated as an `Admin`
**When** I change a member’s role to `Admin`, `Manager`, or `Operator`
**Then** the role change is persisted
**And** permissions are enforced server-side based on the new role

**Given** I am authenticated as an `Admin`
**When** I attempt to remove a member from the tenant
**Then** the member is removed from the tenant
**And** any active sessions for that user in this tenant are invalidated (if applicable)

**Given** I am an `Admin` and I am the last remaining `Admin` in the tenant
**When** I attempt to remove myself from the tenant or change my role away from `Admin`
**Then** the system rejects the request
**And** the tenant still has at least one `Admin`

**Given** I am an `Admin` and at least one other `Admin` exists in the tenant
**When** I attempt to remove myself from the tenant
**Then** the system requires a double confirmation step
**And** only after confirming twice, the system removes my membership
**And** I lose access immediately (my sessions are invalidated)

**Given** I am authenticated as a `Manager` or `Operator`
**When** I attempt to change roles or remove members
**Then** the system rejects the request as forbidden

### Story 1.6: Invite User to Tenant (Revocable + Expiring Link → Set Password)

As an Admin,
I want to invite a user to join my tenant via an email link,
So that I can onboard team members securely.

**FRs:** FR18

**Acceptance Criteria:**

**Given** I am authenticated as an `Admin` in a tenant
**When** I create an invitation with an email and a target role (`Manager` or `Operator` or `Admin`)
**Then** the system creates an invitation tied to my tenant with a one-time token and an expiration date
**And** sends an email containing an invite link

**Given** an invitation exists and is not expired or revoked
**When** the invitee opens the invite link and sets a valid password
**Then** the system creates (or activates) the user account
**And** adds the user to the inviting tenant with the invited role
**And** invalidates the invitation token (cannot be reused)

**Given** an invitation is expired, revoked, or already used
**When** the invitee opens the invite link
**Then** the system rejects the action with a non-sensitive error
**And** the invitee is prompted to request a new invite from an Admin

**Given** I am an `Admin` and an invitation is still pending
**When** I revoke the invitation
**Then** the invitation cannot be used anymore
**And** the invite link becomes invalid immediately

**Given** I am authenticated as a `Manager` or `Operator`
**When** I attempt to create or revoke invitations
**Then** the system rejects the request as forbidden

### Story 1.7: RBAC Enforcement + Hide `purchasePrice` for Operators

As an Operator,
I want product purchase prices to be hidden from me,
So that sensitive cost information is protected while I still manage stock operations.

**FRs:** FR20, FR21

**Acceptance Criteria:**

**Given** a product has `price` (sale price) and `purchasePrice` (cost)
**When** an `Operator` views product details or lists products
**Then** the system does not expose `purchasePrice` in any UI view
**And** the API responses available to an `Operator` do not include `purchasePrice` (or return it as null/omitted consistently)

**Given** I am authenticated as an `Operator`
**When** I attempt to access any endpoint or action that reveals `purchasePrice`
**Then** the system either omits the field or rejects the request (server-side enforced)
**And** the UI does not rely on client-side hiding for security

**Given** I am authenticated as an `Admin` or `Manager`
**When** I view product details or lists
**Then** I can see `purchasePrice` (subject to tenant isolation)

**Given** I am authenticated in a tenant
**When** I access product data
**Then** RBAC checks are applied after authentication
**And** the data returned is constrained to my tenant

### Story 1.8: Tenant Isolation Enforcement (RLS + Anti-Leak Tests)

As a tenant user,
I want my tenant’s data to be strictly isolated from other tenants,
So that I can trust that no cross-account access is possible.

**FRs:** FR31, FR32

**Acceptance Criteria:**

**Given** I am authenticated and belong to a tenant
**When** the server handles my request
**Then** the DB transaction establishes tenant context (e.g., `SET LOCAL app.tenant_id = '<tenant-uuid>'`)
**And** all tenant-scoped reads/writes are constrained to that tenant

**Given** I am authenticated in Tenant A
**When** I attempt to read or mutate a tenant-scoped resource belonging to Tenant B
**Then** the server denies access
**And** no data from Tenant B is returned or modified

**Given** tenant context is missing or invalid for a request
**When** a tenant-scoped query is executed
**Then** the operation fails safely (no cross-tenant leakage)

**Given** automated tests exist for tenant isolation
**When** tests create Tenant A and Tenant B with distinct data
**Then** tests verify Tenant A cannot access Tenant B data for both reads and writes

### Story 1.9: Audit Logs for Sensitive Account Actions (Auth + Team)

As an Admin,
I want sensitive account and team actions to be audit-logged,
So that I can trace who did what and support security/compliance needs.

**FRs:** N/A (Security requirement; supports NFR-S6)

**Acceptance Criteria:**

**Given** a sensitive action occurs in my tenant
**When** the system processes the action successfully (or rejects it for authorization)
**Then** an audit event is recorded with at least: `tenantId`, `actorUserId` (or “anonymous” where applicable), action type, target identifiers (when relevant), timestamp (UTC ISO 8601), and minimal context (no secrets)

**Given** I perform any of these actions: login, logout, password reset completed, invite created, invite revoked, role changed, member removed
**When** the action is processed
**Then** an audit event is recorded for that action

**Given** an authentication-related action fails (e.g., wrong password)
**When** the system rejects it
**Then** an audit/security event is recorded without exposing sensitive details (no password/token in logs)

**Given** I am an Admin
**When** I view the audit log list
**Then** I can see audit events for my tenant only
**And** events are ordered newest-first and are pageable

**Given** I am a Manager or Operator
**When** I attempt to view audit logs
**Then** the system rejects the request as forbidden

<!-- Repeat for each epic in epics_list (N = 2, 3, 4...) -->

## Epic 2: Offline-First Inventory Core (Products + Stock Movements + Sync)

Users can manage products and record stock movements with full offline capability, local storage, automatic sync, sync status visibility, and conflict handling.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR22, FR23, FR24, FR25, FR26

<!-- Repeat for each story (M = 1, 2, 3...) within epic N -->

### Story 2.1: Create Product (Offline-First)

As a tenant user,
I want to create a product with core fields, even while offline,
So that I can manage inventory immediately without needing connectivity.

**FRs:** FR1, FR21, FR22, FR23

**Acceptance Criteria:**

**Given** I am authenticated in a tenant
**When** I create a product with `name`, `category`, `unit`, `price` (sale price), and optional `barcode`
**Then** the product is saved locally on the device
**And** it is visible immediately in the product list while offline

**Given** I am `Admin` or `Manager`
**When** I create or edit a product
**Then** I can optionally set `purchasePrice` (cost)

**Given** I am an `Operator`
**When** I create or edit a product
**Then** I can complete the action without seeing or setting `purchasePrice`

**Given** I am offline
**When** I create a product
**Then** the app confirms success without blocking on sync
**And** the product is marked as pending sync (local state)

**Given** I provide invalid values (e.g., empty name, negative price)
**When** I attempt to save
**Then** the app shows field-level validation errors
**And** the product is not created locally

**Given** I am authenticated as `Admin`, `Manager`, or `Operator`
**When** I create a product
**Then** the system allows the action (role-permitted)

**Given** I am an `Operator`
**When** I view products
**Then** `purchasePrice` is not displayed and not exposed via Operator-facing API responses (per RBAC)

<!-- End story repeat -->

### Story 2.2: Edit/Delete Products + Product List Filters (Offline-First)

As a tenant user,
I want to edit/delete products and quickly find them using filters and search, even offline,
So that I can manage inventory efficiently during daily operations.

**FRs:** FR2, FR3, FR21, FR22, FR23

**Acceptance Criteria:**

**Given** I am authenticated as `Admin`, `Manager`, or `Operator`
**When** I edit a product’s editable fields (`name`, `category`, `unit`, `price`, `barcode`)
**Then** the changes are saved locally and reflected immediately in the UI (even offline)
**And** the change is marked as pending sync when offline

**Given** I am authenticated as `Admin` or `Manager`
**When** I edit a product
**Then** I can set or update `purchasePrice`

**Given** I am authenticated as an `Operator`
**When** I edit a product
**Then** I cannot view or edit `purchasePrice`
**And** the system does not accept `purchasePrice` updates from Operator actions (server-side enforced)

**Given** I am authenticated as `Admin`, `Manager`, or `Operator`
**When** I delete a product
**Then** the product is removed from the default product list immediately (even offline)
**And** the deletion is marked as pending sync when offline

**Given** I am viewing the product list
**When** I filter by `category`
**Then** only products in that category are shown

**Given** I am viewing the product list
**When** I search by text or barcode
**Then** matching products are shown (at least by `name` and `barcode`)

**Given** I am viewing the product list
**When** I enable the “on alert” filter
**Then** the list shows products that are currently below a threshold
**And** this “on alert” status is computed locally based on current stock vs default thresholds (until Epic 3 introduces configurable thresholds/alerting)

### Story 2.3: Record Stock Entry/Exit (Offline, 3-Click Loop)

As a tenant user,
I want to record a stock entry or stock exit with only type and quantity, even offline,
So that I can update inventory fast during daily operations.

**FRs:** FR4, FR5, FR6, FR22, FR23

**Acceptance Criteria:**

**Given** I am authenticated as `Admin`, `Manager`, or `Operator`
**When** I record a stock movement by selecting a product, choosing type (`entry` or `exit`), and entering `quantity` (> 0)
**Then** the movement is saved locally immediately (even offline)
**And** the UI confirms success without waiting for sync

**Given** I am offline
**When** I record a movement
**Then** the movement is queued/pending sync
**And** the app shows a non-blocking sync status indicator

**Given** I provide an invalid quantity (empty, zero, negative, non-numeric)
**When** I attempt to validate the movement
**Then** the app shows a field-level validation error
**And** the movement is not created locally

**Given** a movement is recorded locally
**When** the movement is saved
**Then** the product’s available stock is recalculated locally immediately (derived from movements)
**And** the updated stock is reflected in the product list/details

**Given** the sync later completes successfully
**When** the server acknowledges the movement
**Then** the movement is marked synced locally
**And** the local stock remains consistent with the server-authoritative result (conflicts handled per sync strategy)

### Story 2.4: Movement History per Product (Newest-First + Infinite Scroll)

As a tenant user,
I want to view a product’s stock movement history sorted from newest to oldest with infinite scroll,
So that I can quickly understand what happened recently, even when offline.

**FRs:** FR7, FR22, FR23

**Acceptance Criteria:**

**Given** I am authenticated as `Admin`, `Manager`, or `Operator`
**When** I open a product’s movement history
**Then** I see movements sorted newest-first
**And** each item shows at least: movement `type` (entry/exit), `quantity`, and timestamp

**Given** I have many movements for a product
**When** I scroll the history
**Then** the UI loads the next page automatically (infinite scroll)
**And** the UI remains responsive

**Given** I am offline
**When** I view a product’s movement history
**Then** I can browse locally stored movements
**And** newly recorded offline movements appear immediately in the history in correct order
**And** items pending sync are visibly distinguishable (e.g., status badge)

**Given** a user has no movements for a product
**When** they open movement history
**Then** an empty state explains there is no history yet and provides a clear CTA to record a movement

### Story 2.5: Auto-Sync Engine + Sync Status (Offline Queue + LWW Conflicts)

As a tenant user,
I want my offline changes to sync automatically with clear status visibility,
So that I can work offline confidently without manual sync actions.

**FRs:** FR24, FR25, FR26

**Acceptance Criteria:**

**Given** I perform changes while offline (create/edit/delete product, record movements)
**When** the device has no connection
**Then** changes are stored locally and queued for sync
**And** the app remains fully usable (no blocking)

**Given** connectivity returns
**When** the app detects it
**Then** the system automatically starts syncing queued changes
**And** the UI shows sync status states at minimum: `syncing`, `upToDate`, `offline`, `error`

**Given** multiple queued items exist
**When** auto-sync runs
**Then** changes are sent idempotently (no duplicate movements on retries)
**And** successful items are marked synced locally
**And** failed items remain queued with retry behavior

**Given** a conflict occurs during sync
**When** the server determines the authoritative result using “last modified wins”
**Then** the client applies the server-authoritative result locally
**And** the user sees only minimal feedback (e.g., “Conflit résolu automatiquement” / “Données mises à jour”) without a blocking conflict UI

**Given** sync encounters a persistent error
**When** retries fail
**Then** the UI shows a clear non-blocking error state
**And** the user can continue working offline with changes still queued

## Epic 3: Thresholds & Alerting (Actionable Alerts)

Users can configure thresholds and the system generates, classifies, notifies, and tracks alerts with triage actions.
**FRs covered:** FR8, FR9, FR10, FR11, FR13, FR14

### Story 3.1: Configure Account Default Stock Thresholds (Absolute Quantities)

As an Admin,
I want to configure default stock thresholds for my tenant,
So that new products have sensible alert levels without extra setup.

**FRs:** FR14

**Acceptance Criteria:**

**Given** I am authenticated as an `Admin` in a tenant
**When** I set default `criticalThreshold` and `attentionThreshold` (absolute quantities, > 0)
**Then** the defaults are saved for my tenant
**And** the system enforces `criticalThreshold < attentionThreshold`
**And** the “healthy/green” state is derived as `stock > attentionThreshold`

**Given** tenant default thresholds exist
**When** a product is created without product-specific thresholds
**Then** the product uses the tenant defaults for alerting calculations

**Given** I am authenticated as a `Manager` or `Operator`
**When** I attempt to change tenant default thresholds
**Then** the system rejects the request as forbidden

**Given** invalid thresholds are submitted (missing, non-numeric, <= 0, or `critical >= attention`)
**When** I attempt to save
**Then** the system rejects with clear validation errors
**And** no changes are persisted

### Story 3.2: Configure Per-Product Thresholds (Optional Override of Defaults)

As a tenant user,
I want to optionally override stock thresholds per product,
So that I can tailor alerts for products with different criticality.

**FRs:** FR8

**Acceptance Criteria:**

**Given** tenant default thresholds exist
**When** I view a product’s threshold settings
**Then** I can see whether the product is using tenant defaults or a custom override

**Given** I am authenticated as `Admin`, `Manager`, or `Operator`
**When** I choose “Use tenant defaults” for a product
**Then** the product has no custom thresholds
**And** alerting uses the tenant default `criticalThreshold` and `attentionThreshold`

**Given** I am authenticated as `Admin`, `Manager`, or `Operator`
**When** I choose “Customize thresholds” for a product and set `criticalThreshold` and `attentionThreshold`
**Then** the custom thresholds are saved for that product
**And** the system enforces `criticalThreshold < attentionThreshold`

**Given** I switch a product from custom thresholds back to tenant defaults
**When** I confirm the change
**Then** the product’s custom thresholds are removed
**And** future alerting uses tenant defaults

**Given** invalid thresholds are submitted (missing, non-numeric, <= 0, or `critical >= attention`)
**When** I attempt to save custom thresholds
**Then** the system rejects with clear validation errors
**And** no custom thresholds are persisted

### Story 3.3: Automatic Alert Generation + R/O/G Classification (One Active Alert per Product)

As a tenant user,
I want alerts to be generated automatically when stock crosses thresholds,
So that I can see which products need attention without manual monitoring.

**FRs:** FR9, FR10

**Acceptance Criteria:**

**Given** a product has an effective `criticalThreshold` and `attentionThreshold` (default or override)
**When** the system computes current stock for that product
**Then** the product alert level is classified as:
**And** `red` if `stock <= criticalThreshold`
**And** `orange` if `criticalThreshold < stock <= attentionThreshold`
**And** `green` if `stock > attentionThreshold`

**Given** a product transitions from `green` to `orange` or `red`
**When** the threshold is reached due to movements or sync updates
**Then** the system creates an active alert for that product (if none exists)
**And** the alert is visually classified by criticality (Red/Orange/Green)

**Given** an active alert already exists for a product
**When** the product’s alert level changes
**Then** the same alert is updated (level, timestamps, current stock)
**And** no additional active alert is created for that product

**Given** a product returns to `green`
**When** stock becomes `> attentionThreshold`
**Then** the system automatically closes the active alert for that product

### Story 3.4: Alert Triage (Handled vs Snoozed/Ignored)

As a tenant user,
I want to mark alerts as handled or temporarily snoozed,
So that I can manage my work without losing critical stock visibility.

**FRs:** FR13

**Acceptance Criteria:**

**Given** I have an active alert for a product
**When** I mark the alert as “handled”
**Then** the alert is marked handled and removed from the active alerts list
**And** the system can reopen/reactivate the alert if the product remains or becomes non-green again

**Given** I have an active alert for a product
**When** I mark the alert as “ignored/snoozed”
**Then** the alert is snoozed for 8 hours
**And** it is hidden from the active alerts list during the snooze window

**Given** an alert is snoozed and the product alert level worsens (orange → red)
**When** the system updates the alert level
**Then** the snooze is cancelled
**And** the alert becomes visible again immediately as `red`

**Given** an alert is snoozed and 8 hours have passed
**When** the product is still `orange` or `red`
**Then** the alert becomes visible again (snooze expires)

**Given** an alert is snoozed and the product returns to `green`
**When** stock becomes `> attentionThreshold`
**Then** the active alert is closed automatically (per alert closure rules)

### Story 3.5: Email Notifications for Critical (Red) Alerts (All Tenant Members)

As a tenant user,
I want email notifications to be sent when an alert becomes critical (red),
So that the whole team is aware of urgent stock risks.

**FRs:** FR11

**Acceptance Criteria:**

**Given** a product alert level changes to `red`
**When** the system updates the active alert
**Then** the system sends an email notification to all active members of the tenant
**And** the email includes at minimum: product name, current stock, alert level (`red`), and a link to open the product/alert in the app

**Given** an active alert for a product remains `red` and is updated multiple times
**When** stock changes but stays `red`
**Then** the system does not spam duplicate emails for the same “became red” event
**And** a new email is sent only if the alert goes back to non-red and later becomes `red` again

**Given** email delivery fails temporarily
**When** sending fails
**Then** the system retries according to a defined retry policy
**And** failures are logged for debugging/monitoring without exposing sensitive data

**Given** a user is removed from the tenant
**When** a future critical alert occurs
**Then** that user does not receive notifications

## Epic 4: Operational Dashboards (Stock Overview + Alerts View + PMI)

Users can view stock and alert dashboards with key stats and the Peace of Mind Index.
**FRs covered:** FR12, FR27, FR28, FR29, FR30

### Story 4.1: Dashboard Stock Overview (Alerts-First + Key Stats)

As a tenant user,
I want a dashboard that shows critical and attention alerts first plus key stats,
So that I can know what needs action immediately.

**FRs:** FR27, FR28, FR29

**Acceptance Criteria:**

**Given** I am authenticated as `Admin`, `Manager`, or `Operator`
**When** I open the dashboard
**Then** I see an alerts-first layout with `red` alerts displayed before `orange` alerts
**And** each alert entry clearly shows product name and criticality (R/O/G visual system)

**Given** there are multiple active alerts
**When** I view the dashboard
**Then** alerts are sorted by criticality and urgency (red first, then orange)

**Given** I view the dashboard
**When** key stats are displayed
**Then** I can see at minimum: total number of products, number of active alerts, and PMI indicator

**Given** there are no active alerts
**When** I open the dashboard
**Then** I see a reassuring empty state (green)
**And** a clear CTA to record a movement or view inventory

### Story 4.2: Alerts Dashboard (Active Alerts Sorted by Priority)

As a tenant user,
I want a dedicated alerts dashboard listing all active alerts sorted by priority,
So that I can triage and resolve stock risks efficiently.

**FRs:** FR12

**Acceptance Criteria:**

**Given** I am authenticated as `Admin`, `Manager`, or `Operator`
**When** I open the Alerts dashboard
**Then** I see a list of active alerts sorted by priority (red first, then orange)
**And** each alert shows product name, criticality, current stock, and last updated time

**Given** an alert is `red` or `orange`
**When** I take triage actions from the alerts list
**Then** I can mark it as handled or snoozed (per triage rules)
**And** the list updates immediately to reflect the new state

**Given** there are no active alerts
**When** I open the Alerts dashboard
**Then** I see a reassuring empty state and a CTA to view inventory or record a movement

**Given** there are many active alerts
**When** I scroll
**Then** the list supports pagination/infinite scroll and remains responsive

### Story 4.3: PMI Indicator (MVP Formula Based on R/O/G Distribution)

As a tenant user,
I want to see a Peace of Mind Index (PMI) on the dashboard,
So that I can quickly gauge overall stock health at a glance.

**FRs:** FR30

**Acceptance Criteria:**

**Given** products can be classified as `green`, `orange`, or `red` based on thresholds
**When** the dashboard is displayed
**Then** the system computes and displays a PMI score between 0 and 100
**And** the PMI uses the MVP formula:
**And** `PMI = clamp(0..100, round(100 - (percentRed * 40 + percentOrange * 15)))`

**Given** the tenant has 0 products
**When** PMI is displayed
**Then** PMI is shown as 100 (or “N/A”) with a clear explanation

**Given** PMI is displayed
**When** the user views it
**Then** the UI provides a short explanation of what influences PMI (red and orange products lower it)

## Epic 5: Bulk Product Import (CSV)

Users can import products via CSV with validation and clear error reporting.
**FRs covered:** FR38, FR39

### Story 5.1: Import Products via CSV (Validate + Error Report)

As an Admin or Manager,
I want to bulk import products from a CSV file with validation and clear error reporting,
So that I can onboard an existing catalog quickly and safely.

**FRs:** FR38, FR39

**Acceptance Criteria:**

**Given** I am authenticated as an `Admin` or `Manager`
**When** I upload a CSV file for import
**Then** the system parses the CSV and validates required columns and data types
**And** the system creates products for valid rows

**Given** some rows are invalid (missing required fields, invalid numeric values, duplicate barcode rules, etc.)
**When** I run the import
**Then** the system reports row-level errors (row number + field + message)
**And** the user can download or view an error report

**Given** all rows are invalid
**When** I run the import
**Then** no products are created
**And** the user receives a clear error summary

**Given** I am authenticated as an `Operator`
**When** I attempt to access CSV import
**Then** the system rejects the request as forbidden

## Epic 6: Subscription Plans, Quotas & Invoicing (Post-MVP)

Users can view/change plans; the system enforces plan limits and generates invoices.
**FRs covered:** FR33, FR34, FR35, FR36, FR37

### Story 6.1: View Current Subscription Plan + Limits

As a tenant Admin,
I want to view my current subscription plan and its limits,
So that I understand what my account includes and when I need to upgrade.

**FRs:** FR34

**Acceptance Criteria:**

**Given** I am authenticated as an `Admin` in a tenant
**When** I open the subscription/billing screen
**Then** I can see my current plan (Free / Starter / Pro)
**And** I can see the active limits: max products and max users
**And** I can see my current usage vs limits (e.g., “12/20 products”, “1/1 users”)

**Given** I am authenticated as a `Manager` or `Operator`
**When** I open the subscription/billing screen
**Then** I can view the current plan and limits
**And** I cannot change the plan

### Story 6.2: Enforce Plan Limits (Products + Users)

As the system,
I want subscription plan limits to be enforced automatically,
So that accounts cannot exceed what they pay for.

**FRs:** FR33, FR36

**Acceptance Criteria:**

**Given** a tenant has a plan with limits (max products, max users)
**When** the tenant attempts to create a product beyond the max products limit
**Then** the system rejects the action with a clear limit error
**And** provides a CTA/message to upgrade the plan

**Given** a tenant has a plan with limits (max products, max users)
**When** the tenant attempts to invite/add a user beyond the max users limit
**Then** the system rejects the action with a clear limit error
**And** provides a CTA/message to upgrade the plan

**Given** a tenant upgrades to a plan with higher limits
**When** the upgrade is confirmed
**Then** previously blocked create/invite actions become allowed up to the new limits

### Story 6.3: Upgrade/Downgrade Subscription Plan via Stripe Checkout

As a tenant Admin,
I want to upgrade or downgrade my plan using Stripe,
So that I can adjust limits as my business needs evolve.

**FRs:** FR35

**Acceptance Criteria:**

**Given** I am authenticated as an `Admin` in a tenant
**When** I choose a new plan (Free / Starter / Pro) from the billing screen
**Then** the system starts a Stripe Checkout flow for the tenant
**And** I am redirected to Stripe to confirm the change

**Given** Stripe confirms the subscription change via webhook
**When** the webhook is processed
**Then** the tenant’s plan is updated server-side
**And** the new limits become effective

**Given** the Stripe flow is cancelled or fails
**When** I return to the app
**Then** the tenant’s plan remains unchanged
**And** I see a clear message about the cancellation/failure

### Story 6.4: Access Billing Portal for Invoices + Payment Methods

As a tenant Admin,
I want to access a billing portal to view invoices and manage payment methods,
So that I can handle billing tasks without contacting support.

**FRs:** FR37

**Acceptance Criteria:**

**Given** I am authenticated as an `Admin` in a tenant
**When** I open the billing screen and choose “Manage billing”
**Then** the system redirects me to the Stripe Billing Portal for my tenant

**Given** invoices exist for my subscription
**When** I view billing in the portal
**Then** I can access my invoices (e.g., monthly invoices) for download/viewing

**Given** I am authenticated as a `Manager` or `Operator`
**When** I attempt to access the billing portal
**Then** the system rejects the request as forbidden
