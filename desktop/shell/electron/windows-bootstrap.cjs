'use strict'
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const extract = require('extract-zip')

async function exists(target) {
  try { await fs.access(target); return true } catch { return false }
}

async function verify(file, expected) {
  const bytes = await fs.readFile(file)
  const digest = crypto.createHash('sha256').update(bytes).digest('hex')
  if (bytes.length !== expected.size || digest !== expected.sha256) {
    throw new Error(`Bundled bootstrap artifact failed verification: ${path.basename(file)}`)
  }
}

async function replaceJunction(link, target) {
  // Links are only created under setup-owned roots. Removing the junction itself must never
  // become a recursive deletion of the immutable version directory it points at.
  await fs.rm(link, { recursive: true, force: true })
  await fs.mkdir(path.dirname(link), { recursive: true })
  await fs.symlink(target, link, 'junction')
}

/**
 * Seed a complete local installation on first Windows launch. The seed versions are bundled
 * with the shell only to remove installation ordering from the user experience. Once Core is
 * running, the normal signed release channel updates Core, GUI and Skill independently.
 */
async function ensureWindowsInstallation({ dialog, applicationRoot, resourcesPath }) {
  if (process.platform !== 'win32') return
  const receipt = path.join(applicationRoot, 'installation.json')
  if (await exists(receipt)) {
    const installed = JSON.parse(await fs.readFile(receipt, 'utf8'))
    const required = [
      path.join(applicationRoot, 'current', 'core', 'colabd.exe'),
      path.join(applicationRoot, 'current', 'ui', 'index.html'),
      path.join(applicationRoot, 'current', 'skill', 'SKILL.md'),
      path.join(applicationRoot, 'run-core.cmd'),
    ]
    if (installed.installed === true && (await Promise.all(required.map(exists))).every(Boolean)) return
    throw new Error('The Agent Colab installation receipt exists but required files are missing')
  }

  const consent = await dialog.showMessageBox({
    type: 'info',
    title: 'Set up Agent Colab',
    message: 'Agent Colab will install its Local Core, browser interface, and Codex Skill for this Windows account.',
    detail: 'The official desktop build includes its sign-in configuration. Components can update independently after setup.',
    buttons: ['Continue', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  })
  if (consent.response !== 0) throw new Error('Agent Colab setup was canceled')
  const seedRoot = path.join(resourcesPath, 'bootstrap-windows')
  const bundledCredentials = path.join(seedRoot, 'google-oauth.json')
  const credentialsPayload = JSON.parse(await fs.readFile(bundledCredentials, 'utf8'))
  if (!credentialsPayload.installed?.client_id || !credentialsPayload.installed?.client_secret) {
    throw new Error('The official sign-in configuration in this build is invalid')
  }

  const metadata = JSON.parse(await fs.readFile(path.join(seedRoot, 'bootstrap.json'), 'utf8'))
  for (const [name, expected] of Object.entries(metadata.artifacts)) {
    await verify(path.join(seedRoot, name), expected)
  }
  const versionsRoot = path.join(applicationRoot, 'versions')
  const coreRoot = path.join(versionsRoot, 'local-core', metadata.componentVersions['local-core'])
  const uiRoot = path.join(versionsRoot, 'desktop-ui', metadata.componentVersions['desktop-ui'])
  const skillContainer = path.join(versionsRoot, 'colab-skill', metadata.componentVersions['colab-skill'])
  await Promise.all([coreRoot, uiRoot, skillContainer].map(value => fs.mkdir(value, { recursive: true })))
  await extract(path.join(seedRoot, 'local-core.zip'), { dir: coreRoot })
  await extract(path.join(seedRoot, 'desktop-ui.zip'), { dir: uiRoot })
  await extract(path.join(seedRoot, 'agent-colab-skill.zip'), { dir: skillContainer })
  const skillRoot = path.join(skillContainer, metadata.componentVersions['colab-skill'])
  await replaceJunction(path.join(applicationRoot, 'current', 'core'), coreRoot)
  await replaceJunction(path.join(applicationRoot, 'current', 'ui'), uiRoot)
  await replaceJunction(path.join(applicationRoot, 'current', 'skill'), skillRoot)
  await replaceJunction(path.join(os.homedir(), '.agents', 'skills', 'agent-colab'), skillRoot)

  const configRoot = path.join(applicationRoot, 'config')
  const dataRoot = path.join(applicationRoot, 'data')
  await fs.mkdir(configRoot, { recursive: true })
  await fs.mkdir(dataRoot, { recursive: true })
  const credentials = path.join(configRoot, 'google-oauth.json')
  await fs.copyFile(bundledCredentials, credentials)
  const runner = path.join(applicationRoot, 'run-core.cmd')
  const discovery = path.join(applicationRoot, 'discovery.json')
  const setup = path.join(skillRoot, 'setup', 'colab-setup')
  const lines = [
    '@echo off',
    `set "COLAB_SERVER_URL=${metadata.serverUrl}"`,
    `set "COLAB_GUI_ROOT=${path.join(applicationRoot, 'current', 'ui')}"`,
    `set "COLAB_GOOGLE_OAUTH_CREDENTIALS_FILE=${credentials}"`,
    `set "COLAB_DISCOVERY_FILE=${discovery}"`,
    `set "COLAB_LOCAL_DATABASE_PATH=${path.join(dataRoot, 'colab.sqlite3')}"`,
    `set "COLAB_SETUP_PATH=${setup}"`,
    'set "COLAB_MANAGED_SERVICE=windows-task"',
    `"${path.join(applicationRoot, 'current', 'core', 'colabd.exe')}"`,
  ]
  await fs.writeFile(runner, lines.join('\r\n') + '\r\n', 'utf8')
  const created = spawnSync('schtasks.exe', ['/Create', '/TN', 'AgentColabCore', '/TR', `"${runner}"`, '/SC', 'ONLOGON', '/RL', 'LIMITED', '/F'], { windowsHide: true })
  if (created.status !== 0) throw new Error(`Could not register Agent Colab Local Core: ${created.stderr?.toString() || created.status}`)
  // Write the receipt last. Its presence is the commit point used by later launches, so an
  // interrupted extraction or task registration remains retryable rather than looking healthy.
  await fs.writeFile(receipt, JSON.stringify({
    installed: true,
    version: metadata.releaseVersion,
    componentVersions: metadata.componentVersions,
    manifest: metadata.manifest,
    serverUrl: metadata.serverUrl,
    agents: ['codex'],
    installedAt: Date.now() / 1000,
  }, null, 2) + '\n')
}

module.exports = { ensureWindowsInstallation }
