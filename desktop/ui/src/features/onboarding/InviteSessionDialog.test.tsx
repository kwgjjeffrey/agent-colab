import { describe, expect, it } from "vitest";
import { artifactConfig } from "@/artifact-config";
import { channelInvitationPrompt } from "./InviteSessionDialog";
describe("Channel invitation command", () => {
  it("uses enterprise configuration for the installer and identity flow", () => {
    const prompt = channelInvitationPrompt({id:"id",token:"token",url:"unused",expiresAt:"2026-10-09",channelName:"Team",purpose:"join"},
      {...artifactConfig,deploymentMode:"enterprise",installMacUrl:"https://enterprise.example/install"});
    expect(prompt).toContain("https://enterprise.example/install");
    expect(prompt).toContain("enterprise SSO");
    expect(prompt).not.toContain(artifactConfig.installMacUrl);
    expect(prompt).not.toContain("device credential");
  });
  it("contains one bootstrap command, preserves quoting, and explains preparation", () => {
    const prompt = channelInvitationPrompt({ id: "id", token: "private-token", url: "unused", expiresAt: "2026-10-09T00:00:00Z", channelName: "Team", purpose: "join" });
    expect(prompt).toContain("bash -o pipefail -c");
    expect(prompt).toContain("--with-app --invitation");
    expect(prompt).toContain("private-token");
    expect(prompt).toContain("registers through the device credential");
    expect(prompt).toContain("Do not share any files or Sessions automatically");
    expect(prompt).not.toContain("mktemp");
  });
});
