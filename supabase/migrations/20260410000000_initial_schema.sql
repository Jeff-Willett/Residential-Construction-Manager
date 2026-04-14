/*
  INITIAL SCHEMA
  Residential Construction Manager
  Hierarchy: Project -> Phase -> Scope Task
*/

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS phase_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phase_order INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_template_id UUID REFERENCES phase_templates(id) ON DELETE SET NULL,
  phase_name TEXT,
  phase_order INTEGER DEFAULT 0,
  task_order INTEGER NOT NULL,
  scope TEXT NOT NULL,
  subcontractor TEXT,
  default_days INTEGER DEFAULT 1,
  bottleneck_vendor TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS template_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  predecessor_id UUID REFERENCES task_templates(id) ON DELETE CASCADE,
  successor_id UUID REFERENCES task_templates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  phase_template_id UUID REFERENCES phase_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phase_order INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_phase_id UUID REFERENCES project_phases(id) ON DELETE SET NULL,
  template_id UUID REFERENCES task_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phase_name TEXT,
  phase_order INTEGER DEFAULT 0,
  task_order INTEGER DEFAULT 0,
  subcontractor TEXT,
  bottleneck_vendor TEXT,
  duration INTEGER DEFAULT 1,
  lag INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  predecessor_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  successor_id UUID REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vendor_colors (
  vendor_name TEXT PRIMARY KEY,
  color TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_colors ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'projects' AND policyname = 'Enable all for all users'
  ) THEN
    CREATE POLICY "Enable all for all users" ON projects FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'phase_templates' AND policyname = 'Enable all for all users'
  ) THEN
    CREATE POLICY "Enable all for all users" ON phase_templates FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'task_templates' AND policyname = 'Enable all for all users'
  ) THEN
    CREATE POLICY "Enable all for all users" ON task_templates FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'template_dependencies' AND policyname = 'Enable all for all users'
  ) THEN
    CREATE POLICY "Enable all for all users" ON template_dependencies FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'project_phases' AND policyname = 'Enable all for all users'
  ) THEN
    CREATE POLICY "Enable all for all users" ON project_phases FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tasks' AND policyname = 'Enable all for all users'
  ) THEN
    CREATE POLICY "Enable all for all users" ON tasks FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'dependencies' AND policyname = 'Enable all for all users'
  ) THEN
    CREATE POLICY "Enable all for all users" ON dependencies FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vendor_colors' AND policyname = 'Enable all for all users'
  ) THEN
    CREATE POLICY "Enable all for all users" ON vendor_colors FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
