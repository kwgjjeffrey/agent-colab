'use strict'
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const repo = path.resolve(__dirname, '../../..')
const output = path.join(repo, 'desktop/shell/bootstrap/windows')
const readVersion = relative => fs.readFileSync(path.join(repo, relative), 'utf8').trim()
const versions = {
  release: readVersion('VERSION'),
  core: readVersion('local/VERSION'),
  ui: readVersion('desktop/ui/VERSION'),
  skill: readVersion('skills/colab/VERSION'),
}
const inputs = [
  ['local-core.zip', `dist/local-core/${versions.core}/windows-x86_64.zip`],
  ['desktop-ui.zip', `dist/desktop-ui/${versions.ui}.zip`],
  ['agent-colab-skill.zip', `dist/colab-skill/${versions.skill}.zip`],
]

fs.rmSync(output, { recursive: true, force: true })
fs.mkdirSync(output, { recursive: true })
const artifacts = {}
for (const [name, relative] of inputs) {
  const source = path.join(repo, relative)
  if (!fs.existsSync(source)) throw new Error(`Missing bootstrap artifact: ${source}`)
  const destination = path.join(output, name)
  fs.copyFileSync(source, destination)
  const bytes = fs.readFileSync(destination)
  artifacts[name] = { size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }
}
fs.writeFileSync(path.join(output, 'bootstrap.json'), JSON.stringify({
  releaseVersion: versions.release,
  componentVersions: { 'local-core': versions.core, 'desktop-ui': versions.ui, 'colab-skill': versions.skill },
  serverUrl: process.env.COLAB_SERVER_URL || 'http://108.174.57.132:8787',
  manifest: process.env.COLAB_RELEASE_MANIFEST || 'https://artifacts.agent-colab.zhiyuanwangluo.online/channels/stable.json',
  artifacts,
}, null, 2) + '\n')
