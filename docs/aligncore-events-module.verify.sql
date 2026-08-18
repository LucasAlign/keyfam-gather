-- ============================================================================
-- Validation checks for aligncore-events-module.sql
-- ----------------------------------------------------------------------------
-- Asserts the module DDL applied correctly and its key behaviors hold. Every
-- check RAISEs on failure, so `psql -v ON_ERROR_STOP=1 -f` exits non-zero if
-- anything regresses. Run it against a database that has ALREADY applied
-- aligncore-events-module.sql (plus the `users` / `audit_log` stubs the module
-- depends on). The companion runner `verify-events-module.sh` does the full
-- cycle — throwaway cluster, stubs, DDL, this file, teardown.
-- ============================================================================

\set ON_ERROR_STOP on

DO $$
DECLARE n int;
BEGIN
  -- 1. All 20 module tables exist -------------------------------------------
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN (
       'event_status','registration_source','invitation_status',
       'organizations','memberships','event_people','events','event_assignments',
       'groups','seating_tables','parties','event_hosts','host_access_tokens',
       'registrations','event_registration_fields','event_registration_field_options',
       'registration_field_answers','event_invitations','check_ins','attendance_operations');
  IF n <> 20 THEN RAISE EXCEPTION 'expected 20 module tables, found %', n; END IF;

  -- 2. The 8 protocol/authorization enums exist ------------------------------
  SELECT count(*) INTO n FROM pg_type
   WHERE typtype = 'e'
     AND typname IN ('membership_role','event_role','registration_status',
       'registration_field_type','registration_field_visibility',
       'attendance_operation_kind','attendance_disposition','attendance_result_code');
  IF n <> 8 THEN RAISE EXCEPTION 'expected 8 module enums, found %', n; END IF;

  -- 3. Lookup seed rows + semantic flags -------------------------------------
  SELECT count(*) INTO n FROM event_status;
  IF n <> 6 THEN RAISE EXCEPTION 'expected 6 event_status rows, found %', n; END IF;
  -- EVENT_LIVE is the only status that permits check-in
  SELECT count(*) INTO n FROM event_status WHERE allows_check_in;
  IF n <> 1 THEN RAISE EXCEPTION 'expected exactly 1 allows_check_in status, found %', n; END IF;
  PERFORM 1 FROM event_status WHERE code='EVENT_LIVE' AND allows_check_in;
  IF NOT FOUND THEN RAISE EXCEPTION 'EVENT_LIVE should allow check-in'; END IF;
  -- REGISTRATION_OPEN is the only status that permits registration
  SELECT count(*) INTO n FROM event_status WHERE allows_registration;
  IF n <> 1 THEN RAISE EXCEPTION 'expected exactly 1 allows_registration status, found %', n; END IF;
  IF (SELECT count(*) FROM registration_source) <> 5 THEN RAISE EXCEPTION 'expected 5 registration_source rows'; END IF;
  IF (SELECT count(*) FROM invitation_status)   <> 7 THEN RAISE EXCEPTION 'expected 7 invitation_status rows'; END IF;

  RAISE NOTICE 'structure OK: 20 tables, 8 enums, lookups seeded';
END $$;

-- 4. Fixtures + column defaults ----------------------------------------------
INSERT INTO organizations (name) VALUES ('Verify Org');
INSERT INTO users (email) VALUES ('verify@example.test');
INSERT INTO events (organization_id, name, starts_on, ends_on, timezone)
  VALUES (1, 'Verify Gala', '2026-09-01T18:00Z', '2026-09-01T22:00Z', 'UTC');
INSERT INTO event_people (organization_id, first_name, last_name) VALUES (1, 'Ada', 'Lovelace');
INSERT INTO registrations (organization_id, event_id, person_id) VALUES (1, 1, 1);

DO $$
BEGIN
  PERFORM 1 FROM events WHERE event_id=1 AND status_id=1 AND branding_primary_color='#173a32';
  IF NOT FOUND THEN RAISE EXCEPTION 'event defaults wrong (status_id->DRAFT / branding color)'; END IF;
  PERFORM 1 FROM registrations WHERE registration_id=1 AND source_id=3 AND status='ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'registration defaults wrong (source->STAFF / status->ACTIVE)'; END IF;
  RAISE NOTICE 'defaults OK';
END $$;

-- 5. updated_on trigger fires on UPDATE (created_on stays put) ----------------
UPDATE events SET name='Verify Gala 2026' WHERE event_id=1;
DO $$
BEGIN
  PERFORM 1 FROM events WHERE event_id=1 AND updated_on > created_on;
  IF NOT FOUND THEN RAISE EXCEPTION 'updated_on trigger did not bump on UPDATE'; END IF;
  RAISE NOTICE 'updated_on trigger OK';
END $$;

-- 6. Invitation single-sender CHECK rejects a both-null sender ----------------
DO $$
BEGIN
  BEGIN
    INSERT INTO event_invitations (organization_id, event_id, first_name, last_name, token_hash, expires_at)
      VALUES (1, 1, 'X', 'Y', 'verify-hash', '2026-09-01T00:00Z');
    RAISE EXCEPTION 'single-sender CHECK did not reject both-null sender';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'single-sender CHECK OK';
  END;
END $$;

-- 7. person -> RESTRICT blocks deleting a registered person ------------------
DO $$
BEGIN
  BEGIN
    DELETE FROM event_people WHERE person_id=1;
    RAISE EXCEPTION 'RESTRICT did not block delete of a registered person';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'person RESTRICT OK';
  END;
END $$;

\echo 'ALL CHECKS PASSED'
