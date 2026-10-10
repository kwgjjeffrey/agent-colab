// @vitest-environment jsdom
import {afterEach,it,expect,vi} from "vitest";
import {render,screen,fireEvent,waitFor,cleanup} from "@testing-library/react";
import {UserIdentityCard} from "./UserIdentity";
const mocks=vi.hoisted(()=>({request:vi.fn(),reload:vi.fn()}));
vi.mock("./ChannelContext",()=>({useChannelContext:()=>({channelId:"channel",channelName:"Team",people:[],agents:[],resources:[],reloadPeople:mocks.reload})}));
vi.mock("@/features/messages/api",()=>({messageRequest:mocks.request}));
vi.mock("@/features/onboarding/InviteSessionDialog",()=>({InviteSessionDialog:({invite}:any)=>invite?<div>Invitation prompt: {invite.token}</div>:null}));
vi.mock("@/features/agent/AgentWorkDrawer",()=>({AgentWorkDrawer:()=>null}));
vi.mock("@/features/messages/AgentMemberItem",()=>({AgentMemberItem:()=>null}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
const person={email:"person@example.test",username:"person",displayName:"Person",identity:{provider:"company",subject:"person"}};
it("opens the existing prompt for a directory person without Colab membership",async()=>{
 mocks.request.mockResolvedValueOnce([person]).mockResolvedValueOnce({id:"invite",token:"join-token"});render(<UserIdentityCard id="directory:company:person" name="Person" directoryPerson={person}/>);
 fireEvent.click(screen.getByRole("button",{name:"Invite to this Channel"}));await screen.findByText("Invitation prompt: join-token");
 expect(mocks.request).toHaveBeenCalledWith("/v1/channels/channel/invite-links",{method:"POST"});expect(mocks.reload).not.toHaveBeenCalled();
});
it("adds an organization member directly without producing an invite link",async()=>{
 mocks.request.mockResolvedValueOnce([{...person,memberId:"member"}]).mockResolvedValueOnce({status:"joined"});mocks.reload.mockResolvedValue(undefined);render(<UserIdentityCard id="member" name="Person" directoryPerson={{...person,memberId:"member"}}/>);
 fireEvent.click(screen.getByRole("button",{name:"Invite to this Channel"}));await waitFor(()=>expect(mocks.reload).toHaveBeenCalledOnce());
 expect(mocks.request).toHaveBeenCalledTimes(2);expect(mocks.request.mock.calls[1][0]).toBe("/v1/channels/channel/members");expect(screen.queryByText(/Invitation prompt/)).toBeNull();
});
it("exposes denied invitations without success",async()=>{
 mocks.request.mockResolvedValueOnce([{...person,memberId:"member"}]).mockRejectedValueOnce(new Error("member_add_forbidden"));render(<UserIdentityCard id="member" name="Person" directoryPerson={{...person,memberId:"member"}}/>);
 fireEvent.click(screen.getByRole("button",{name:"Invite to this Channel"}));expect(await screen.findByRole("alert")).toHaveProperty("textContent","Error: member_add_forbidden");expect(mocks.reload).not.toHaveBeenCalled();
});

it("uses current membership when a previously unknown person has since joined the organization",async()=>{
 mocks.request.mockResolvedValueOnce([{...person,memberId:"new-member"}]).mockResolvedValueOnce({status:"joined"});mocks.reload.mockResolvedValue(undefined);
 render(<UserIdentityCard id="directory:company:person" name="Person" directoryPerson={person}/>);
 fireEvent.click(screen.getByRole("button",{name:"Invite to this Channel"}));await waitFor(()=>expect(mocks.reload).toHaveBeenCalledOnce());
 expect(mocks.request.mock.calls[1][0]).toBe("/v1/channels/channel/members");
});
