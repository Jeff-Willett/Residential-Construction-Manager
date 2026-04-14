# Environment Policy

This is the standing rule for database environment selection in this repository.

## Default mapping

- `main` -> `production`
- any non-`main` branch -> `branch-super-base`
- local development -> `branch-super-base`
- Vercel Preview -> `branch-super-base`
- Vercel Production -> `production`

## Working rule

If a request mentions branch work, feature work, testing, previewing, or local development, use `branch-super-base`.

If a request mentions `production` explicitly, use production.

If a request does not explicitly say `production`, do not use production.

## Examples

- "make a branch for issue 21" -> `branch-super-base`
- "branch off this branch and test a fix" -> `branch-super-base`
- "check whether production matches the backup" -> `production`
- "refresh the testing data" -> `branch-super-base`
- "restore production from backup" -> `production`

## Why this rule exists

- protects live data from normal branch/testing workflows
- makes branch behavior predictable
- keeps production actions deliberate and auditable
