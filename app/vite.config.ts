import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const readAppVersion = () => {
  const packageJsonPath = resolve(__dirname, 'package.json')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version?: string }
  return packageJson.version ?? '0.0.0'
}

const readGitValue = (command: string, fallback: string) => {
  try {
    return execSync(command, { cwd: resolve(__dirname, '..') }).toString().trim() || fallback
  } catch {
    return fallback
  }
}

const appVersion = readAppVersion()
const gitBranch = readGitValue('git branch --show-current', 'unknown-branch')
const gitCommit = readGitValue('git rev-parse --short HEAD', 'unknown-commit')
const vercelEnv = process.env.VERCEL_ENV ?? process.env.PUBLIC_VERCEL_ENV ?? null

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __GIT_BRANCH__: JSON.stringify(gitBranch),
    __GIT_COMMIT__: JSON.stringify(gitCommit),
    __VERCEL_ENV__: JSON.stringify(vercelEnv)
  }
})
