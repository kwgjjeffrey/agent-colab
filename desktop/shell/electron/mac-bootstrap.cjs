'use strict'
const fs = require('node:fs/promises')
const path = require('node:path')
const { spawn } = require('node:child_process')

async function exists(file) {
  try { await fs.access(file); return true } catch { return false }
}

/** First launch delegates component installation to the signed-channel bootstrap, never to Electron business logic. */
async function ensureMacInstallation({ applicationRoot, resourcesPath, showProgress, runInstaller }) {
  if (process.platform !== 'darwin' || process.env.COLAB_UI_DEV_URL || process.env.COLAB_LOCAL_GUI_URL) return
  const receipt = path.join(applicationRoot, 'installation.json')
  const required = [
    path.join(applicationRoot, 'current', 'core', 'colabd'),
    path.join(applicationRoot, 'current', 'ui', 'index.html'),
    path.join(applicationRoot, 'current', 'skill', 'SKILL.md'),
  ]
  if (await exists(receipt) && (await Promise.all(required.map(exists))).every(Boolean)) return

  const installer = path.join(resourcesPath, 'bootstrap-macos', 'colab-install')
  if (!await exists(installer)) throw new Error('This Colab application is missing its macOS bootstrap installer')
  const closeProgress = showProgress?.() ?? (() => {})
  try {
    await (runInstaller ?? runBootstrap)(installer)
    if (!await exists(receipt) || !(await Promise.all(required.map(exists))).every(Boolean)) {
      throw new Error('Agent Colab setup finished without the required Core, GUI, and Skill files')
    }
  } finally {
    closeProgress()
  }
}

function runBootstrap(installer) {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/bash', [installer], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    const append = chunk => { output = (output + chunk.toString()).slice(-4096) }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`Agent Colab component setup failed (${code}): ${output.trim()}`)))
  })
}

module.exports = { ensureMacInstallation }
