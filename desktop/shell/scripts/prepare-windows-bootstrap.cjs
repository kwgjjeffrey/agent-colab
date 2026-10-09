'use strict'
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const repo = path.resolve(__dirname, '../../..')
const output = path.join(repo, 'desktop/shell/bootstrap/windows')
const localConfig = path.join(repo, 'packaging/.env.local')
function configValue(name) {
  if (process.env[name]) return process.env[name]
  if (!fs.existsSync(localConfig)) return null
  const line = fs.readFileSync(localConfig, 'utf8').split(/\r?\n/).find(value => value.startsWith(`${name}=`))
  return line ? line.slice(name.length + 1).replace(/^['"]|['"]$/g, '') : null
}
const oauthSource = configValue('COLAB_DESKTOP_GOOGLE_OAUTH_CREDENTIALS_FILE')
if (!oauthSource || !fs.existsSync(oauthSource)) {
  throw new Error('Set COLAB_DESKTOP_GOOGLE_OAUTH_CREDENTIALS_FILE to the official Google Desktop OAuth client JSON')
}
const oauth = JSON.parse(fs.readFileSync(oauthSource, 'utf8'))
if (!oauth.installed?.client_id || !oauth.installed?.client_secret) {
  throw new Error('COLAB_DESKTOP_GOOGLE_OAUTH_CREDENTIALS_FILE is not a Google Desktop OAuth client JSON')
}
const readVersion = relative => fs.readFileSync(path.join(repo, relative), 'utf8').trim()
const versions = {
  release: readVersion('VERSION'),
  core: readVersion('local/VERSION'),
  ui: readVersion('desktop/ui/VERSION'),
  skill: readVersion('skills/colab/VERSION'),
}
const artifactConfig = JSON.parse(fs.readFileSync(process.env.COLAB_ARTIFACT_CONFIG || path.join(repo, 'packaging/artifact-config.local.json'), 'utf8'))
const inputs = [
  ['local-core.zip', `dist/local-core/${versions.core}/windows-x86_64.zip`],
  ['desktop-ui.zip', `dist/desktop-ui/${versions.ui}.zip`],
  ['agent-colab-skill.zip', `dist/colab-skill/${versions.skill}.zip`],
]

fs.rmSync(output, { recursive: true, force: true })
fs.mkdirSync(output, { recursive: true })
// OAuth desktop client credentials are distribution configuration, not end-user input. The
// ignored source path keeps an open-source fork independent while the packaged build remains
// self-contained. Installed-app client secrets are not treated as confidential by OAuth.
fs.copyFileSync(oauthSource, path.join(output, 'google-oauth.json'))
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
  serverUrl: artifactConfig.serverUrl,
  manifest: artifactConfig.releaseManifestUrl,
  artifacts,
}, null, 2) + '\n')
