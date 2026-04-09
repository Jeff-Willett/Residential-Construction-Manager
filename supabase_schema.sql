/* 
  SUPABASE SCHEMA FOR RESIDENTIAL CONSTRUCTION GANTT MANAGER
  Copy and paste this into the Supabase SQL Editor
*/

-- 1. Create the Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subcontractor TEXT,
  duration INTEGER DEFAULT 1,
  lag INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create the Dependencies table
CREATE TABLE IF NOT EXISTS dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  predecessor_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  successor_id UUID REFERENCES tasks(id) ON DELETE CASCADE
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE dependencies ENABLE ROW LEVEL SECURITY;

-- 4. Create "Allow All" Policies (for initial testing - update these later for security)
CREATE POLICY "Enable all for all users" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all users" ON dependencies FOR ALL USING (true) WITH CHECK (true);

-- 5. Insert Initial Data (Optional - comment out if not needed)
/*
INSERT INTO tasks (name, subcontractor, duration) VALUES 
('Estimate', 'Willett & Assoc.', 10),
('Clearing', 'Willett & Assoc.', 3),
('Site Prep', 'Willett & Assoc.', 2),
('Footer', '3C Concrete', 4),
('Block', 'Julio H', 6);
*/
