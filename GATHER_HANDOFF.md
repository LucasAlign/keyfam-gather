# Gather — Product & Engineering Handoff

> **Working product name:** Gather  
> **Purpose:** A web-first event, attendance, fundraising, and follow-up platform designed to replace the operational core of FundEasy while sharing one integrated data model with the broader platform.

## 1. Product Vision

Gather should make running a large nonprofit event dramatically easier.

It is not a standalone siloed event database. It is a spoke of a larger organizational platform. Events, registrations, volunteers, donors, churches, care communities, mentoring relationships, families, and other modules should reference the same canonical people whenever technically appropriate.

### Core architectural principle

**One Person. One Organization Database. Many Relationships.**

A person should not be duplicated merely because they registered for an event.

The same person may be a:
- guest at one event;
- host at another;
- donor;
- volunteer;
- sponsor contact;
- mentor;
- church contact;
- participant in a fundraising campaign.

These are contextual relationships, not permanent `person_type` labels.

## 2. North-Star Test

Ask throughout development:

> **Could a nonprofit successfully run a 500-person fundraising banquet tomorrow using only Gather, ordinary phones/tablets/laptops, and volunteers who received five minutes of training?**

Reference load:
- 1 organization
- 1 fundraising banquet
- 50 hosts
- 500 invitees
- 450 preregistered guests
- 50 tables
- 10 simultaneous check-in devices
- 10 walk-ins
- 20 seating exceptions
- 15-minute intermittent internet outage
- multiple concurrent edits/check-ins

The MVP passes if:
- no attendance is lost;
- duplicate check-ins are prevented;
- offline actions synchronize correctly;
- devices converge to the correct attendance state;
- walk-ins appear across devices;
- seating changes persist;
- audit history identifies important changes;
- staff can export an accurate final attendance list.

## 3. Product Lifecycle

```text
PLAN
Create Event
Configure Registration
Configure Tables / Capacity
Configure Communications

        ↓

RECRUIT
Recruit Hosts
Create Host Groups
Hosts Invite Guests
Track Invitations

        ↓

REGISTER
Public Registration
Host Registration
Staff Registration
Guest / Party Relationships
Meal Choices / Custom Questions
Payments if applicable

        ↓

ORGANIZE
Groups
Hosts
Parties / Households
Tables
Seating
Waitlist
Exceptions

        ↓

PREPARE
Name Tags
Guest Lists
Table Lists
Volunteer Assignments
Check-In Stations
Event Metrics

        ↓

EVENT NIGHT
Fast Search
QR Check-In
Walk-Ins
Guest Changes
Table Changes
Duplicate Resolution
Live Attendance
Exception Desk

        ↓

FUNDRAISE
Donations
Pledges
Sponsors
Payments
Recurring Gifts

        ↓

FOLLOW UP
Attendance Reconciliation
Thank You
Outstanding Pledges
Reports
Exports
Historical Metrics
```

## 4. How Gather Differs from FundEasy

Traditional silo:

```text
CRM Person
   ↓ export/import
Event-system Person
   ↓
Event Registration
```

Gather:

```text
                 PERSON
                    │
       ┌────────────┼────────────┐
       ↓            ↓            ↓
   Wraparound     Gather      Mentoring
       ↓            ↓            ↓
   Volunteer      Attendee      Mentor
   Church         Host          Youth
   Family         Donor
                  Sponsor
```

Gather should eliminate unnecessary CSV manipulation, duplicate-person cleanup, imports/exports, and reconciliation between an event database and the primary organizational database.

## 5. MVP Scope

The first production-capable vertical should include:

1. Create Event
2. Create/Register Person
3. Existing Person Matching
4. Hosts
5. Groups
6. Host Portal
7. Guest Registration
8. Parties
9. Tables
10. Seating
11. Web Check-In
12. Walk-Ins
13. Exception Desk
14. Offline-Resilient Check-In
15. Real-Time Attendance
16. Basic Name Tags
17. Event Dashboard
18. Basic Reports
19. Audit Logging

Do **not** delay MVP for:
- crowdfunding;
- peer-to-peer fundraising;
- advanced sponsorship fulfillment;
- complex ballroom/room-layout design;
- marketing automation;
- advanced analytics.

## 6. Vertical Build Order

Build complete workflows rather than isolated technical layers.

### Vertical 1 — Event → Registrant
Create Event → Register Person → Display Registrant

### Vertical 2 — Host → Group → Guest
Create Host → Create Group → Host Portal → Add Guest

### Vertical 3 — Tables & Seating
Create Tables → Assign Group → Move Person/Party

### Vertical 4 — Check-In
Open Check-In → Search → Check In → Real-Time Update

### Vertical 5 — Walk-Ins
Walk-In → Assign Table → Check In

### Vertical 6 — Offline Resilience
Lose Connection → Check In → Queue Changes → Reconnect → Synchronize

### Vertical 7 — Name Tags
Select Audience → Preview → Generate Printable PDF

### Vertical 8 — Invitations
Invitation → Registration Link → Registration → Invitation Status

### Vertical 9 — Dashboard & Reporting
Event Dashboard → Attendance Metrics → Reports → Export

### Later
Payments → Donations → Pledges → Sponsors → P2P → Crowdfunding

## 7. Event Model

Events require:
- name
- description
- event type
- status
- date
- start/end time
- timezone
- venue
- address
- capacity
- registration opening/closing
- public/private status
- contact information
- branding

Lifecycle:

`Draft → Registration Open → Registration Closed → Event Live → Completed → Archived`

Support duplicating an event's configuration without copying registrations or attendance.

## 8. Registration Engine

Support:
- public self-registration;
- host-added registration;
- staff registration;
- invitation-linked registration;
- walk-in registration.

Reusable custom fields:
- text
- textarea
- number
- email
- phone
- date
- dropdown
- radio
- checkbox
- yes/no

Fields may be:
- required;
- optional;
- hidden;
- admin-only.

Store event-specific answers separately from canonical Person data unless the answer genuinely belongs on the canonical person.

## 9. Person Resolution

Registration references a Person.

On registration, search likely existing people using:
1. normalized email;
2. normalized phone;
3. name + address;
4. fuzzy name matching.

Do not automatically merge uncertain records.

Authorized staff should see:
- Use Existing Person
- Create New Person
- Merge Records

Merges must be audited.

## 10. Hosts & Groups

An administrator can designate a registrant as a Host.

Creating a Host should optionally create a Group automatically.

Example:

```text
Bryant Lucas
→ Host
→ Lucas Group
→ Capacity 8
```

### Host Portal

Hosts should receive secure, simple access without navigating the administrative application.

Show:
- event information;
- group/table name;
- capacity;
- number registered;
- remaining seats;
- guest list;
- invitation status.

Allow:
- invite guest;
- add/register guest;
- edit permitted guest information;
- cancel guest;
- resend invitation.

Hosts must never see other groups unless explicitly authorized.

A Group can exist without a Host.

Groups and Tables are distinct objects.

## 11. Parties / Households

Create a Party concept for people who normally move together.

Example:

```text
Smith Party
├── John Smith
└── Mary Smith
```

Moving a party should offer to move all members together while allowing authorized staff to split the party.

## 12. Tables & Seating

Each table has:
- name/number;
- capacity;
- notes;
- assignments.

Support assigning:
- individuals;
- parties;
- groups.

Display:
- occupied seats;
- capacity;
- remaining seats.

Allow an authorized over-capacity assignment with an explicit warning.

Start with a simple visual table-management interface. Do not build a ballroom CAD tool for MVP.

## 13. Invitations

Track:
- event;
- sender;
- host/group;
- invitee;
- email/phone;
- sent timestamp;
- opened timestamp when available;
- linked registration;
- status.

Statuses:
- Draft
- Sent
- Opened
- Registered
- Declined
- Cancelled
- No Response

Invitation data should support funnel/conversion reporting.

## 14. Event Command Center

Event-day dashboard should be optimized for large screens and tablets.

Prominently display:
- Registered
- Checked In
- Attendance %
- Not Arrived
- Walk-Ins
- Unassigned Guests
- Table Issues

Primary actions:
- Open Check-In
- Guest Management
- Add Walk-In
- Tables
- Event Dashboard

Metrics should update in near-real-time.

## 15. Web-First Check-In

This is a core competitive feature.

Do **not** require:
- a dedicated iPad;
- a proprietary Hub;
- special hardware;
- an iOS-only app.

It must work on:
- iPhone
- Android
- iPad
- Android tablets
- Chromebook
- Windows
- Mac
- modern browsers

Target normal check-in: **2–4 seconds per guest.**

Default screen should immediately expose search.

Search results show:
- name;
- group;
- table;
- party when useful;
- current status;
- large Check In button.

After check-in:
- clear confirmation;
- timestamp;
- actor/device;
- connected clients update quickly.

## 16. QR Check-In

Each registration may receive a secure QR token.

Scanning identifies the registration.

Do not expose sequential database IDs in QR codes.

QR must remain optional. Manual search must always work well.

## 17. Offline-Resilient Check-In

Implement as an offline-resilient PWA where practical.

Cache the minimum event dataset needed for event operations.

When offline:
- search continues;
- check-in continues;
- attendance actions queue locally;
- UI clearly indicates offline state;
- UI shows unsynced action count.

When connectivity returns:
- queued actions synchronize automatically;
- synchronization is idempotent;
- duplicate check-ins are not created;
- conflicts have defined behavior.

The server remains the source of truth.

## 18. Concurrency

Assume at least 10 simultaneous check-in stations.

If Device A checks in a person, Device B should see the new state quickly.

If two devices check in the same registration simultaneously:
- do not create duplicate attendance;
- return the canonical existing check-in;
- show the current state.

Enforce this with database constraints/idempotency, not UI assumptions.

## 19. Event-Day Permissions

### Basic Check-In Volunteer
- search registrants;
- view table/group;
- check in;
- undo recent check-in when permitted.

### Check-In Lead / Exception Desk
Everything above plus:
- add walk-in;
- edit registration;
- move table;
- move group;
- change party;
- override table capacity;
- resolve duplicates;
- cancel registration.

Keep exception-management controls out of the basic volunteer workflow.

## 20. Walk-Ins

Optimize for speed.

Default:
- first name;
- last name;
- email optional;
- phone optional;
- group optional;
- table optional.

Primary action:

**ADD & CHECK IN**

A walk-in should immediately appear on connected devices.

## 21. Search

Search is a first-class product feature.

Support:
- first name;
- last name;
- full name;
- partial name;
- email;
- phone;
- last four phone digits;
- group;
- table;
- party.

Normalize:
- capitalization;
- punctuation;
- spaces;
- phone formatting.

Use fuzzy matching carefully.

Search should feel instant for events containing thousands of registrations.

## 22. Name Tags

Generate printable name tags/badges with dynamic fields such as:
- `{{first_name}}`
- `{{last_name}}`
- `{{full_name}}`
- `{{table}}`
- `{{group}}`
- `{{organization}}`
- `{{role}}`

Support standard Avery-compatible PDF layouts and preview before generation.

Direct label-printer support can come later.

## 23. Communications

Audience-based communication should eventually support:
- All Registrants
- Hosts
- Guests
- Registered
- Invited but Not Registered
- Not Checked In
- Attendees
- No-Shows
- Specific Group
- Specific Table
- Sponsors

Templates:
- Registration Confirmation
- Host Welcome
- Invitation
- Event Reminder
- Tomorrow Reminder
- Thank You
- We Missed You
- Outstanding Pledge

Architect email first so SMS can be added cleanly.

## 24. Financial Layer — Later Phase

Keep these concepts distinct:
- Transaction
- Donation
- Pledge
- Payment
- Refund
- Sponsorship
- Recurring Gift

Example:

```text
Pledge:      $1,000
Paid:          $250
Outstanding:   $750
```

Never treat a pledge as received cash.

Do not store raw card data. Use a PCI-compliant payment processor and abstract the payment provider behind a service layer.

## 25. Sponsors — Later Phase

Support sponsorship levels such as:
- Platinum
- Gold
- Silver
- Table Sponsor

Store:
- organization;
- contact;
- level;
- commitment;
- amount;
- amount paid;
- balance;
- logo;
- website;
- notes.

Track benefit fulfillment:
- Logo Received
- Program Ad Received
- Table Reserved
- Social Recognition
- Invoice Paid

## 26. Peer-to-Peer — Later Phase

Future model:

```text
Campaign
    │
    ├── Team
    │    ├── Captain
    │    └── Participants
    │
    └── Participant
           │
           ├── Fundraising Page
           ├── Goal
           └── Donations
```

Participant pages may later support personalized stories, images, goals, progress, and giving.

Do not let this delay Event Operations MVP.

## 27. Reporting

Core reports:
- registrations;
- attendance;
- no-shows;
- walk-ins;
- hosts;
- groups;
- tables;
- invitations;
- invitation conversion;
- donations;
- pledges;
- outstanding pledges;
- sponsors;
- revenue.

Support CSV export where appropriate.

Historical comparisons should use stable canonical data.

## 28. Proposed Domain Model

Inspect the existing schema before creating anything. Conceptually, Gather will need equivalents of:

```text
organizations

people
person_contacts
addresses

events
event_settings
event_roles

registrations
registration_answers

groups
group_members

parties
party_members

tables
table_assignments

invitations

checkins
checkin_devices
sync_events

communications
communication_recipients

sponsors
sponsorship_levels
sponsorships

transactions
donations
pledges
payments
refunds

campaigns
teams
participants

audit_logs
```

Do **not** blindly create these tables. Reuse existing platform entities and relationships where appropriate.

## 29. Permissions

At minimum, plan for:
- Organization Admin
- Event Admin
- Event Staff
- Host
- Check-In Volunteer
- Check-In Lead
- Finance
- Viewer

Behind the scenes, prefer capability-based authorization rather than relying entirely on hard-coded role names.

Enforce authorization server-side.

## 30. Audit History

Audit important mutations, including:
- registration creation/edit/deletion;
- person merges;
- table moves;
- group moves;
- walk-ins;
- check-ins;
- check-in reversals;
- financial transactions;
- refunds;
- pledge changes;
- permission changes.

Record:
- organization;
- event when applicable;
- actor;
- action;
- entity;
- previous state when appropriate;
- new state when appropriate;
- timestamp.

## 31. Security

Every relevant record must be organization-scoped.

Never trust:
- event IDs;
- organization IDs;
- browser-supplied role claims;
- hidden UI controls.

Validate every mutation server-side.

Use secure random tokens for public/host access. Expire/revoke them when appropriate.

Rate-limit public endpoints where necessary.

Do not leak registrant lists through public endpoints.

Protect financial and personally identifiable information.

## 32. UX Principles

Gather should feel:
- modern;
- calm;
- fast;
- friendly;
- obvious;
- forgiving.

Nontechnical volunteers should be able to operate check-in after less than five minutes of instruction.

Prefer:
- large touch targets;
- clear typography;
- obvious primary actions;
- progressive disclosure;
- simple language;
- immediate feedback.

Avoid:
- dense enterprise tables everywhere;
- unnecessary modals;
- tiny controls;
- cryptic icons;
- technical terminology;
- multi-step flows when one action will suffice.

## 33. Error Design

Never expose raw backend errors to normal users.

Bad:

`Foreign key constraint violation.`

Better:

`This guest is assigned to a table that no longer exists. Choose another table.`

Bad:

`Network request failed.`

Better:

`You're offline. Your check-ins are being saved on this device and will sync automatically.`

## 34. Engineering Handoff Instructions

You are acting as the senior product architect, UX designer, database architect, and full-stack engineer for Gather.

Before writing substantial code:

1. Inspect the repository.
2. Map the existing architecture.
3. Identify the framework and deployment model.
4. Inspect authentication.
5. Inspect organization/tenant handling.
6. Locate the canonical Person model.
7. Inspect current user/role/permission handling.
8. Identify reusable API/service patterns.
9. Identify reusable UI/design-system components.
10. Identify state-management and routing conventions.
11. Identify conflicts between the existing architecture and this specification.
12. Propose the Gather domain/data model.
13. Propose routes/pages.
14. Propose APIs/server actions.
15. Propose authorization rules.
16. Identify migration risks.
17. Produce an implementation plan for **Vertical 1 only**.

Do not create duplicate infrastructure when appropriate infrastructure already exists.

Preserve backward compatibility with existing modules.

Do not perform broad unrelated refactors.

Do not implement the entire specification in one giant change.

## 35. Initial Assignment

After completing repository discovery, begin only with:

### Vertical 1 — Event → Registrant

Implement the smallest complete production-quality workflow:

```text
Create Event
     ↓
Register Person
     ↓
Resolve/Create Canonical Person
     ↓
Create Event Registration
     ↓
Display Registrant in Event
```

The vertical should include:
- appropriate schema/migrations;
- server-side authorization;
- validation;
- UI;
- loading/error/empty states;
- responsive behavior;
- tests;
- audit logging where applicable.

Before modifying the database, explain the proposed schema changes and why they fit the existing architecture.

After implementation:
- run tests;
- run type checking;
- run linting;
- verify migrations;
- test authorization boundaries;
- test mobile layout;
- test failure states;
- summarize changed files;
- document architectural decisions;
- identify the next recommended vertical.

## 36. Decision Rule

For every feature, ask:

> **Does this reduce friction for the person trying to run the event?**

If a feature makes the database elegant but makes the event harder to operate, reconsider it.

Gather's goal is not to reproduce FundEasy screen-for-screen.

The goal is to preserve the valuable operational workflows, eliminate unnecessary friction, integrate the data properly, and make large nonprofit events dramatically easier to run.
