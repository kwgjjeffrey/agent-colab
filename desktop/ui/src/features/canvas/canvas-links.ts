/** Consume link clicks before the editor/browser can navigate the desktop WebView. */
export function handleCanvasLinkClick(event: MouseEvent, onError: (message: string) => void): boolean {
  const element = event.target instanceof Element ? event.target : (event.target as Node | null)?.parentElement;
  const anchor = element?.closest<HTMLAnchorElement>('a[href]');
  if (!anchor) return false;
  event.preventDefault();
  event.stopPropagation();
  const href = anchor.getAttribute('href') ?? '';
  if (!/^(https?:\/\/|mailto:)/i.test(href)) {
    onError('This link cannot be opened in the system browser.');
    return true;
  }
  try {
    if (window.colabHost) void window.colabHost.openExternal(href).catch(reason => onError(String(reason)));
    else window.open(href, '_blank', 'noopener,noreferrer');
  } catch (reason) { onError(String(reason)); }
  return true;
}
