/* 
  SUPABASE SCHEMA FOR RESIDENTIAL CONSTRUCTION MULTI-PROJECT GANTT MANAGER
  Copy and paste this into the Supabase SQL Editor
*/

-- 1. Create the Projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create the Task Templates table
CREATE TABLE IF NOT EXISTS task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_order INTEGER NOT NULL,
  scope TEXT NOT NULL,
  subcontractor TEXT,
  default_days INTEGER DEFAULT 1,
  bottleneck_vendor TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create the Template Dependencies table
CREATE TABLE IF NOT EXISTS template_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  predecessor_id UUID REFERENCES task_templates(id) ON DELETE CASCADE,
  successor_id UUID REFERENCES task_templates(id) ON DELETE CASCADE
);

-- 4. Create the Project Tasks table (replaces generic 'tasks')
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  template_id UUID REFERENCES task_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  subcontractor TEXT,
  bottleneck_vendor TEXT,
  duration INTEGER DEFAULT 1,
  lag INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create the Dependencies table (for Project Tasks)
CREATE TABLE IF NOT EXISTS dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  predecessor_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  successor_id UUID REFERENCES tasks(id) ON DELETE CASCADE
);

-- 6. Create Vendor Colors table
CREATE TABLE IF NOT EXISTS vendor_colors (
  vendor_name TEXT PRIMARY KEY,
  color TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Enable Row Level Security (RLS)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_colors ENABLE ROW LEVEL SECURITY;

-- 8. Create "Allow All" Policies (for initial testing - update these later for security)
CREATE POLICY "Enable all for all users" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all users" ON task_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all users" ON template_dependencies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all users" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all users" ON dependencies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all users" ON vendor_colors FOR ALL USING (true) WITH CHECK (true);

/*
-- Optional: Initialize Template Data
INSERT INTO task_templates (task_order, scope, subcontractor, default_days, bottleneck_vendor) VALUES
(1, 'Estimate', 'Willett & Assoc.', 10, NULL),
(2, 'Clearing', 'Willett & Assoc.', 3, NULL),
(3, 'Site Prep', 'Willett & Assoc.', 2, NULL),
(4, 'Footer', '3C Concrete', 4, '3C Concrete'),
(5, 'Block', 'Julio H', 10, NULL),
(6, 'French Drain', 'Jacob Hayden', 2, NULL),
(7, 'Insulation Block', 'Tyler Champion', 2, NULL),
(8, 'Rock Work', NULL, 2, NULL),
(9, 'HVAC Pre', 'Adco', 2, NULL),
(10, 'Plumbing Pre', 'Hays', 5, 'Hays');
*/
