// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SkillFeedback } from './SkillFeedback';
vi.mock('@/features/sessions/SessionPreview',()=>({SessionPreview:({id,feedback}:{id:string;feedback:boolean})=><div>Evidence {id} {String(feedback)}</div>}));
const fetcher=vi.hoisted(()=>vi.fn());
vi.mock('@/api/request-activity',()=>({trackedFetch:fetcher}));
afterEach(()=>{cleanup();fetcher.mockReset();});
describe('Skill feedback preview',()=>{
  it('opens counted feedback and renders full Markdown including YAML and prose',async()=>{
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({assetId:'stable-asset'})))
      .mockResolvedValueOnce(new Response(JSON.stringify({totalMatching:1})))
      .mockResolvedValueOnce(new Response(JSON.stringify({totalMatching:1,items:[{feedbackId:'feedback-one',rating:'negative',status:'unresolved',capturedAt:'2026-10-10T04:00:00Z',analysisStatus:'completed',comment:'```yaml\nrating: negative\ntaskOutcome: progress\n```\n\n## 实际问题\n\n脚本缺少参数说明。'}]})));
    render(<SkillFeedback shareId="channel-reference"/>);
    fireEvent.click(await screen.findByRole('button',{name:'查看反馈（1）'}));
    expect(await screen.findByText('实际问题')).toBeTruthy();
    expect(screen.getByText('脚本缺少参数说明。')).toBeTruthy();
    expect(screen.getByText(/rating: negative/)).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    const body=JSON.parse(fetcher.mock.calls[2][1].body);
    expect(body.assetKey).toBe('asset:stable-asset');
    fireEvent.click(screen.getByRole('button',{name:'查看原始任务片段'}));
    expect(await screen.findByText('Evidence feedback-one true')).toBeTruthy();
  });
  it('shows a real failure rather than reporting zero feedback',async()=>{
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({assetId:'stable-asset'})))
      .mockResolvedValueOnce(new Response('forbidden',{status:403}));
    render(<SkillFeedback shareId="channel-reference"/>);
    await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('forbidden'));
    expect(screen.queryByRole('button',{name:'查看反馈（0）'})).toBeNull();
  });
  it('uses an authorized builtin asset directly without inventing a Channel share',async()=>{
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({totalMatching:1})))
      .mockResolvedValueOnce(new Response(JSON.stringify({totalMatching:1,items:[]})));
    render(<SkillFeedback assetKey="builtin:agent-colab"/>);
    fireEvent.click(await screen.findByRole('button',{name:/1/}));
    await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher.mock.calls.every(call=>!String(call[0]).includes('/shares/'))).toBe(true);
    expect(JSON.parse(fetcher.mock.calls[1][1].body).assetKey).toBe('builtin:agent-colab');
  });

  it('shows inline evaluation items immediately without a counted-entry dialog',async()=>{
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({totalMatching:1})))
      .mockResolvedValueOnce(new Response(JSON.stringify({totalMatching:1,items:[{feedbackId:'inline',rating:'negative',status:'unresolved',capturedAt:'2026-10-10T04:00:00Z',analysisStatus:'completed',comment:'## Concrete issue\n\nMissing argument documentation.'}]})));
    render(<SkillFeedback assetKey="builtin:agent-colab" inline/>);
    expect(await screen.findByText('Missing argument documentation.')).toBeTruthy();
    expect(screen.queryByRole('button',{name:/查看反馈/})).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

});
