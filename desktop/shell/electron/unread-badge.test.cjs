const { test } = require('node:test')
const assert = require('node:assert/strict')
const { unreadBadgeHandler } = require('./unread-badge.cjs')
test('only main loopback renderer can set or clear the native count', async () => {
  const frame = { url: 'http://127.0.0.1:5199/' }
  const contents = { mainFrame: frame }
  const values = []
  const handler = unreadBadgeHandler(() => ({ isDestroyed: () => false, webContents: contents }), { setBadgeCount: n => values.push(n) })
  const event = { sender: contents, senderFrame: frame }
  await handler(event, 4)
  await handler(event, 0)
  assert.deepEqual(values, [4, 0])
  await assert.rejects(handler({ ...event, sender: {} }, 2))
  await assert.rejects(handler({ ...event, senderFrame: { url: frame.url } }, 2))
  for (const value of [-1, 1.5, '3', NaN, Infinity]) await assert.rejects(handler(event, value))
  frame.url = 'https://example.org/'
  await assert.rejects(handler(event, 2))
  assert.deepEqual(values, [4, 0])
})
