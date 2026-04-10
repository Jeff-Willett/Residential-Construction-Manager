/* 
  SUPABASE MULTI-PROJECT GANTT MANAGER 
  SCHEMA DESTRUCTION, CREATION, AND EXACT SPREADSHEET 44-SCOPE SEEDING
*/

-- 1. DROP EXISTING CONFLICTING TABLES
DROP TABLE IF EXISTS dependencies CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS template_dependencies CASCADE;
DROP TABLE IF EXISTS task_templates CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS vendor_colors CASCADE;

-- 2. CREATE SCHEMA
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_order INTEGER NOT NULL,
  scope TEXT NOT NULL,
  subcontractor TEXT,
  default_days INTEGER DEFAULT 1,
  bottleneck_vendor TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE template_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  predecessor_id UUID REFERENCES task_templates(id) ON DELETE CASCADE,
  successor_id UUID REFERENCES task_templates(id) ON DELETE CASCADE
);

CREATE TABLE tasks (
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

CREATE TABLE dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  predecessor_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  successor_id UUID REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE vendor_colors (
  vendor_name TEXT PRIMARY KEY,
  color TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_colors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for all users" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all users" ON task_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all users" ON template_dependencies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all users" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all users" ON dependencies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all users" ON vendor_colors FOR ALL USING (true) WITH CHECK (true);


-- 3. SPREADSHEET TEMPLATE SEED (ALL 44 EXACT SCOPES WITH SUBCONTRACTORS)
INSERT INTO task_templates (id, task_order, scope, subcontractor, default_days, bottleneck_vendor) VALUES
('aaaa0000-0000-4000-8000-000000000001', 1, 'Estimate', 'Willett & Assoc.', 10, NULL),
('aaaa0000-0000-4000-8000-000000000002', 2, 'Clearing', 'Willett & Assoc.', 3, NULL),
('aaaa0000-0000-4000-8000-000000000003', 3, 'Site Prep', 'Willett & Assoc.', 2, NULL),
('aaaa0000-0000-4000-8000-000000000004', 4, 'Footer', '3C Concrete', 4, '3C Concrete'),
('aaaa0000-0000-4000-8000-000000000005', 5, 'Block', 'Julio H', 10, NULL),
('aaaa0000-0000-4000-8000-000000000006', 6, 'French Drain', 'Jacob Hayden', 2, NULL),
('aaaa0000-0000-4000-8000-000000000007', 7, 'Insulation Block', 'Tyler Champion', 2, NULL),
('aaaa0000-0000-4000-8000-000000000008', 8, 'Rock Work', NULL, 2, NULL),
('aaaa0000-0000-4000-8000-000000000009', 9, 'HVAC Pre', 'Adco', 2, NULL),
('aaaa0000-0000-4000-8000-000000000010', 10, 'Plumbing Pre', 'Hays', 5, 'Hays'),
('aaaa0000-0000-4000-8000-000000000011', 11, 'Electrical Pre', 'Dave Kaler', 2, NULL),
('aaaa0000-0000-4000-8000-000000000012', 12, 'Slab', '3C Concrete', 4, '3C Concrete'),
('aaaa0000-0000-4000-8000-000000000013', 13, 'Framing', 'Gerardo', 30, NULL),
('aaaa0000-0000-4000-8000-000000000014', 14, 'Roofing', 'Rod Smith', 4, NULL),
('aaaa0000-0000-4000-8000-000000000015', 15, 'Brick', 'Julio H', 20, NULL),
('aaaa0000-0000-4000-8000-000000000016', 16, 'Stone', 'Julio H', 20, NULL),
('aaaa0000-0000-4000-8000-000000000017', 17, 'Siding', 'Gerardo', 20, NULL),
('aaaa0000-0000-4000-8000-000000000018', 18, 'Rough Grade', NULL, 2, NULL),
('aaaa0000-0000-4000-8000-000000000019', 19, 'Irrigation', 'Ramiro', 2, NULL),
('aaaa0000-0000-4000-8000-000000000020', 20, 'Finish Grade', 'Jacob Hayden', 2, NULL),
('aaaa0000-0000-4000-8000-000000000021', 21, 'Landscaping', 'Jacob Hayden', 2, NULL),
('aaaa0000-0000-4000-8000-000000000022', 22, 'Lawn Seeding', 'TruGreen', 2, NULL),
('aaaa0000-0000-4000-8000-000000000023', 23, 'Gutter drains', NULL, 2, NULL),
('aaaa0000-0000-4000-8000-000000000024', 24, 'HVAC Rough', 'Adco', 5, NULL),
('aaaa0000-0000-4000-8000-000000000025', 25, 'Plumbing Rough', 'Hays', 5, 'Hays'),
('aaaa0000-0000-4000-8000-000000000026', 26, 'Electrical Rough', 'Dave Kaler', 10, NULL),
('aaaa0000-0000-4000-8000-000000000027', 27, 'Insulation Walls', 'Tyler Champion', 2, NULL),
('aaaa0000-0000-4000-8000-000000000028', 28, 'Sheetrock', 'Bernall Constr.', 15, NULL),
('aaaa0000-0000-4000-8000-000000000029', 29, 'Painting Primer', 'L&L Painting', 3, NULL),
('aaaa0000-0000-4000-8000-000000000030', 30, 'Garage Doors', 'Danny Liedecher', 2, NULL),
('aaaa0000-0000-4000-8000-000000000031', 31, 'Flooring', 'LW Contracting', 5, NULL),
('aaaa0000-0000-4000-8000-000000000032', 32, 'Tile Work', 'LW Contracting', 8, NULL),
('aaaa0000-0000-4000-8000-000000000033', 33, 'Trim Interior', 'Matt Thorne', 20, 'Matt Thorne'),
('aaaa0000-0000-4000-8000-000000000034', 34, 'Trim Exterior', 'Matt Thorne', 2, 'Matt Thorne'),
('aaaa0000-0000-4000-8000-000000000035', 35, 'Cabinets', 'Whittmer', 3, NULL),
('aaaa0000-0000-4000-8000-000000000036', 36, 'Countertops', 'Tate Granit', 2, NULL),
('aaaa0000-0000-4000-8000-000000000037', 37, 'Painting Main', 'L&L Painting', 10, NULL),
('aaaa0000-0000-4000-8000-000000000038', 38, 'Appliances', 'Dave Kaler', 2, NULL),
('aaaa0000-0000-4000-8000-000000000039', 39, 'HVAC Finish', 'Adco', 2, NULL),
('aaaa0000-0000-4000-8000-000000000040', 40, 'Plumbing Finish', 'Hays', 2, 'Hays'),
('aaaa0000-0000-4000-8000-000000000041', 41, 'Electrical Finish', 'Dave Kaler', 4, NULL),
('aaaa0000-0000-4000-8000-000000000042', 42, 'Insulation Ceiling', 'Tyler Champion', 2, NULL),
('aaaa0000-0000-4000-8000-000000000043', 43, 'Painting Finish', 'L&L Painting', 5, NULL),
('aaaa0000-0000-4000-8000-000000000044', 44, 'Cleaning', 'Angies Cleaning', 3, NULL);

-- FULL 44-TASK DEPENDENCY MAPPING FROM SPREADSHEET
INSERT INTO template_dependencies (predecessor_id, successor_id) VALUES
('aaaa0000-0000-4000-8000-000000000001', 'aaaa0000-0000-4000-8000-000000000002'),
('aaaa0000-0000-4000-8000-000000000002', 'aaaa0000-0000-4000-8000-000000000003'),
('aaaa0000-0000-4000-8000-000000000003', 'aaaa0000-0000-4000-8000-000000000004'),
('aaaa0000-0000-4000-8000-000000000004', 'aaaa0000-0000-4000-8000-000000000005'),
('aaaa0000-0000-4000-8000-000000000005', 'aaaa0000-0000-4000-8000-000000000006'),
('aaaa0000-0000-4000-8000-000000000005', 'aaaa0000-0000-4000-8000-000000000007'),
('aaaa0000-0000-4000-8000-000000000007', 'aaaa0000-0000-4000-8000-000000000008'),
('aaaa0000-0000-4000-8000-000000000008', 'aaaa0000-0000-4000-8000-000000000009'),
('aaaa0000-0000-4000-8000-000000000008', 'aaaa0000-0000-4000-8000-000000000010'),
('aaaa0000-0000-4000-8000-000000000008', 'aaaa0000-0000-4000-8000-000000000011'),
('aaaa0000-0000-4000-8000-000000000010', 'aaaa0000-0000-4000-8000-000000000012'),
('aaaa0000-0000-4000-8000-000000000012', 'aaaa0000-0000-4000-8000-000000000013'),
('aaaa0000-0000-4000-8000-000000000013', 'aaaa0000-0000-4000-8000-000000000014'),
('aaaa0000-0000-4000-8000-000000000014', 'aaaa0000-0000-4000-8000-000000000015'),
('aaaa0000-0000-4000-8000-000000000014', 'aaaa0000-0000-4000-8000-000000000016'),
('aaaa0000-0000-4000-8000-000000000014', 'aaaa0000-0000-4000-8000-000000000017'),
('aaaa0000-0000-4000-8000-000000000015', 'aaaa0000-0000-4000-8000-000000000018'),
('aaaa0000-0000-4000-8000-000000000018', 'aaaa0000-0000-4000-8000-000000000019'),
('aaaa0000-0000-4000-8000-000000000019', 'aaaa0000-0000-4000-8000-000000000020'),
('aaaa0000-0000-4000-8000-000000000019', 'aaaa0000-0000-4000-8000-000000000021'),
('aaaa0000-0000-4000-8000-000000000020', 'aaaa0000-0000-4000-8000-000000000022'),
('aaaa0000-0000-4000-8000-000000000018', 'aaaa0000-0000-4000-8000-000000000023'),
('aaaa0000-0000-4000-8000-000000000013', 'aaaa0000-0000-4000-8000-000000000024'),
('aaaa0000-0000-4000-8000-000000000013', 'aaaa0000-0000-4000-8000-000000000025'),
('aaaa0000-0000-4000-8000-000000000013', 'aaaa0000-0000-4000-8000-000000000026'),
('aaaa0000-0000-4000-8000-000000000026', 'aaaa0000-0000-4000-8000-000000000027'),
('aaaa0000-0000-4000-8000-000000000027', 'aaaa0000-0000-4000-8000-000000000028'),
('aaaa0000-0000-4000-8000-000000000028', 'aaaa0000-0000-4000-8000-000000000029'),
('aaaa0000-0000-4000-8000-000000000029', 'aaaa0000-0000-4000-8000-000000000030'),
('aaaa0000-0000-4000-8000-000000000029', 'aaaa0000-0000-4000-8000-000000000031'),
('aaaa0000-0000-4000-8000-000000000029', 'aaaa0000-0000-4000-8000-000000000032'),
('aaaa0000-0000-4000-8000-000000000031', 'aaaa0000-0000-4000-8000-000000000033'),
('aaaa0000-0000-4000-8000-000000000017', 'aaaa0000-0000-4000-8000-000000000034'),
('aaaa0000-0000-4000-8000-000000000031', 'aaaa0000-0000-4000-8000-000000000035'),
('aaaa0000-0000-4000-8000-000000000035', 'aaaa0000-0000-4000-8000-000000000036'),
('aaaa0000-0000-4000-8000-000000000036', 'aaaa0000-0000-4000-8000-000000000037'),
('aaaa0000-0000-4000-8000-000000000036', 'aaaa0000-0000-4000-8000-000000000038'),
('aaaa0000-0000-4000-8000-000000000037', 'aaaa0000-0000-4000-8000-000000000039'),
('aaaa0000-0000-4000-8000-000000000036', 'aaaa0000-0000-4000-8000-000000000040'),
('aaaa0000-0000-4000-8000-000000000037', 'aaaa0000-0000-4000-8000-000000000041'),
('aaaa0000-0000-4000-8000-000000000041', 'aaaa0000-0000-4000-8000-000000000042'),
('aaaa0000-0000-4000-8000-000000000041', 'aaaa0000-0000-4000-8000-000000000043'),
('aaaa0000-0000-4000-8000-000000000043', 'aaaa0000-0000-4000-8000-000000000044');


-- 4 SPREADSHEET PROJECTS (IW10, IW11, IW12, IW13)
-- Start dates artificially close together to enforce bottleneck collision across the full 44 scopes
INSERT INTO projects (id, name, start_date) VALUES 
('b1110000-0000-4000-8000-000000000000', 'IW10', '2026-04-01'),
('b2220000-0000-4000-8000-000000000000', 'IW11', '2026-04-10'),
('b3330000-0000-4000-8000-000000000000', 'IW12', '2026-04-20'),
('b4440000-0000-4000-8000-000000000000', 'IW13', '2026-05-01');

-- Dynamic block that precisely duplicates ALL 44 tasks into ALL 4 projects = 176 accurate tasks.
DO $$
DECLARE
    proj RECORD;
    temp RECORD;
    new_task_id UUID;
BEGIN
    FOR proj IN SELECT * FROM projects LOOP
        FOR temp IN SELECT * FROM task_templates ORDER BY task_order LOOP
            -- Deterministic ID mapping suffix strategy
            new_task_id := (substring(proj.id::text from 1 for 18) || substring(temp.id::text from 19 for 18))::uuid;
            
            INSERT INTO tasks (id, project_id, template_id, name, subcontractor, bottleneck_vendor, duration)
            VALUES (new_task_id, proj.id, temp.id, temp.scope, temp.subcontractor, temp.bottleneck_vendor, temp.default_days);
        END LOOP;
        
        -- Map ALL dependencies precisely 
        INSERT INTO dependencies (predecessor_id, successor_id)
        SELECT 
            (substring(proj.id::text from 1 for 18) || substring(td.predecessor_id::text from 19 for 18))::uuid,
            (substring(proj.id::text from 1 for 18) || substring(td.successor_id::text from 19 for 18))::uuid
        FROM template_dependencies td;
    END LOOP;
END $$;
