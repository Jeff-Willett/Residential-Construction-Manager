import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const snapshotsDir = path.join(repoRoot, 'snapshots', 'testing-data');
const latestSnapshotPath = path.join(snapshotsDir, 'latest.json');

const tableConfigs = [
  { name: 'projects', orderBy: 'id.asc', deleteFilter: 'id=not.is.null' },
  { name: 'phase_templates', orderBy: 'phase_order.asc', deleteFilter: 'id=not.is.null' },
  { name: 'task_templates', orderBy: 'task_order.asc', deleteFilter: 'id=not.is.null' },
  { name: 'template_dependencies', orderBy: 'id.asc', deleteFilter: 'id=not.is.null' },
  { name: 'project_phases', orderBy: 'phase_order.asc', deleteFilter: 'id=not.is.null' },
  { name: 'tasks', orderBy: 'id.asc', deleteFilter: 'id=not.is.null' },
  { name: 'dependencies', orderBy: 'id.asc', deleteFilter: 'id=not.is.null' },
  { name: 'vendor_colors', orderBy: 'vendor_name.asc', deleteFilter: 'vendor_name=not.is.null' },
];

const deleteOrder = [
  'dependencies',
  'tasks',
  'project_phases',
  'template_dependencies',
  'task_templates',
  'phase_templates',
  'projects',
  'vendor_colors',
];

const insertOrder = [
  'projects',
  'phase_templates',
  'task_templates',
  'template_dependencies',
  'project_phases',
  'tasks',
  'dependencies',
  'vendor_colors',
];

const command = process.argv[2];
const options = parseArgs(process.argv.slice(3));

async function main() {
  switch (command) {
    case 'status':
      await runStatus();
      return;
    case 'snapshot':
      await runSnapshot();
      return;
    case 'refresh':
      await runRefresh();
      return;
    default:
      printHelp();
      process.exitCode = 1;
  }
}

async function runStatus() {
  ensureSnapshotsDir();
  const target = resolveTargetEnv(options.env);
  const liveSnapshot = await fetchSnapshot(target);
  const baseline = loadSnapshot(options.snapshot || latestSnapshotPath);

  console.log(`Target environment: ${target.name}`);
  console.log(`Project ref: ${liveSnapshot.projectRef}`);
  console.log(`Snapshot file: ${path.relative(repoRoot, options.snapshot || latestSnapshotPath)}`);
  console.log(`Live checksum: ${liveSnapshot.checksum}`);
  console.log(`Baseline checksum: ${baseline.checksum}`);
  console.log('');

  if (liveSnapshot.checksum === baseline.checksum) {
    console.log('Status: MATCH');
    return;
  }

  console.log('Status: DRIFTED');
  for (const table of tableConfigs) {
    const liveCount = liveSnapshot.counts[table.name] ?? 0;
    const baselineCount = baseline.counts[table.name] ?? 0;
    if (liveCount !== baselineCount) {
      console.log(`- ${table.name}: live=${liveCount}, baseline=${baselineCount}`);
    }
  }
}

async function runSnapshot() {
  ensureSnapshotsDir();
  const target = resolveTargetEnv(options.env);
  const label = sanitizeLabel(options.label || `${target.name}-snapshot`);
  const snapshot = await fetchSnapshot(target);
  const filename = `${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}-${label}.json`;
  const outputPath = path.join(snapshotsDir, filename);

  writeSnapshot(outputPath, snapshot);
  writeSnapshot(latestSnapshotPath, snapshot);

  console.log(`Created snapshot for ${target.name}`);
  console.log(`- ${path.relative(repoRoot, outputPath)}`);
  console.log(`- ${path.relative(repoRoot, latestSnapshotPath)}`);
}

async function runRefresh() {
  ensureSnapshotsDir();
  const target = resolveTargetEnv(options.env);
  const snapshotPath = options.snapshot || latestSnapshotPath;
  const snapshot = loadSnapshot(snapshotPath);

  if (target.name === 'production' && !options['allow-production-refresh']) {
    throw new Error(
      'Refusing to refresh production without --allow-production-refresh. This guardrail is intentional.'
    );
  }

  const liveSnapshot = await fetchSnapshot(target);
  const backupLabel = sanitizeLabel(`${target.name}-backup-before-refresh`);
  const backupPath = path.join(
    snapshotsDir,
    `${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}-${backupLabel}.json`
  );
  writeSnapshot(backupPath, liveSnapshot);

  for (const table of deleteOrder) {
    const tableConfig = tableConfigs.find((entry) => entry.name === table);
    await deleteAllRows(target, tableConfig);
  }

  for (const table of insertOrder) {
    const rows = snapshot.tables[table] || [];
    if (rows.length > 0) {
      await insertRows(target, table, rows);
    }
  }

  const refreshedSnapshot = await fetchSnapshot(target);
  if (refreshedSnapshot.checksum !== snapshot.checksum) {
    throw new Error('Refresh completed, but the final checksum does not match the requested snapshot.');
  }

  console.log(`Refreshed ${target.name} from ${path.relative(repoRoot, snapshotPath)}`);
  console.log(`Safety backup: ${path.relative(repoRoot, backupPath)}`);
}

function resolveTargetEnv(requestedEnv) {
  const env = loadEnvFiles();
  const name = requestedEnv || env.TESTING_DATA_DEFAULT_ENV || 'branch-super-base';

  if (name === 'branch-super-base') {
    const resolvedUrl =
      env.BRANCH_SUPER_BASE_SUPABASE_URL ||
      env.VITE_SUPABASE_URL ||
      env.APP_VITE_SUPABASE_URL;

    const productionUrl = env.PRODUCTION_SUPABASE_URL;
    if (productionUrl && resolvedUrl === productionUrl) {
      throw new Error(
        'Resolved branch-super-base URL matches the production URL — BRANCH_SUPER_BASE_SUPABASE_URL is missing or wrong in .env.local. Refusing to proceed.'
      );
    }

    return {
      name,
      url: resolvedUrl,
      serviceRoleKey:
        env.BRANCH_SUPER_BASE_SERVICE_ROLE_KEY ||
        env.SUPABASE_SERVICE_ROLE_KEY,
    };
  }

  if (name === 'production') {
    return {
      name,
      url: env.PRODUCTION_SUPABASE_URL,
      serviceRoleKey: env.PRODUCTION_SERVICE_ROLE_KEY,
    };
  }

  throw new Error(`Unsupported env "${name}". Use "branch-super-base" or "production".`);
}

async function fetchSnapshot(target) {
  validateTarget(target);

  const tables = {};
  const counts = {};

  for (const table of tableConfigs) {
    const rows = normalizeRows(await selectAllRows(target, table.name, table.orderBy));
    tables[table.name] = rows;
    counts[table.name] = rows.length;
  }

  return {
    snapshotVersion: 2,
    environment: target.name,
    generatedAt: new Date().toISOString(),
    projectRef: extractProjectRef(target.url),
    supabaseUrl: target.url,
    counts,
    checksum: checksumTables(tables),
    tables,
  };
}

async function selectAllRows(target, table, orderBy) {
  const url = new URL(`/rest/v1/${table}`, target.url);
  url.searchParams.set('select', '*');
  url.searchParams.set('order', orderBy);

  const response = await fetch(url, {
    headers: buildHeaders(target.serviceRoleKey),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${table}: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function deleteAllRows(target, tableConfig) {
  const url = new URL(`/rest/v1/${tableConfig.name}`, target.url);
  const [filterKey, filterValue] = tableConfig.deleteFilter.split('=');
  url.searchParams.set(filterKey, filterValue);

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      ...buildHeaders(target.serviceRoleKey),
      Prefer: 'return=minimal',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to clear ${tableConfig.name}: ${response.status} ${await response.text()}`);
  }
}

async function insertRows(target, table, rows) {
  const response = await fetch(new URL(`/rest/v1/${table}`, target.url), {
    method: 'POST',
    headers: {
      ...buildHeaders(target.serviceRoleKey),
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    throw new Error(`Failed to insert ${table}: ${response.status} ${await response.text()}`);
  }
}

function buildHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
}

function validateTarget(target) {
  if (!target.url || !target.serviceRoleKey) {
    throw new Error(
      `Missing credentials for ${target.name}. Check .env.local and configure the matching Supabase URL and service role key.`
    );
  }
}

function loadSnapshot(snapshotPath) {
  if (!existsSync(snapshotPath)) {
    throw new Error(`Snapshot file not found: ${snapshotPath}`);
  }

  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const normalizedTables = Object.fromEntries(
    Object.entries(snapshot.tables || {}).map(([tableName, rows]) => [tableName, normalizeRows(rows || [])])
  );

  return {
    ...snapshot,
    tables: normalizedTables,
    checksum: checksumTables(normalizedTables),
  };
}

function writeSnapshot(filePath, snapshot) {
  writeFileSync(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function checksumTables(tables) {
  return createHash('sha256').update(stableStringify(tables)).digest('hex');
}

function normalizeRows(rows) {
  return [...rows].sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

function extractProjectRef(url) {
  try {
    return new URL(url).hostname.split('.')[0];
  } catch {
    return 'unknown';
  }
}

function ensureSnapshotsDir() {
  mkdirSync(snapshotsDir, { recursive: true });
}

function sanitizeLabel(value) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'snapshot';
}

function parseArgs(args) {
  const parsed = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = next;
    index += 1;
  }

  return parsed;
}

function loadEnvFiles() {
  const merged = {};
  const envFiles = [
    path.join(repoRoot, '.env.local'),
    path.join(repoRoot, 'app', '.env.local'),
  ];

  for (const filePath of envFiles) {
    if (!existsSync(filePath)) {
      continue;
    }

    const contents = readFileSync(filePath, 'utf8');
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }

      const separator = line.indexOf('=');
      if (separator === -1) {
        continue;
      }

      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      merged[key] = value;
      if (filePath.endsWith(path.join('app', '.env.local')) && key.startsWith('VITE_')) {
        merged[`APP_${key}`] = value;
      }
    }
  }

  return { ...merged, ...process.env };
}

function printHelp() {
  console.log(`Usage:
  npm run testing:status -- [--env branch-super-base|production] [--snapshot snapshots/testing-data/latest.json]
  npm run testing:snapshot -- --label "baseline-super-base" [--env branch-super-base|production]
  npm run testing:refresh -- [--env branch-super-base|production] [--snapshot snapshots/testing-data/latest.json] [--allow-production-refresh]
`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
