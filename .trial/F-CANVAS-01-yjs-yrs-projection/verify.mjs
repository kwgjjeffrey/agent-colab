import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as Y from 'yjs'
import { yDocToProsemirrorJSON } from 'y-prosemirror'

const fixture = new Uint8Array(fs.readFileSync('fixture.yjs'))
const rustPatch = new Uint8Array(fs.readFileSync('patched.update'))

function fromFixture() {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, fixture)
  return doc
}

const patched = fromFixture()
Y.applyUpdate(patched, rustPatch)
const restored = yDocToProsemirrorJSON(patched, 'content')
assert.equal(restored.content[1].content[0].text, 'Release validation passed on macOS.')
assert.equal(restored.content[2].content[1].marks[0].type, 'bold')

// Applying the same Rust/Yrs update twice must be idempotent.
const once = patched.getXmlFragment('content').toString()
Y.applyUpdate(patched, rustPatch)
assert.equal(patched.getXmlFragment('content').toString(), once)

// Generate an independent concurrent Yjs update from the same fixture.
const concurrent = fromFixture()
const fixtureVector = Y.encodeStateVector(concurrent)
const paragraph = new Y.XmlElement('paragraph')
const text = new Y.XmlText()
text.insert(0, 'Concurrent reviewer note.')
paragraph.insert(0, [text])
concurrent.getXmlFragment('content').insert(1, [paragraph])
const concurrentUpdate = Y.encodeStateAsUpdate(concurrent, fixtureVector)

// Opposite delivery orders and duplicate frames must converge.
const left = fromFixture()
Y.applyUpdate(left, rustPatch)
Y.applyUpdate(left, concurrentUpdate)
Y.applyUpdate(left, rustPatch)

const right = fromFixture()
Y.applyUpdate(right, concurrentUpdate)
Y.applyUpdate(right, rustPatch)
Y.applyUpdate(right, concurrentUpdate)

assert.equal(
  left.getXmlFragment('content').toString(),
  right.getXmlFragment('content').toString(),
)
assert.match(left.getXmlFragment('content').toString(), /Concurrent reviewer note\./)
assert.match(left.getXmlFragment('content').toString(), /Release validation passed on macOS\./)

console.log(JSON.stringify({
  restoredParagraph: restored.content[1].content[0].text,
  markPreserved: restored.content[2].content[1].marks[0].type,
  duplicateUpdateIdempotent: true,
  oppositeOrderConverged: true,
}, null, 2))
