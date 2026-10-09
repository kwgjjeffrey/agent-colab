// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { AuthOnboarding } from "./AuthOnboarding";
import { artifactConfig } from "@/artifact-config";
afterEach(cleanup);
const profile = {id:"user",email:"device@device.invalid",displayName:"Custom name",nameCustomized:true,googleLinked:false};
const props = {resolved:true,authenticated:true,userId:"user",profile,config:artifactConfig,busy:false,onAuthenticate:vi.fn()};
describe("Identity onboarding", () => {
  it("requires auth even with a custom name and invokes the real sign-in action", () => {
    const onAuthenticate=vi.fn();render(<AuthOnboarding {...props} onAuthenticate={onAuthenticate}/>);
    fireEvent.click(screen.getByRole("button",{name:"Verify with Google"}));expect(onAuthenticate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button",{name:/dismiss|skip/i})).toBeNull();
  });
  it("disappears when the same account links Google", () => {
    const view=render(<AuthOnboarding {...props}/>);expect(screen.getByRole("region")).toBeTruthy();
    view.rerender(<AuthOnboarding {...props} profile={{...profile,googleLinked:true}}/>);expect(screen.queryByRole("region")).toBeNull();
  });
  it("uses company configuration before login and disappears after SSO", () => {
    const config={...artifactConfig,deploymentMode:"enterprise" as const,auth:{kind:"external" as const,label:"Company SSO"}};
    const view=render(<AuthOnboarding {...props} authenticated={false} profile={undefined} config={config}/>);
    expect(screen.getByRole("button",{name:"Verify with Company SSO"})).toBeTruthy();
    view.rerender(<AuthOnboarding {...props} profile={{...profile,profileManaged:true}} config={config}/>);expect(screen.queryByRole("region")).toBeNull();
  });
  it("does not reuse an old account profile while switching", () => {
    render(<AuthOnboarding {...props} userId="other"/>);expect(screen.queryByRole("region")).toBeNull();
  });
});
