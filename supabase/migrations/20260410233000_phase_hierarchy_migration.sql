/*
  NON-DESTRUCTIVE MIGRATION
  Upgrades the existing Supabase schema to:
  Project -> Project Phase -> Scope Task
*/

CREATE TABLE IF NOT EXISTS phase_templates (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  phase_order INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  phase_template_id UUID REFERENCES phase_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phase_order INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS phase_template_id UUID;
ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS phase_name TEXT;
ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS phase_order INTEGER DEFAULT 0;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_phase_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS phase_name TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS phase_order INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_order INTEGER DEFAULT 0;

ALTER TABLE phase_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_phases ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'phase_templates' AND policyname = 'Enable all for all users'
  ) THEN
    CREATE POLICY "Enable all for all users" ON phase_templates FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'project_phases' AND policyname = 'Enable all for all users'
  ) THEN
    CREATE POLICY "Enable all for all users" ON project_phases FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO phase_templates (id, name, phase_order) VALUES
('cccc0000-0000-4000-8000-000000000001', '1. Foundation', 1),
('cccc0000-0000-4000-8000-000000000002', '2. Get in the Dry', 2),
('cccc0000-0000-4000-8000-000000000003', '3. Post Dry in anytime', 3),
('cccc0000-0000-4000-8000-000000000004', '4. Interior Rough In', 4),
('cccc0000-0000-4000-8000-000000000005', '5. Interior Finishing', 5)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    phase_order = EXCLUDED.phase_order;

UPDATE task_templates
SET
  phase_template_id = CASE
    WHEN scope IN ('Estimate', 'Clearing', 'Site Prep', 'Footer', 'Block', 'French Drain', 'Insulation Block', 'Rock Work', 'HVAC Pre', 'Plumbing Pre', 'Electrical Pre', 'Slab') THEN 'cccc0000-0000-4000-8000-000000000001'::uuid
    WHEN scope IN ('Framing', 'Roofing', 'Brick', 'Stone', 'Siding') THEN 'cccc0000-0000-4000-8000-000000000002'::uuid
    WHEN scope IN ('Rough Grade', 'Irrigation', 'Finish Grade', 'Landscaping', 'Lawn Seeding', 'Gutter drains', 'Trim Exterior') THEN 'cccc0000-0000-4000-8000-000000000003'::uuid
    WHEN scope IN ('HVAC Rough', 'Plumbing Rough', 'Electrical Rough', 'Insulation Walls', 'Sheetrock', 'Painting Primer', 'Garage Doors') THEN 'cccc0000-0000-4000-8000-000000000004'::uuid
    WHEN scope IN ('Flooring', 'Tile Work', 'Trim Interior', 'Cabinets', 'Countertops', 'Painting Main', 'Appliances', 'HVAC Finish', 'Plumbing Finish', 'Electrical Finish', 'Insulation Ceiling', 'Painting Finish', 'Cleaning') THEN 'cccc0000-0000-4000-8000-000000000005'::uuid
    ELSE phase_template_id
  END,
  phase_name = CASE
    WHEN scope IN ('Estimate', 'Clearing', 'Site Prep', 'Footer', 'Block', 'French Drain', 'Insulation Block', 'Rock Work', 'HVAC Pre', 'Plumbing Pre', 'Electrical Pre', 'Slab') THEN '1. Foundation'
    WHEN scope IN ('Framing', 'Roofing', 'Brick', 'Stone', 'Siding') THEN '2. Get in the Dry'
    WHEN scope IN ('Rough Grade', 'Irrigation', 'Finish Grade', 'Landscaping', 'Lawn Seeding', 'Gutter drains', 'Trim Exterior') THEN '3. Post Dry in anytime'
    WHEN scope IN ('HVAC Rough', 'Plumbing Rough', 'Electrical Rough', 'Insulation Walls', 'Sheetrock', 'Painting Primer', 'Garage Doors') THEN '4. Interior Rough In'
    WHEN scope IN ('Flooring', 'Tile Work', 'Trim Interior', 'Cabinets', 'Countertops', 'Painting Main', 'Appliances', 'HVAC Finish', 'Plumbing Finish', 'Electrical Finish', 'Insulation Ceiling', 'Painting Finish', 'Cleaning') THEN '5. Interior Finishing'
    ELSE phase_name
  END,
  phase_order = CASE
    WHEN scope IN ('Estimate', 'Clearing', 'Site Prep', 'Footer', 'Block', 'French Drain', 'Insulation Block', 'Rock Work', 'HVAC Pre', 'Plumbing Pre', 'Electrical Pre', 'Slab') THEN 1
    WHEN scope IN ('Framing', 'Roofing', 'Brick', 'Stone', 'Siding') THEN 2
    WHEN scope IN ('Rough Grade', 'Irrigation', 'Finish Grade', 'Landscaping', 'Lawn Seeding', 'Gutter drains', 'Trim Exterior') THEN 3
    WHEN scope IN ('HVAC Rough', 'Plumbing Rough', 'Electrical Rough', 'Insulation Walls', 'Sheetrock', 'Painting Primer', 'Garage Doors') THEN 4
    WHEN scope IN ('Flooring', 'Tile Work', 'Trim Interior', 'Cabinets', 'Countertops', 'Painting Main', 'Appliances', 'HVAC Finish', 'Plumbing Finish', 'Electrical Finish', 'Insulation Ceiling', 'Painting Finish', 'Cleaning') THEN 5
    ELSE phase_order
  END;

INSERT INTO project_phases (project_id, phase_template_id, name, phase_order)
SELECT p.id, pt.id, pt.name, pt.phase_order
FROM projects p
CROSS JOIN phase_templates pt
WHERE NOT EXISTS (
  SELECT 1
  FROM project_phases pp
  WHERE pp.project_id = p.id
    AND pp.phase_template_id = pt.id
);

UPDATE tasks t
SET
  phase_name = tt.phase_name,
  phase_order = tt.phase_order,
  task_order = tt.task_order,
  project_phase_id = pp.id
FROM task_templates tt
LEFT JOIN project_phases pp
  ON pp.phase_template_id = tt.phase_template_id
WHERE t.template_id = tt.id
  AND (pp.project_id = t.project_id OR pp.project_id IS NULL);
