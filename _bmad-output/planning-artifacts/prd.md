---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
inputDocuments:
  - /home/sokoshy/Documents/Project/gestionnaire-stock/_bmad-output/planning-artifacts/product-brief-gestionnaire-stock-2026-02-01.md
  - /home/sokoshy/Documents/Project/gestionnaire-stock/_bmad-output/planning-artifacts/research/market-inventory-management-small-merchants-bakeries-restaurants-research-2026-02-01.md
  - /home/sokoshy/Documents/Project/gestionnaire-stock/_bmad-output/planning-artifacts/research/domain-inventory-management-small-merchants-bakeries-restaurants-research-2026-02-01.md
  - /home/sokoshy/Documents/Project/gestionnaire-stock/_bmad-output/planning-artifacts/research/technical-inventory-management-small-merchants-bakeries-restaurants-research-2026-02-01.md
  - /home/sokoshy/Documents/Project/gestionnaire-stock/_bmad-output/brainstorming/brainstorming-report.md
workflowType: prd
project_name: gestionnaire-stock
user_name: Sokoshy
date: '2026-02-01'
documentCounts:
  briefCount: 1
  researchCount: 3
  brainstormingCount: 1
  projectDocsCount: 0
classification:
  projectType: SaaS B2B
  domain: Inventory Management / Retail / Food service
  complexity: Medium
  projectContext: Greenfield
---

# Product Requirements Document - StockZen (gestionnaire-stock)

**Author:** Sokoshy
**Date:** 2026-02-01

## Success Criteria

### User Success

**Core User Outcomes:**
- **Zero Stockouts**: 0 stockouts per month for critical products (RED level)
- **Time Efficiency**: Reduce inventory management time from 30 minutes → 5-10 minutes per day
- **Peace of Mind Index (PMI)**: Tranquility score > 80/100
  - Components: stress reduction (40%), stock level confidence (30%), ease of use (30%)
- **Customer Satisfaction**: 50%+ reduction in customer disappointments due to stockouts

**Success Moments:**
- First "green alert" with no action required → user feels in control
- "3 days" prediction preventing a stockout → "aha!" moment
- Daily update completed in < 2 minutes → relief

### Business Success

**3-Month Targets (MVP Launch):**
- **User Base**: 50 active users (connecting at least 3x/week)
- **Conversion**: Free → Paid conversion rate: 40-60%
- **Revenue**: MRR (Monthly Recurring Revenue): €500-1000
- **Satisfaction**: NPS (Net Promoter Score) > 40
- **Activation**: Activation rate (first stock created) > 70%

**12-Month Targets (Growth Phase):**
- **User Base**: 150-200 active users
- **Revenue**: MRR: €3000-5000
- **Profitability**: Positive cash flow / profitability achieved
- **Retention**: D30 Retention > 30% (active users after 30 days)
- **Expansion**: Upgrade rate to higher plans > 15%

### Technical Success

**Performance Metrics:**
- **Application Response Time**: < 2 seconds for main actions
- **Uptime**: 99.5% (excluding planned maintenance)
- **Offline Capability**: 100% offline operation with automatic sync
- **Data Integrity**: 0 data loss, reliable synchronization
- **Cross-Platform**: Web responsive + native mobile support (iOS/Android)

**Security & Compliance:**
- **Data Protection**: GDPR compliance / Data Protection Act
- **Access Control**: Secure authentication, granular roles
- **Backup**: Daily automated backups with < 4h restoration

### Measurable Outcomes

**Key Performance Indicators (KPIs):**
1. **Stock Accuracy**: < 5% variance between physical and system stock
2. **Alert Accuracy**: True positive rate for RED alerts > 90%
3. **Prediction Accuracy**: "In 3 days" predictions correct > 70%
4. **Daily Active Users**: % of users active daily > 40%
5. **Feature Adoption**: % of users using R/Y/G alerts > 80%
6. **Support Tickets**: < 5 critical tickets per week (post-launch)

## Product Scope

### MVP - Minimum Viable Product

**Must-Have Features (Core Value):**
1. **Product Management**
   - Product CRUD (name, category, unit, price)
   - Barcode/QR code management
   - 3 configurable criticality levels (R/O/V)

2. **Stock Movements**
   - Stock entries (supplier receipts)
   - Stock exits (sales, consumption)
   - Complete movement history

3. **Intelligent Alert System**
   - Automatic threshold-based alerts (R/O/V)
   - Push/email notifications
   - Active alerts dashboard

4. **Dashboard & Analytics**
   - Stock overview
   - Products on alert (sorted by criticality)
   - Simple movement history

5. **Technical Foundation**
   - Offline-first architecture
   - Cloud synchronization
   - User authentication
   - Responsive web app (PWA)

**MVP Success Criteria:**
- Can manage 20-50 active products
- Alerts work without major false positives
- Daily update time < 5 minutes
- Works offline in a bakery without Wi-Fi

### Growth Features (Post-MVP)

**Phase 2 (Months 4-8):**
1. **Predictive Intelligence**
   - "In 3 days" algorithm for stockout predictions
   - Seasonal pattern detection
   - Restocking suggestions

2. **Third-Party Integrations**
   - QuickBooks / Pennylane (accounting)
   - Shopify / WooCommerce (e-commerce)
   - Barcode scanner via mobile camera

3. **Collaboration**
   - Multi-users (3-5 per account)
   - Advanced roles and permissions
   - Action audit trail

4. **Reporting**
   - Consumption reports
   - Loss analysis
   - CSV/PDF export

**Phase 3 (Months 9-12):**
1. **Multi-Locations**
   - Multiple shop/warehouse management
   - Inter-site stock transfers
   - Data consolidation

2. **Suppliers & Purchasing**
   - Supplier database with contacts
   - Order tracking
   - Automatic suggested orders

### Vision (Future)

**Long-term Roadmap (12+ months):**
1. **Mobile Native Apps**
   - Native iOS/Android applications
   - Ultra-fast camera scanning
   - Kiosk mode for in-store tablets

2. **Advanced AI/ML**
   - Weather and local event-based predictions
   - Automatic anomaly detection
   - Automatic stock level optimization

3. **Integrated Ecosystem**
   - Supplier marketplace
   - Integrated deliveries
   - Supplier payments via platform

4. **Internationalization**
   - Multi-language support (FR, EN, ES, DE...)
   - Country-specific regulatory compliance
   - Local market adaptations

5. **"Panic Mode" (V2 Innovation)**
   - Emergency button for critical situations
   - Real-time human/AI support
   - Collaborative stock crisis resolution

## User Journeys

### Bernard Martin - The Artisan Baker

**Opening Scene:**
It's 5 AM in Paris. Bernard, 45, enters his bakery "Au Levain d'Or". It's still dark outside. On his phone, an orange notification: "Unsalted butter - 2 days before stockout". Bernard smiles. Yesterday, he would have panicked. Today, he knows he has time to order.

**Rising Action:**
Bernard opens StockZen. In 3 clicks, he sees his dashboard:
- 🟢 T55 Flour: stock OK for 5 days
- 🟠 Unsalted butter: orange alert (threshold reached)
- 🔴 Fresh yeast: URGENT - order this morning!

He scans the yeast barcode with his phone, enters "2kg" as stock exit. The app automatically calculates: "Remaining stock: 500g - Order recommended today". Bernard presses the green "Order" button which sends him directly to his regular supplier.

**Climax:**
The red alert disappears, replaced by a calming green. Bernard receives a notification: "Yeast order confirmed - Delivery tomorrow 6 AM". He can now prepare his croissants stress-free. The PMI (Peace of Mind Index) shows 85/100.

**Resolution:**
Bernard finishes his daily update in 4 minutes (vs 25 min before with his Excel spreadsheet). He focuses on what he loves: artisanal baking. No more stress from surprise stockouts.

**This journey reveals:**
- Dashboard with visual R/O/V alerts
- Fast barcode scanning
- Automatic threshold calculation
- Direct supplier links
- Order history

---

### Fleur Dubois - The Creative Florist

**Opening Scene:**
Tuesday morning, flower market. Fleur, 32, looks at her roses starting to wilt. Her paper notebook is soaked from the rain. She sighs - impossible to read her notes. She opens StockZen on her tablet, waterproof in her pocket.

**Rising Action:**
Fleur checks her "Perishables Radar":
- 🔴 Red roses: 2 days freshness remaining
- 🟢 Gypsophila: 5 days OK
- 🟠 Tulips: 3 days - sell priority

She decides to create "flash" bouquets with roses at -30%. She enters "8 bouquets" as stock exit. StockZen automatically calculates her margin: "Remaining margin on roses: €12". Fleur validates - it's profitable.

**Climax:**
At the end of the day, Fleur looks at her margin graph. Thanks to early alerts, she avoided €45 in losses this week (roses sold in bouquets vs roses thrown away). A notification reassures her: "Supplier FleurExpo: Thursday 7 AM delivery confirmed".

**Resolution:**
Fleur closes her shop serene. She no longer fears waste. Her paper notebook is stored in a drawer - she doesn't touch it anymore. StockZen even predicts that "Saturday = Mother's Day = +40% need for roses". She already planned her order.

**This journey reveals:**
- DLC (use-by date) management
- Real-time margin calculation
- Promotion suggestions
- Event-based predictions (holidays)
- Tablet/mobile adapted mode

---

### Marc Lefebvre - The Organized Restaurateur

**Opening Scene:**
Lunch service finished. Marc, 28, counts stock in the "Chez Marco" kitchen. His chef shouts: "We're out of parmesan!" Marc panics - he forgot to order. He opens StockZen, the interface all red.

**Rising Action:**
Marc discovers why: he didn't scan the 2kg parmesan exit yesterday evening. The red alert "Parmesan - Imminent stockout" has been flashing for 12 hours. He ignored it in the service rush.

He manually enters "2kg parmesan" as exit (yesterday), and "5kg" as entry (emergency order). StockZen updates: "Lunch service food cost: €127". Marc compares with his revenue: "Profitability: 68%". It's good.

**Climax:**
Marc configures a new alert: "Parmesan - Critical threshold: 3kg" (instead of 2kg). He shares the stock with his chef via the app: "Multi-user activated - Chef access: read-only". No more surprises.

**Resolution:**
At 6 PM, Marc receives a prediction: "With your usual Friday evening traffic, you'll be in RED alert on white wine tomorrow at 8 PM". Marc immediately orders 12 bottles. He sleeps peacefully.

**This journey reveals:**
- Multi-users with permissions
- Food cost tracking vs revenue
- Configurable alerts per product
- Correction mode (retroactive entries)
- History-based predictions

---

### Sophie Moreau - The Multi-Site Administrator

**Opening Scene:**
Sophie, 38, manages 3 decoration stores "Maison Zen". She's in her office, coffee in hand. Her phone rings: "The Lyon store is out of glue". Sophie opens StockZen in "Consolidated View" mode.

**Rising Action:**
Sophie sees at a glance:
- Paris: 🟢 Stock OK (34 active products)
- Lyon: 🔴 3 red alerts (glue, wallpaper, brushes)
- Marseille: 🟠 2 orange alerts

She clicks on Lyon. Detail: white glue has been out of stock for 2 days. Sophie transfers 5 tubes from Paris to Lyon via the app: "Inter-site transfer - Delivery tomorrow". Transport cost: €8. Cost of a lost sale: €120. Easy.

**Climax:**
Sophie configures "Automatic Rules":
- If stock < 5 units: orange alert
- If stock < 2 units: red alert + store manager email
- If stockout > 24h: immediate Sophie notification

She adds a new employee in Lyon: "Thomas - Access: entries/exits only". No access to purchase prices. Security guaranteed.

**Resolution:**
At the end of the week, Sophie generates an automatic report: "Consumption by site - Week 12". Paris: 89% turnover. Lyon: 72% (management problem). Marseille: 95% (excellent). She calls the Lyon manager for coaching.

**This journey reveals:**
- Consolidated multi-site view
- Inter-site stock transfers
- Role and permission management
- Customizable alert rules
- Performance reports by site
- Action audit trail

---

### Thomas Petit - The Operations Employee

**Opening Scene:**
Thomas, 22, versatile employee at the Lyon store. He just arrived for his 2 PM-10 PM shift. His manager gave him "simple" access to StockZen: just what he needs to do his job, without seeing prices or strategy.

**Rising Action:**
Thomas opens the app. Ultra-simplified interface:
- 3 big buttons: "Stock Entry" | "Stock Exit" | "View Alerts"

A customer arrives with a return: "This wallpaper doesn't suit me". Thomas clicks "Stock Exit", scans the barcode, enters "-1" (supplier return). In 10 seconds, it's done. Stock updates automatically.

**Climax:**
Later, a delivery arrives. 15 boxes. Thomas uses "Fast Receiving" mode: he scans each barcode, the app counts automatically. "15/15 items received". He validates. The red alerts from this morning turn green. The store can sell again.

**Resolution:**
Thomas never needs to search through complex menus. Everything is 1-2 clicks. He can even use the app without internet connection (offline mode) - data syncs when WiFi returns. He focuses on customers, not paperwork.

**This journey reveals:**
- Simplified interface for operators
- Offline mode for receiving
- Fast scanning with auto-counting
- Customer return management
- Limited permissions (selective read/write)
- Deferred synchronization

---

### Journey Requirements Summary

**Capabilities revealed by journeys:**

**Core User Experience (Bernard, Fleur, Marc):**
1. Dashboard with visual R/O/G alerts
2. Barcode scanning (phone camera)
3. Automatic threshold and margin calculation
4. DLC (use-by date) management
5. Event and history-based predictions
6. Multi-users with differentiated permissions
7. Configurable push/email notifications
8. Complete movement history

**Administrator/Manager (Sophie):**
9. Consolidated multi-site view
10. Inter-site stock transfers
11. Alert automation rules
12. Fine role and permission management
13. Performance reports and analytics
14. Action audit trail and traceability
15. Threshold configuration per product/store

**Operator/Employee (Thomas):**
16. Ultra-simplified interface (3 main buttons)
17. Offline mode with auto sync
18. Fast receiving by scanning
19. Customer return management
20. Limited access (hiding sensitive prices)
21. Possible kiosk/tablet mode

**Technical Requirements Implied:**
- Essential offline-first architecture
- Real-time cloud synchronization
- Granular permission management (RBAC)
- Multi-device support (mobile + tablet)
- API for future supplier integrations

## Domain-Specific Requirements

### V1 (MVP) - Simplified
- **Currency**: EUR only (France market)
- **Products**: Standard management without advanced traceability
- **Focus**: Simplicity and speed of use

### V2 (Post-MVP) - Enrichment
- **DLC Alerts**:
  - "Perishable product" flag at creation
  - Expiration date entry
  - Automatic alerts: 7d, 3d, 1d before expiration
  - Products to monitor dashboard
- **Lot traceability**: To be evaluated based on user demand
- **Multi-currency**: EUR, USD, GBP support for Europe expansion

## Innovation & Novel Patterns

### Detected Innovation Areas

**1. 3-Clicks Maximum UX**
- **Innovation**: Drastic reduction of user friction
- **Assumed challenge**: 80-90% of actions in maximum 3 clicks vs 10+ clicks for competition
- **Impact**: Transformation of inventory management (dreaded task) into fluid experience
- **Validation**: User testing with target personas (bakers, florists, restaurateurs)

**2. R/Y/G Alert System (Uber Inspiration)**
- **Innovation**: Visual prioritization by criticality (Red/Orange/Green)
- **Cross-sector learning**: Adaptation of Uber model (ride prioritization) to inventory
- **Differentiation**: Instead of binary alerts (yes/no), intelligent urgency gradation
- **Added value**: Cognitive load reduction - user immediately knows what to do

**3. "In 3 Days" Predictions (Netflix Inspiration)**
- **Innovation**: Shift from reactive to proactive
- **Paradigm shift**: Netflix anticipates what you want to watch → StockZen anticipates your stockouts
- **Business impact**: "In 3 days you'll be out of stock" vs "You're out of stock"
- **Competitive advantage**: No competitor offers real-time predictions in this segment

**4. Peace of Mind Index (PMI)**
- **Innovation**: Unique emotional metric
- **Concept**: Measures regained serenity, not just managed stock
- **Business model impact**: Selling "peace of mind" rather than "software"
- **Components**: Stress reduction (40%) + Stock confidence (30%) + Ease of use (30%)

**5. "Panic Mode" (V2)**
- **Innovation**: Emergency button for stock crises
- **Premium service**: Real-time human/AI support
- **Differentiation**: From autonomous tool to accompanied service
- **Value**: Collaborative critical situation resolution

### Market Context & Competitive Landscape

**Current Inventory Management (2024):**
- **Odoo/Complex ERPs**: Too heavy for small merchants (learning curve > 1 month)
- **Sortly/Zoho**: Simple but not intelligent (no prediction, no prioritization)
- **Excel/Spreadsheets**: Universal but inefficient (manual errors, no synchronization)

**Identified Gap:**
No solution combines **extreme simplicity** (3 clicks) + **predictive intelligence** + **positive emotional experience** (PMI)

**StockZen Positioning:**
- "Odoo's intelligence with Sortly's simplicity"
- "Anticipate your stockouts before they happen"
- "Transform your stress into serenity"

### Validation Approach

**Hypotheses to validate:**
1. **H1**: Merchants will pay to reduce their stress (PMI > 80)
   - Validation: Monthly surveys + user interviews
   - Metric: NPS > 40, D30 Retention > 30%

2. **H2**: "In 3 days" predictions create real value
   - Validation: Stockout reduction rate (target: 50%)
   - Metric: Prediction accuracy > 70%

3. **H3**: 3-click UX increases adoption vs competition
   - Validation: A/B onboarding tests, update time
   - Metric: Activation > 70%, Daily usage time < 5 min

**Validation plan:**
- **MVP Launch**: 50 beta users (bakeries, florists, restaurants)
- **Feedback loop**: Weekly interviews + behavioral analytics
- **Pivot triggers**: If retention < 20% at D30 or NPS < 30, re-evaluate UX/features

### Risk Mitigation

**Risk 1: Copies by established competitors**
- **Mitigation**: Protect prediction algorithm (intellectual property)
- **Timing**: Rapid momentum - become the "Kleenex" of the category before competition reacts

**Risk 2: Predictions are inaccurate**
- **Mitigation**: Fallback to classic alerts (R/Y/G) if prediction < 70% accuracy
- **Communication**: "Suggestion based on your history" (not "certainty")

**Risk 3: Merchants don't adopt the "proactive" mindset**
- **Mitigation**: Reactive mode available (classic alerts) in parallel
- **Education**: Progressive onboarding - start with simple alerts, introduce predictions gradually

**Risk 4: Offline mode doesn't sync correctly**
- **Mitigation**: Data conflicts handled automatically (last modified wins)
- **Clear UI**: Visual sync status indicator, resolved conflict notifications

**Fallback Strategy:**
If "predictions" innovation doesn't work, the product remains viable with:
- 3-clicks UX alone (already differentiating)
- R/Y/G system (already superior to competition)
- Offline mode (technical differentiator)

## SaaS B2B Specific Requirements

### Project-Type Overview

**StockZen** is a B2B SaaS inventory management platform for small merchants (bakeries, florists, restaurants). Multi-tenant architecture with data isolation per customer account.

**Economic model**: Freemium with 5 progressive subscription tiers (Free → Starter → Pro → Business → Enterprise).

### Technical Architecture Considerations

**Multi-Tenancy Model:**
- **Architecture**: Tenant isolated by account (separate database or schema isolation)
- **Scalability**: Support for 1000+ independent tenants
- **Security**: Strict data isolation (no inter-tenant leakage)
- **Customization**: Logo, colors per tenant (V2)

**RBAC Matrix (Role-Based Access Control):**

| Role | Permissions | Use Case |
|------|-------------|----------|
| **Super Admin** | Full access, billing, system configuration | Founder/CTO |
| **Admin** | User management, alert configuration, complete reports | Store manager |
| **Manager** | Product CRUD, stock movements, cost consultation | Chef/Manager |
| **Operator** | Stock entries/exits only, no price access | Store employee |
| **Read-only** | Stock consultation only | External accountant |

**Subscription Tiers:**

| Plan | Price | Products | Users | Special Features |
|------|-------|----------|-------|------------------|
| **Free** | €0 | 20 | 1 | Core only |
| **Starter** | €9 | 50 | 2 | Email support |
| **Pro** | €19 | 150 | 3 | "3 days" predictions, push notifs |
| **Business** | €39 | Unlimited | 5 | Multi-sites, advanced reports |
| **Enterprise** | €99+ | Unlimited | 10+ | 99.9% SLA, internal API, dedicated support |

**Integration List:**

**Phase 1 (V1)**: None - Focus core product

**Phase 2 (V2)**:
- QuickBooks / Pennylane (accounting export)
- Shopify / WooCommerce (e-commerce sync)
- Native barcode scanner (mobile camera)

**Phase 3 (V3)**:
- **Internal API** (reserved for client company internal development)
- Webhooks for external notifications
- ERP connectors (SAP, Odoo API)

**Compliance Requirements:**
- **GDPR**: EU user data, right to erasure, consent
- **Security**: Data encryption (at rest + in transit), audit logs
- **Availability**: 99.5% uptime SLA (99.9% for Enterprise)

### Implementation Considerations

**Onboarding Strategy:**
- **Self-service**: Registration + first product in < 5 minutes
- **Guided tour**: Interactive tutorial for the 3 main actions
- **Templates**: Pre-configured profiles (bakery, florist, restaurant)

**Billing & Payments:**
- **Stripe**: Recurring credit card payment (monthly/annual -10%)
- **Invoicing**: Automatic PDF invoices (France compliant)
- **Trials**: 14 days Pro free, no credit card required

**Data Migration:**
- **CSV Import**: Standard template for migration from Excel
- **Internal API** (V3): Programmatic migration for large accounts

**Support & SLA:**
- **Free/Starter**: Documentation + Email (48h)
- **Pro/Business**: Chat + Email (24h)
- **Enterprise**: Phone + Dedicated support (4h)

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Experience MVP - Validate that "3 clicks maximum" UX + R/Y/G alerts creates adoption and reduces merchant stress

**Resource Requirements:**
- **Team size**: 2-3 full-stack developers
- **Skills needed**: React/Vue.js, Node.js/Python, PostgreSQL, PWA/offline expertise
- **Timeline**: 3-4 months for MVP
- **Indicative budget**: €30K-50K (development) + €5K/month (infrastructure)

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**
1. **Bernard (Baker)**: Simple product management, basic alerts, offline mode
2. **Fleur (Florist)**: Perishable alerts (V1 basic without complex DLC), dashboard
3. **Marc (Restaurateur)**: Basic multi-users (2-3), simple permissions

**Must-Have Capabilities:**

**Core Features:**
- ✅ Product management (CRUD): name, category, unit, price, barcode
- ✅ Stock movements: entries/exits with history
- ✅ R/Y/G alert system: 3 configurable criticality levels
- ✅ Simple dashboard: overview + products on alert
- ✅ Authentication: email/password, basic roles (Admin/Manager/Operator)

**Technical Foundation:**
- ✅ Offline-first architecture (PWA)
- ✅ Cloud synchronization (real-time when online)
- ✅ Multi-tenancy (data isolation by account)
- ✅ Responsive web application (mobile-first)
- ✅ 3 tiers: Free (20 products/1 user), Starter (50/2), Pro (150/3)

**Explicitly NOT in MVP:**
- ❌ "In 3 days" predictions (complex algorithm - V2)
- ❌ Camera barcode scanning (heavy library - V2)
- ❌ Third-party integrations (QuickBooks, Shopify - V2)
- ❌ Multi-sites (V2)
- ❌ "Panic Mode" (V2)
- ❌ Lot/DLC advanced traceability (V2)
- ❌ Internal API (V3)

### Post-MVP Features

**Phase 2 (Months 4-8) - Growth:**

**Intelligence & UX:**
- "In 3 days" predictions (basic ML algorithm)
- Native barcode scanning (mobile camera)
- Automatic restocking suggestions
- Push notifications (mobile)

**Collaboration & Scale:**
- Multi-sites (Business plan)
- 5 users per account (Business)
- Advanced reports (CSV/PDF export)
- Integrations: QuickBooks, Shopify basic

**Food Service Specific:**
- DLC (use-by dates) management with 7d/3d/1d alerts
- "Perishable product" flag

**Phase 3 (Months 9-12) - Expansion:**

**Platform & Enterprise:**
- Internal API (reserved for Enterprise client internal dev)
- Webhooks for external notifications
- ERP connectors (SAP, Odoo)
- 99.9% SLA + phone support (Enterprise)

**Advanced AI:**
- Weather/local event-based predictions
- Automatic anomaly detection
- Stock level optimization

**"Panic Mode" (V2 Innovation):**
- Emergency button for critical situations
- Real-time human/AI support
- Collaborative crisis resolution

### Risk Mitigation Strategy

**Technical Risks:**
- **Risk**: Offline/cloud sync creates data conflicts
- **Mitigation**: "Last modified wins" strategy + clear UI on resolved conflicts + automatic backup

- **Risk**: Performance degrades with 1000+ products
- **Mitigation**: Pagination, lazy loading, optimized PostgreSQL indexing from the start

**Market Risks:**
- **Risk**: Merchants won't pay €19/month
- **Mitigation**: A/B pricing test (€9 vs €19), aggressive freemium, focus on measurable ROI (PMI)

- **Risk**: 3-click UX adoption insufficient
- **Mitigation**: Guided onboarding, business templates, "time per action" metric tracking

**Resource Risks:**
- **Risk**: Team underestimates offline-first complexity
- **Mitigation**: 2-week technical spike before MVP, validated sync POC

- **Risk**: Delays exceeded, features cut
- **Mitigation**: Locked MVP scope, feature freeze 1 month before launch, fixed deadline

## Functional Requirements

### 1. Product and Stock Management

- **FR1**: Users can create products with name, category, unit, price, and barcode
- **FR2**: Users can modify and delete existing products
- **FR3**: Users can view the list of all their products with filters (category, alert, search)
- **FR4**: Users can record stock entries (supplier receipts)
- **FR5**: Users can record stock exits (sales, consumption, losses)
- **FR6**: System automatically calculates available stock after each movement
- **FR7**: Users can view complete movement history per product
- **FR8**: Users can configure 3 stock threshold levels per product (critical/attention/healthy)

### 2. Intelligent Alert System

- **FR9**: System automatically generates alerts when a threshold is reached
- **FR10**: Alerts are visually classified by criticality (Red/Orange/Green)
- **FR11**: Users receive email notifications for critical alerts
- **FR12**: Users can view a dashboard of active alerts sorted by priority
- **FR13**: Users can mark an alert as "handled" or "ignored"
- **FR14**: Administrators can configure default alert thresholds for their account

### 3. User Management and Authentication

- **FR15**: Users can create an account with email and password
- **FR16**: Users can log in and log out of the application
- **FR17**: Users can reset their password
- **FR18**: Administrators can invite other users to join their account
- **FR19**: Administrators can assign roles to users (Admin/Manager/Operator)
- **FR20**: System controls access to features based on user role
- **FR21**: Operators cannot see product purchase prices

### 4. Offline-First Architecture

- **FR22**: Application works entirely without internet connection (offline mode)
- **FR23**: Data entered offline is stored locally on the device
- **FR24**: System automatically synchronizes data when connection returns
- **FR25**: Users can see synchronization status (sync in progress/up to date/conflict)
- **FR26**: System resolves data conflicts ("last modified wins" strategy)

### 5. Dashboard and Visualization

- **FR27**: Users can view a stock overview dashboard
- **FR28**: Dashboard displays products on alert by criticality order
- **FR29**: Users can see basic statistics (number of products, active alerts)
- **FR30**: System displays the PMI (Peace of Mind Index) indicator in the dashboard

### 6. Multi-Tenancy and Isolation

- **FR31**: Each customer account is isolated from others (separate data)
- **FR32**: Users can only access their own account data
- **FR33**: System automatically applies subscription plan limits (max products, max users)

### 7. Subscription and Billing

- **FR34**: Users can view their current subscription plan
- **FR35**: Users can upgrade/downgrade their plan
- **FR36**: System applies plan restrictions (Free: 20 products/1 user, Starter: 50/2, Pro: 150/3)
- **FR37**: Users receive automatic monthly invoices

### 8. Import and Migration

- **FR38**: Users can bulk import products via CSV file
- **FR39**: System validates CSV format and reports import errors

## Non-Functional Requirements

### Performance

**Response Time:**
- **NFR-P1**: Main actions (create product, stock entry/exit) must complete in < 2 seconds (95th percentile)
- **NFR-P2**: Dashboard must load in < 3 seconds on 3G connection
- **NFR-P3**: Offline/online synchronization must process 100 movements in < 10 seconds

**Resources:**
- **NFR-P4**: Application must work on smartphone with minimum 2GB RAM
- **NFR-P5**: Application size < 50MB (installable PWA)

### Security

**Data Protection:**
- **NFR-S1**: All data encrypted in transit (TLS 1.3 minimum)
- **NFR-S2**: All data encrypted at rest (AES-256)
- **NFR-S3**: Passwords hashed with bcrypt (cost 12 minimum)
- **NFR-S4**: Multi-factor authentication available for Enterprise accounts

**Access Control:**
- **NFR-S5**: Strict multi-tenant isolation (no inter-account access possible)
- **NFR-S6**: Audit logs of all sensitive actions (logins, stock modifications)
- **NFR-S7**: Session timeout after 30 minutes of inactivity

**Compliance:**
- **NFR-S8**: GDPR compliance (right to erasure, data portability)
- **NFR-S9**: Daily automatic backup with 30-day retention

### Scalability

**Growth:**
- **NFR-SC1**: Support for 1000+ simultaneously active accounts (MVP)
- **NFR-SC2**: Support for 10,000+ accounts (Growth phase)
- **NFR-SC3**: Each account can manage up to 1000 products (Pro/Business)
- **NFR-SC4**: Architecture allowing horizontal scaling (adding servers without downtime)

### Availability & Reliability

**Availability:**
- **NFR-A1**: 99.5% uptime (excluding planned maintenance < 4h/month)
- **NFR-A2**: 99.9% SLA for Enterprise plans (response time < 4h)
- **NFR-A3**: Offline mode guarantees 100% operation without connection

**Reliability:**
- **NFR-A4**: 0 data loss (ACID transactional)
- **NFR-A5**: RPO (Recovery Point Objective) < 5 minutes
- **NFR-A6**: RTO (Recovery Time Objective) < 2 hours

### Maintainability & Support

**Maintenance:**
- **NFR-M1**: Continuous deployment without downtime (blue-green deployment)
- **NFR-M2**: Centralized logs for debugging (90-day retention)
- **NFR-M3**: Real-time monitoring (alerts if errors > 1% or latency > 3s)

**Support:**
- **NFR-M4**: Complete API documentation (OpenAPI/Swagger)
- **NFR-M5**: Integrated user guide in the app (contextual)

### Usability (UX Quality)

**Accessibility:**
- **NFR-U1**: Responsive interface (mobile 320px → desktop 1920px)
- **NFR-U2**: Color contrast compliant with WCAG 2.1 AA
- **NFR-U3**: Keyboard navigation possible (no mouse)
- **NFR-U4**: Labels and tooltips for all interactive elements

**Internationalization:**
- **NFR-U5**: i18n ready architecture (future multi-language support)
- **NFR-U6**: Localized date and number formats (FR by default)
