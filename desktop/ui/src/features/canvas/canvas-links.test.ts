// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {handleCanvasLinkClick} from './canvas-links';
afterEach(()=>{document.body.innerHTML='';vi.unstubAllGlobals();});
function click(href:string){document.body.innerHTML=`<a href="${href}"><strong>Document</strong></a>`;const event=new MouseEvent('click',{bubbles:true,cancelable:true});const error=vi.fn();let handled=false;document.body.addEventListener('click',e=>{handled=handleCanvasLinkClick(e,error);},{once:true});document.querySelector('strong')!.dispatchEvent(event);return {event,error,handled};}
it('opens nested link text through the desktop host without navigating the WebView',async()=>{const openExternal=vi.fn().mockResolvedValue(undefined);vi.stubGlobal('colabHost',{openExternal});const {event,handled}=click('https://example.test/document#section');expect(handled).toBe(true);expect(event.defaultPrevented).toBe(true);expect(openExternal).toHaveBeenCalledWith('https://example.test/document#section');});
it('uses a separate browser tab when running without the desktop host',()=>{vi.stubGlobal('colabHost',undefined);const open=vi.spyOn(window,'open').mockReturnValue(null);click('https://example.test');expect(open).toHaveBeenCalledWith('https://example.test','_blank','noopener,noreferrer');open.mockRestore();});
it('blocks unsupported links instead of navigating inside Colab',()=>{const {event,error}=click('javascript:alert(1)');expect(event.defaultPrevented).toBe(true);expect(error).toHaveBeenCalled();});
it('reports host failures',async()=>{vi.stubGlobal('colabHost',{openExternal:vi.fn().mockRejectedValue(new Error('browser failed'))});const {error}=click('https://example.test');await Promise.resolve();expect(error).toHaveBeenCalledWith('Error: browser failed');});
