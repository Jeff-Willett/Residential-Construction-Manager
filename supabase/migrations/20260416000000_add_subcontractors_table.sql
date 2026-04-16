CREATE TABLE IF NOT EXISTS subcontractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS subcontractors_name_lower_idx ON subcontractors (LOWER(name));

INSERT INTO subcontractors (name)
SELECT DISTINCT candidate.name
FROM (
  SELECT TRIM(subcontractor) AS name FROM task_templates WHERE subcontractor IS NOT NULL
  UNION
  SELECT TRIM(subcontractor) AS name FROM tasks WHERE subcontractor IS NOT NULL
  UNION
  SELECT TRIM(vendor_name) AS name FROM vendor_colors WHERE vendor_name IS NOT NULL
) AS candidate
WHERE candidate.name <> ''
ON CONFLICT DO NOTHING;

ALTER TABLE subcontractors ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subcontractors' AND policyname = 'Enable all for all users'
  ) THEN
    CREATE POLICY "Enable all for all users" ON subcontractors FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
