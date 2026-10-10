import {describe,it,expect} from "vitest";
import {mentionPeople,personKey,type Person} from "./organization-people";
const rows:Person[]=Array.from({length:6},(_,i)=>({email:`person${i}@example.test`,username:`person${i}`,displayName:`Person ${i}`}));
describe("organization mention candidates",()=>{
  it("prioritizes an exact username beyond the partial top three",()=>expect(mentionPeople(rows,"PERSON5")).toEqual([rows[5]]));
  it("shows all exact name matches",()=>expect(mentionPeople([...rows,{...rows[5],displayName:"Person 0"}],"Person 0")).toHaveLength(2));
  it("caps partial and initial local suggestions at three",()=>{expect(mentionPeople(rows,"person")).toEqual(rows.slice(0,3));expect(mentionPeople(rows," ")).toEqual(rows.slice(0,3));});
  it("keeps external identity independent of mutable email and label",()=>{const p={...rows[0],identity:{provider:"company",subject:"stable"}};expect(personKey(p)).toBe(personKey({...p,email:"changed@example.test",displayName:"Changed"}));});
});
