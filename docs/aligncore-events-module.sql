-- ============================================================================
-- Align Core — Events Module (Gather migration)
-- Migration: aligncore-events/001_events_module
-- ----------------------------------------------------------------------------
-- Translates the Gather Prisma schema into Align Core's conventions:
--   * integer identity PKs named <entity>_id (was cuid() strings)
--   * created_on / updated_on timestamps (was createdAt / updatedAt)
--   * tenant-visible enums -> lookup tables with stable ids + semantic flags
--   * protocol / authorization enums -> Postgres ENUM types
--   * FKs are bare integers; ON DELETE mirrors the Prisma relations exactly
--
-- Assumes Align Core's `users` table (users.user_id INT PK) already exists.
-- Companion design docs: aligncore-migration-detail.md,
-- aligncore-attendance-sync-endpoint.md.
--
-- TENANCY: this migration RETAINS Gather's multi-org model (organizations +
-- memberships + an organization_id on every scoped row) because the
-- verify:postgres suite asserts cross-org isolation. To collapse onto Align's
-- single-tenant-per-deployment model, drop the organizations/memberships tables
-- and every organization_id column + its FKs/indexes, and scope by deployment.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0. Shared updated_on trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION events_set_updated_on() RETURNS trigger AS $$
BEGIN
  NEW.updated_on := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. LOOKUP TABLES  (tenant-visible; stable id, renameable name, semantic flags)
--    Behavior keys off the flag columns / stable `code`, never the display name
--    (Align issue #99 discipline). Canonical rows are seeded with fixed ids so
--    column defaults and app code can reference them.
-- ============================================================================

-- event_status ---------------------------------------------------------------
CREATE TABLE event_status (
  event_status_id     INT PRIMARY KEY,
  code                VARCHAR(40)  NOT NULL UNIQUE,      -- machine key (stable)
  name                VARCHAR(80)  NOT NULL,             -- display (renameable)
  allows_registration BOOLEAN      NOT NULL DEFAULT false, -- semantic flag
  allows_check_in     BOOLEAN      NOT NULL DEFAULT false, -- semantic flag
  is_terminal         BOOLEAN      NOT NULL DEFAULT false, -- semantic flag
  sort_order          INT          NOT NULL
);
INSERT INTO event_status
  (event_status_id, code, name, allows_registration, allows_check_in, is_terminal, sort_order) VALUES
  (1, 'DRAFT',               'Draft',               false, false, false, 1),
  (2, 'REGISTRATION_OPEN',   'Registration open',   true,  false, false, 2),
  (3, 'REGISTRATION_CLOSED', 'Registration closed', false, false, false, 3),
  (4, 'EVENT_LIVE',          'Event live',          false, true,  false, 4), -- walk-ins check in live
  (5, 'COMPLETED',           'Completed',           false, false, true,  5),
  (6, 'ARCHIVED',            'Archived',            false, false, true,  6);

-- registration_source --------------------------------------------------------
CREATE TABLE registration_source (
  registration_source_id INT PRIMARY KEY,
  code                   VARCHAR(40) NOT NULL UNIQUE,
  name                   VARCHAR(80) NOT NULL,
  is_self_serve          BOOLEAN     NOT NULL DEFAULT false -- PUBLIC / INVITATION are self-serve
);
INSERT INTO registration_source
  (registration_source_id, code, name, is_self_serve) VALUES
  (1, 'PUBLIC',     'Public',     true),
  (2, 'HOST',       'Host',       false),
  (3, 'STAFF',      'Staff',      false),
  (4, 'INVITATION', 'Invitation', true),
  (5, 'WALK_IN',    'Walk-in',    false);

-- invitation_status ----------------------------------------------------------
CREATE TABLE invitation_status (
  invitation_status_id INT PRIMARY KEY,
  code                 VARCHAR(40) NOT NULL UNIQUE,
  name                 VARCHAR(80) NOT NULL,
  is_terminal          BOOLEAN     NOT NULL DEFAULT false
);
INSERT INTO invitation_status
  (invitation_status_id, code, name, is_terminal) VALUES
  (1, 'DRAFT',       'Draft',       false),
  (2, 'SENT',        'Sent',        false),
  (3, 'OPENED',      'Opened',      false),
  (4, 'REGISTERED',  'Registered',  true),
  (5, 'DECLINED',    'Declined',    true),
  (6, 'CANCELLED',   'Cancelled',   true),
  (7, 'NO_RESPONSE', 'No response', true);

-- ============================================================================
-- 2. PROTOCOL / AUTHORIZATION ENUMS
--    Code branches on these; they are NOT tenant-editable. Deliberately Postgres
--    ENUMs, NOT /reference/* lookup tables (see the schema deep-dive).
-- ============================================================================
CREATE TYPE membership_role                AS ENUM ('ORGANIZATION_ADMIN','EVENT_ADMIN','EVENT_STAFF','VIEWER','MEMBER');
CREATE TYPE event_role                     AS ENUM ('EVENT_ADMIN','EVENT_STAFF');
CREATE TYPE registration_status            AS ENUM ('ACTIVE','CANCELLED','SUPERSEDED');
CREATE TYPE registration_field_type        AS ENUM ('TEXT','TEXTAREA','NUMBER','EMAIL','PHONE','DATE','DROPDOWN','RADIO','CHECKBOX','YES_NO');
CREATE TYPE registration_field_visibility  AS ENUM ('PUBLIC','ADMIN_ONLY','HIDDEN');
CREATE TYPE attendance_operation_kind      AS ENUM ('CHECK_IN','UNDO');
CREATE TYPE attendance_disposition         AS ENUM ('APPLIED','ALREADY_APPLIED','CONFLICT','REJECTED');
CREATE TYPE attendance_result_code         AS ENUM ('ALREADY_CHECKED_IN','ALREADY_REVERSED','UNDO_EXPIRED','STALE_VERSION','NOT_FOUND','FORBIDDEN','OPERATION_ID_REUSED');

-- ============================================================================
-- 3. TENANCY  (omit this whole section to collapse to single-tenant)
-- ============================================================================
CREATE TABLE organizations (
  organization_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  created_on      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_on      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE TRIGGER organizations_updated BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION events_set_updated_on();

CREATE TABLE memberships (
  membership_id   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         INT NOT NULL REFERENCES users(user_id)         ON DELETE CASCADE,
  organization_id INT NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
  role            membership_role NOT NULL,
  UNIQUE (user_id, organization_id)
);
CREATE INDEX memberships_org_idx ON memberships (organization_id);

-- ============================================================================
-- 4. PEOPLE  (canonical event contact + merge ledger)
--    New table -- Align has no general person (only users/parents/children).
-- ============================================================================
CREATE TABLE event_people (
  person_id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id       INT NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
  user_id               INT REFERENCES users(user_id) ON DELETE SET NULL,  -- optional cross-link to an Align login
  first_name            VARCHAR(255) NOT NULL,
  last_name             VARCHAR(255) NOT NULL,
  email                 VARCHAR(255),
  email_normalized      VARCHAR(255),
  phone                 VARCHAR(50),
  phone_normalized      VARCHAR(50),
  address_line1         VARCHAR(255),
  address_line2         VARCHAR(255),
  city                  VARCHAR(255),
  region                VARCHAR(255),
  postal_code           VARCHAR(40),
  country               VARCHAR(255),
  address_normalized    TEXT,
  merged_into_person_id INT REFERENCES event_people(person_id) ON DELETE RESTRICT, -- tombstone
  merged_at             TIMESTAMPTZ,
  created_on            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_on            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_people_org_email_uq UNIQUE (organization_id, email_normalized),
  CONSTRAINT event_people_org_phone_uq UNIQUE (organization_id, phone_normalized)
);
CREATE INDEX event_people_name_idx    ON event_people (organization_id, last_name, first_name);
CREATE INDEX event_people_address_idx ON event_people (organization_id, address_normalized, last_name, first_name);
CREATE INDEX event_people_merged_idx  ON event_people (merged_into_person_id);
CREATE TRIGGER event_people_updated BEFORE UPDATE ON event_people
  FOR EACH ROW EXECUTE FUNCTION events_set_updated_on();

-- ============================================================================
-- 5. EVENTS + per-event role assignment
-- ============================================================================
CREATE TABLE events (
  event_id               INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id        INT NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
  name                   VARCHAR(255) NOT NULL,
  description            TEXT,
  event_type             VARCHAR(120) NOT NULL DEFAULT 'Fundraising event',
  status_id              INT NOT NULL REFERENCES event_status(event_status_id) DEFAULT 1,
  starts_on              TIMESTAMPTZ  NOT NULL,
  ends_on                TIMESTAMPTZ  NOT NULL,
  timezone               VARCHAR(64)  NOT NULL,
  venue                  VARCHAR(255),
  address                VARCHAR(255),
  capacity               INT,
  registration_opens_on  TIMESTAMPTZ,
  registration_closes_on TIMESTAMPTZ,
  is_public              BOOLEAN      NOT NULL DEFAULT false,
  contact_email          VARCHAR(255),
  contact_name           VARCHAR(255),
  contact_phone          VARCHAR(50),
  branding_primary_color VARCHAR(9)   NOT NULL DEFAULT '#173a32',
  branding_logo_s3_key   VARCHAR(500),  -- was brandingLogoUrl; now S3 key (photo pattern)
  created_on             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_on             TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX events_org_starts_idx ON events (organization_id, starts_on);
CREATE TRIGGER events_updated BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION events_set_updated_on();

CREATE TABLE event_assignments (
  event_assignment_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id             INT NOT NULL REFERENCES users(user_id)         ON DELETE CASCADE,
  organization_id     INT NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
  event_id            INT NOT NULL REFERENCES events(event_id)       ON DELETE CASCADE,
  role                event_role NOT NULL,
  UNIQUE (user_id, event_id)  -- the per-event scope gate (analog of volunteer_families)
);
CREATE INDEX event_assignments_org_event_idx ON event_assignments (organization_id, event_id);

-- ============================================================================
-- 6. GROUPING & SEATING
-- ============================================================================
CREATE TABLE groups (
  group_id        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
  event_id        INT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  capacity        INT,
  created_on      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_on      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, name)
);
CREATE INDEX groups_org_event_idx ON groups (organization_id, event_id);
CREATE TRIGGER groups_updated BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION events_set_updated_on();

CREATE TABLE seating_tables (
  table_id        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
  event_id        INT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  capacity        INT NOT NULL,
  notes           TEXT,
  created_on      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_on      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, name)
);
CREATE INDEX seating_tables_org_event_idx ON seating_tables (organization_id, event_id);
CREATE TRIGGER seating_tables_updated BEFORE UPDATE ON seating_tables
  FOR EACH ROW EXECUTE FUNCTION events_set_updated_on();

CREATE TABLE parties (
  party_id        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
  event_id        INT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  created_on      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_on      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, name)
);
CREATE INDEX parties_org_event_idx ON parties (organization_id, event_id);
CREATE TRIGGER parties_updated BEFORE UPDATE ON parties
  FOR EACH ROW EXECUTE FUNCTION events_set_updated_on();

-- Hosts (a person managing one group's guests) + their anonymous access tokens
CREATE TABLE event_hosts (
  event_host_id   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
  event_id        INT NOT NULL REFERENCES events(event_id)   ON DELETE CASCADE,
  person_id       INT NOT NULL REFERENCES event_people(person_id) ON DELETE RESTRICT,
  group_id        INT NOT NULL REFERENCES groups(group_id)   ON DELETE CASCADE,
  created_on      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_on      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, person_id)
);
CREATE INDEX event_hosts_org_event_idx ON event_hosts (organization_id, event_id);
CREATE INDEX event_hosts_group_idx     ON event_hosts (group_id);
CREATE TRIGGER event_hosts_updated BEFORE UPDATE ON event_hosts
  FOR EACH ROW EXECUTE FUNCTION events_set_updated_on();

CREATE TABLE host_access_tokens (
  host_access_token_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_host_id        INT NOT NULL REFERENCES event_hosts(event_host_id) ON DELETE CASCADE,
  token_hash           VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 hex; NOT an id, never remapped
  expires_at           TIMESTAMPTZ NOT NULL,
  revoked_at           TIMESTAMPTZ,
  last_used_at         TIMESTAMPTZ,
  created_on           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX host_access_tokens_host_exp_idx ON host_access_tokens (event_host_id, expires_at);

-- ============================================================================
-- 7. REGISTRATIONS + custom fields
-- ============================================================================
CREATE TABLE registrations (
  registration_id               INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id               INT NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
  event_id                      INT NOT NULL REFERENCES events(event_id)  ON DELETE CASCADE,
  person_id                     INT NOT NULL REFERENCES event_people(person_id) ON DELETE RESTRICT,
  group_id                      INT REFERENCES groups(group_id)           ON DELETE SET NULL,
  table_id                      INT REFERENCES seating_tables(table_id)   ON DELETE SET NULL,
  party_id                      INT REFERENCES parties(party_id)          ON DELETE SET NULL,
  source_id                     INT NOT NULL REFERENCES registration_source(registration_source_id) DEFAULT 3, -- STAFF
  status                        registration_status NOT NULL DEFAULT 'ACTIVE',
  registered_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at                  TIMESTAMPTZ,
  superseded_at                 TIMESTAMPTZ,
  superseded_by_registration_id INT REFERENCES registrations(registration_id) ON DELETE RESTRICT,
  created_on                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_on                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT registrations_event_person_uq UNIQUE (event_id, person_id)
);
CREATE INDEX registrations_org_event_idx        ON registrations (organization_id, event_id);
CREATE INDEX registrations_org_event_status_idx ON registrations (organization_id, event_id, status);
CREATE INDEX registrations_group_idx            ON registrations (group_id);
CREATE INDEX registrations_table_idx            ON registrations (table_id);
CREATE INDEX registrations_party_idx            ON registrations (party_id);
CREATE INDEX registrations_superseded_by_idx    ON registrations (superseded_by_registration_id);
CREATE TRIGGER registrations_updated BEFORE UPDATE ON registrations
  FOR EACH ROW EXECUTE FUNCTION events_set_updated_on();

CREATE TABLE event_registration_fields (
  field_id        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
  event_id        INT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  key             VARCHAR(120) NOT NULL,
  label           VARCHAR(255) NOT NULL,
  help_text       TEXT,
  type            registration_field_type       NOT NULL,
  visibility      registration_field_visibility NOT NULL DEFAULT 'PUBLIC',
  is_required     BOOLEAN NOT NULL DEFAULT false,
  sort_order      INT     NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_on      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_on      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, key)
);
CREATE INDEX event_registration_fields_sort_idx ON event_registration_fields (organization_id, event_id, sort_order);
CREATE TRIGGER event_registration_fields_updated BEFORE UPDATE ON event_registration_fields
  FOR EACH ROW EXECUTE FUNCTION events_set_updated_on();

CREATE TABLE event_registration_field_options (
  option_id  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  field_id   INT NOT NULL REFERENCES event_registration_fields(field_id) ON DELETE CASCADE,
  value      VARCHAR(255) NOT NULL,
  label      VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL,
  UNIQUE (field_id, value)
);
CREATE INDEX event_registration_field_options_sort_idx ON event_registration_field_options (field_id, sort_order);

CREATE TABLE registration_field_answers (
  answer_id       INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
  event_id        INT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  registration_id INT NOT NULL REFERENCES registrations(registration_id) ON DELETE CASCADE,
  field_id        INT NOT NULL REFERENCES event_registration_fields(field_id) ON DELETE RESTRICT,
  value           JSONB NOT NULL,
  created_on      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_on      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (registration_id, field_id)
);
CREATE INDEX registration_field_answers_org_event_idx ON registration_field_answers (organization_id, event_id);
CREATE INDEX registration_field_answers_field_idx     ON registration_field_answers (event_id, field_id);
CREATE TRIGGER registration_field_answers_updated BEFORE UPDATE ON registration_field_answers
  FOR EACH ROW EXECUTE FUNCTION events_set_updated_on();

-- ============================================================================
-- 8. INVITATIONS
-- ============================================================================
CREATE TABLE event_invitations (
  invitation_id     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id   INT NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
  event_id          INT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  sender_id         INT REFERENCES users(user_id)            ON DELETE RESTRICT, -- staff sender
  event_host_id     INT REFERENCES event_hosts(event_host_id) ON DELETE RESTRICT, -- host sender
  group_id          INT REFERENCES groups(group_id)          ON DELETE SET NULL,
  invitee_id        INT REFERENCES event_people(person_id)   ON DELETE SET NULL,
  registration_id   INT UNIQUE REFERENCES registrations(registration_id) ON DELETE SET NULL,
  first_name        VARCHAR(255) NOT NULL,
  last_name         VARCHAR(255) NOT NULL,
  email             VARCHAR(255),
  email_normalized  VARCHAR(255),
  phone             VARCHAR(50),
  phone_normalized  VARCHAR(50),
  token_hash        VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 hex; never remapped
  status_id         INT NOT NULL REFERENCES invitation_status(invitation_status_id) DEFAULT 1, -- DRAFT
  sent_at           TIMESTAMPTZ,
  opened_at         TIMESTAMPTZ,
  responded_at      TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ NOT NULL,
  created_on        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_on        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- exactly one sender type (mirrors Gather's Invitation_sender_check)
  CONSTRAINT event_invitations_single_sender CHECK (num_nonnulls(sender_id, event_host_id) = 1)
);
CREATE INDEX event_invitations_org_event_status_idx ON event_invitations (organization_id, event_id, status_id);
CREATE INDEX event_invitations_event_group_idx      ON event_invitations (event_id, group_id, created_on);
CREATE INDEX event_invitations_email_idx            ON event_invitations (email_normalized);
CREATE INDEX event_invitations_phone_idx            ON event_invitations (phone_normalized);
CREATE TRIGGER event_invitations_updated BEFORE UPDATE ON event_invitations
  FOR EACH ROW EXECUTE FUNCTION events_set_updated_on();

-- ============================================================================
-- 9. ATTENDANCE  (check-in state + idempotent offline command ledger)
--    See aligncore-attendance-sync-endpoint.md. check_ins.version is the
--    optimistic lock; attendance_operations.operation_id is the idempotency key.
-- ============================================================================
CREATE TABLE check_ins (
  check_in_id     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
  event_id        INT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  registration_id INT NOT NULL UNIQUE REFERENCES registrations(registration_id) ON DELETE CASCADE,
  actor_id        INT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  device_id       VARCHAR(160) NOT NULL,
  checked_in_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversed_at     TIMESTAMPTZ,
  reversed_by_id  INT REFERENCES users(user_id) ON DELETE RESTRICT,
  version         INT NOT NULL DEFAULT 1,
  created_on      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_on      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX check_ins_org_event_reversed_idx ON check_ins (organization_id, event_id, reversed_at);
CREATE INDEX check_ins_event_checked_in_idx   ON check_ins (event_id, checked_in_at);
CREATE TRIGGER check_ins_updated BEFORE UPDATE ON check_ins
  FOR EACH ROW EXECUTE FUNCTION events_set_updated_on();

CREATE TABLE attendance_operations (
  attendance_operation_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_id            UUID NOT NULL UNIQUE,          -- client-minted idempotency key
  organization_id         INT NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
  event_id                INT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  registration_id         INT NOT NULL REFERENCES registrations(registration_id) ON DELETE CASCADE,
  actor_id                INT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  device_id               VARCHAR(160) NOT NULL,
  kind                    attendance_operation_kind NOT NULL,
  occurred_at             TIMESTAMPTZ NOT NULL,
  expected_version        INT,
  disposition             attendance_disposition NOT NULL,
  result_code             attendance_result_code,
  command_hash            VARCHAR(64) NOT NULL,          -- SHA-256 hex of the canonical command
  canonical_result        TEXT NOT NULL,                -- JSON snapshot of resulting AttendanceState
  created_on              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX attendance_operations_org_event_idx   ON attendance_operations (organization_id, event_id, created_on);
CREATE INDEX attendance_operations_device_idx      ON attendance_operations (event_id, device_id, created_on);
CREATE INDEX attendance_operations_registration_idx ON attendance_operations (registration_id, created_on);

-- ============================================================================
-- 10. AUDIT
--     Reuse Align Core's existing audit_log (see auth deep-dive). Event scope
--     and anonymous host-actor ride in details JSON, OR add columns here:
--
--   ALTER TABLE audit_log
--     ADD COLUMN event_id      INT REFERENCES events(event_id)          ON DELETE SET NULL,
--     ADD COLUMN event_host_id INT REFERENCES event_hosts(event_host_id) ON DELETE SET NULL,
--     ADD COLUMN entity_type   VARCHAR(80),
--     ADD COLUMN entity_id     VARCHAR(64),
--     ADD COLUMN previous_state TEXT,
--     ADD COLUMN new_state      TEXT;
--   CREATE INDEX audit_log_event_idx ON audit_log (event_id, time_stamp);
--
--   Register the module's action verbs in the Valid Action Names allowlist:
--     EVENT_CREATED, EVENT_UPDATED, REGISTRATION_CREATED, REGISTRATION_CANCELLED,
--     CHECK_IN_CREATED (checkin.created), CHECK_IN_REVERSED (checkin.reversed),
--     INVITATION_SENT, PERSON_MERGED, HOST_ACCESS_ROTATED, HOST_ACCESS_REVOKED, ...
-- ============================================================================

COMMIT;
