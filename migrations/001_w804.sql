CREATE TABLE IF NOT EXISTS w804_counter (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  next_number integer NOT NULL CHECK (next_number >= 37)
);
INSERT INTO w804_counter(singleton,next_number) VALUES(true,37) ON CONFLICT DO NOTHING;

-- Reservations are metadata, not fabricated Master records.
CREATE TABLE IF NOT EXISTS w804_reserved_numbers (
  number integer PRIMARY KEY CHECK (number BETWEEN 1 AND 36),
  source_kind text NOT NULL,
  permanently_cancelled boolean NOT NULL DEFAULT false
);
INSERT INTO w804_reserved_numbers(number,source_kind,permanently_cancelled)
SELECT n, CASE WHEN n <= 31 THEN 'Excel' ELSE 'PDF B1-' || lpad(n::text,3,'0') END, n IN (35,36)
FROM generate_series(1,36) n ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS w804_records (
  id uuid PRIMARY KEY,
  number integer UNIQUE NOT NULL CHECK (number > 0),
  date text NOT NULL DEFAULT '',
  unit text NOT NULL,
  use_location text NOT NULL DEFAULT '',
  item text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0 AND amount <= 50000),
  form2 text NOT NULL DEFAULT '',
  inventory_no text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  source_evidence text NOT NULL DEFAULT '',
  cancelled boolean NOT NULL DEFAULT false,
  cancel_reason text NOT NULL DEFAULT '',
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  request_key uuid UNIQUE,
  CHECK (number NOT IN (35,36) OR (cancelled AND position('ยกเลิก' in note) > 0))
);

CREATE OR REPLACE FUNCTION w804_keep_number() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'W804 records cannot be deleted; cancel instead'; END IF;
  IF NEW.number <> OLD.number THEN RAISE EXCEPTION 'W804 number cannot be changed'; END IF;
  IF OLD.cancelled AND NOT NEW.cancelled THEN RAISE EXCEPTION 'Cancelled W804 numbers cannot be reused'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER w804_protect_number BEFORE UPDATE OR DELETE ON w804_records
FOR EACH ROW EXECUTE FUNCTION w804_keep_number();

CREATE TABLE IF NOT EXISTS w804_documents (
  id uuid PRIMARY KEY,
  record_id uuid NOT NULL REFERENCES w804_records(id),
  kind text NOT NULL CHECK (kind IN ('form1','form2')),
  filename text NOT NULL,
  content bytea NOT NULL,
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(record_id,kind),
  CHECK (octet_length(content) <= 12582912)
);
CREATE TABLE IF NOT EXISTS w804_audit (
  id uuid PRIMARY KEY,
  record_id uuid REFERENCES w804_records(id),
  action text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS w804_import_batches (
  id uuid PRIMARY KEY,
  source_name text NOT NULL,
  file_sha256 text NOT NULL,
  imported_numbers integer[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
