// The Server stores this opaque, prebuilt fixture; Markdown conversion stays in Core's codec.
import { readFileSync, writeFileSync } from 'node:fs';
import { parser } from './codec.mjs';
import { prosemirrorToYXmlFragment } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
const base = new URL('../../server/standalone/crates/persistence/assets/', import.meta.url);
const doc = new Y.Doc();
doc.clientID = 1;
prosemirrorToYXmlFragment(parser.parse(readFileSync(new URL('welcome-canvas.md', base), 'utf8')), doc.getXmlFragment('default'));
writeFileSync(new URL('welcome-canvas.yjs', base), Y.encodeStateAsUpdate(doc));
