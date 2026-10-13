'use strict'

function unreadBadgeHandler(getWindow, app) {
  return async (event, count) => {
    const main = getWindow()
    if (!main || main.isDestroyed() || event.sender !== main.webContents ||
        event.senderFrame !== main.webContents.mainFrame) throw new Error('Unread badge requires the main Colab renderer')
    const url = new URL(event.senderFrame.url)
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error('Unread badge requires Local Core')
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid unread count')
    app.setBadgeCount(count)
  }
}
module.exports = { unreadBadgeHandler }
