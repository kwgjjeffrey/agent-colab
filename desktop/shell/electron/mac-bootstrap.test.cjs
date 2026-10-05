'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { ensureMacInstallation } = require('./mac-bootstrap.cjs')

test('a fresh macOS app delegates setup and checks every installed component', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'colab-mac-bootstrap-'))
  const resourcesPath = path.join(root, 'resources')
  const applicationRoot = path.join(root, 'application')
  const installer = path.join(resourcesPath, 'bootstrap-macos', 'colab-install')
  try {
    await fs.mkdir(path.dirname(installer), { recursive: true })
    await fs.writeFile(installer, '#!/bin/bash\n')
    let runs = 0
    let closes = 0
    const options = { applicationRoot, resourcesPath, showProgress: () => () => { closes++ }, runInstaller: async file => {
      assert.equal(file, installer)
      runs++
      for (const item of ['current/core/colabd', 'current/ui/index.html', 'current/skill/SKILL.md', 'installation.json']) {
        const destination = path.join(applicationRoot, item)
        await fs.mkdir(path.dirname(destination), { recursive: true })
        await fs.writeFile(destination, '{}')
      }
    } }
    await ensureMacInstallation(options)
    await ensureMacInstallation(options)
    assert.equal(runs, 1)
    assert.equal(closes, 1)
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})
