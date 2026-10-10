// @vitest-environment jsdom
import {describe,it,expect} from 'vitest';
import {loadMessageDraft,saveMessageDraft} from './message-drafts';
describe('Message draft identity and rich content',()=>{
 it('keeps immutable mention routing and separates accounts and channels',()=>{
  const key=JSON.stringify(['owner','channel']);const doc={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Please '},{type:'mention',attrs:{id:'agent-id',label:'Agent',kind:'agent'}}]}]};
  saveMessageDraft(key,doc);expect(loadMessageDraft(key)).toEqual(doc);expect(loadMessageDraft(JSON.stringify(['other','channel']))).toBeUndefined();expect(loadMessageDraft(JSON.stringify(['owner','other']))).toBeUndefined();
  saveMessageDraft(key);expect(loadMessageDraft(key)).toBeUndefined();expect(localStorage.getItem('colab.message-draft.v1:'+key)).toBeNull();
 });
});
