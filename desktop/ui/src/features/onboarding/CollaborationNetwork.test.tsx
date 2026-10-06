// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  CollaborationNetwork,
  humanCycle,
  agentCycle,
} from "./CollaborationNetwork";
afterEach(cleanup);
it("uses upright three-node networks and keeps the collaborating actor on each vertex", () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  render(<CollaborationNetwork />);
  expect(humanCycle / agentCycle).toBe(30);
  expect(screen.getByRole("heading").previousElementSibling?.className).toBe("home-networks");
  for (const [index, name] of [
    "before agent",
    "with agent",
    "with Agent Colab",
  ].entries()) {
    const svg = screen.getByRole("img", { name });
    expect(svg.querySelectorAll('[data-breathe="human"]')).toHaveLength(3);
    expect(svg.querySelectorAll('[data-breathe="agent"]')).toHaveLength(
      index === 0 ? 0 : 3,
    );
    expect(
      svg
        .querySelector(`[data-breathe="${index === 2 ? "agent" : "human"}"]`)
        ?.getAttribute("transform"),
    ).toBe("translate(130 38)");
    expect(svg.querySelector("path")?.getAttribute("d")).toBe(
      "M130,38 L50,155",
    );
  }
  expect(screen.getByRole("heading").textContent).toBe(
    "Your team is about to work at agentic speed",
  );
});
