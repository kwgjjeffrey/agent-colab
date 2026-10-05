import fs from 'node:fs'
import { getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import * as Y from 'yjs'
import { prosemirrorJSONToYDoc } from 'y-prosemirror'

const schema = getSchema([StarterKit])
const json = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'Release readiness' }],
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Release validation is pending.' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Owner: ' },
        { type: 'text', marks: [{ type: 'bold' }], text: 'release team' },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'macOS smoke test' }] }],
        },
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'runtime recovery' }] }],
        },
      ],
    },
    {
      type: 'codeBlock',
      attrs: { language: 'colab-component' },
      content: [{
        type: 'text',
        text: ':::colab-component{type="queryList" id="query_01"}\nFiles and Sessions updated this week.\n:::',
      }],
    },
  ],
}

const doc = prosemirrorJSONToYDoc(schema, json, 'content')
fs.writeFileSync('fixture.yjs', Buffer.from(Y.encodeStateAsUpdate(doc)))
fs.writeFileSync('fixture.json', `${JSON.stringify(json, null, 2)}\n`)
fs.writeFileSync('fixture.xml', `${doc.getXmlFragment('content').toString()}\n`)
console.log(doc.getXmlFragment('content').toString())
