import {Transform} from 'prosemirror-transform';

// Edit an existing text leaf without reparsing its containing list or paragraph.
// Atom nodes are never text candidates, and ambiguous occurrences fail closed.
export function replaceInline(node, needle, replacement, accept = () => true) {
 if (!needle) throw Error('patch_conflict: empty text selection');
 const matches=[];
 node.descendants((child,pos,parent)=>{
  if(!child.isText || parent?.attrs.language==='colab-component' || (typeof replacement!=='string' && parent?.type.spec.code))return;
  let at=child.text.indexOf(needle);
  while(at>=0){matches.push({pos:pos+at,marks:child.marks});at=child.text.indexOf(needle,at+1);}
 });
 if(matches.length>256)throw Error('patch_conflict: text selection is too broad');
 const candidates=matches.map(match=>{
  const content=typeof replacement==='string'?(replacement?node.type.schema.text(replacement,match.marks):[]):replacement;
  return new Transform(node).replaceWith(match.pos,match.pos+needle.length,content).doc;
 }).filter(accept);
 if(candidates.length!==1)throw Error('patch_conflict: text selection must match exactly once');
 return candidates[0];
}
