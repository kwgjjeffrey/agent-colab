import { useEffect, useRef } from "react";
import { gsap } from "gsap";

export const humanCycle = 6;
export const agentCycle = humanCycle / 10;
const points = [
  [130, 38],
  [50, 155],
  [210, 155],
] as const;
const modes = ["before agent", "with agent", "with Agent Colab"] as const;

export function CollaborationNetwork() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const clocks: gsap.core.Timeline[] = [];
    const context = gsap.context(() => {
      root.current
        ?.querySelectorAll<SVGGElement>("[data-breathe]")
        .forEach((actor) => {
          const cycle =
            actor.dataset.breathe === "agent" ? agentCycle : humanCycle;
          const halo = actor.querySelector(".network-halo");
          const body = actor.querySelector(".network-body");
          const timeline = gsap.timeline({
            repeat: -1,
            delay: (Number(actor.dataset.index) * cycle) / 15,
          });
          clocks.push(timeline);
          gsap.set([body, halo], { transformOrigin: "50% 50%" });
          timeline
            .to(
              body,
              { scale: 1.13, duration: cycle * 0.08, ease: "sine.out" },
              0,
            )
            .fromTo(
              halo,
              { scale: 0.85, opacity: 0.65 },
              { scale: 1.5, opacity: 0, duration: cycle * 0.42 },
              0,
            )
            .to(
              body,
              { scale: 1, duration: cycle * 0.12 },
              actor.dataset.stalled ? cycle * 0.42 : cycle * 0.08,
            );
          const packet = actor
            .closest("svg")
            ?.querySelector(`[data-packet="${actor.dataset.index}"]`);
          if (packet && actor.dataset.transmit) {
            const from = [
              Number(packet.getAttribute("data-x")),
              Number(packet.getAttribute("data-y")),
            ];
            const to = [
              Number(packet.getAttribute("data-end-x")),
              Number(packet.getAttribute("data-end-y")),
            ];
            timeline.set(
              packet,
              { attr: { cx: from[0], cy: from[1] }, opacity: 1 },
              cycle * 0.08,
            );
            if (actor.dataset.stalled) {
              timeline
                .to(
                  packet,
                  {
                    attr: {
                      cx: (from[0] + to[0]) / 2,
                      cy: (from[1] + to[1]) / 2,
                    },
                    duration: cycle * 0.15,
                    ease: "none",
                  },
                  cycle * 0.08,
                )
                .to(
                  packet,
                  {
                    opacity: 0.3,
                    duration: cycle * 0.045,
                    repeat: 5,
                    yoyo: true,
                  },
                  cycle * 0.23,
                )
                .to(
                  packet,
                  {
                    attr: { cx: to[0], cy: to[1] },
                    opacity: 1,
                    duration: cycle * 0.22,
                    ease: "none",
                  },
                  cycle * 0.5,
                );
            } else
              timeline.to(
                packet,
                {
                  attr: { cx: to[0], cy: to[1] },
                  duration: cycle * 0.64,
                  ease: "none",
                },
                cycle * 0.08,
              );
            timeline.set(packet, { opacity: 0 }, cycle * 0.72);
          }
          timeline.to({}, { duration: 0.001 }, cycle - 0.001);
        });
    }, root);
    const pause = () =>
      clocks.forEach((clock) =>
        clock.paused(document.hidden || reduced.matches),
      );
    pause();
    reduced.addEventListener("change", pause);
    document.addEventListener("visibilitychange", pause);
    return () => {
      reduced.removeEventListener("change", pause);
      document.removeEventListener("visibilitychange", pause);
      context.revert();
    };
  }, []);
  return (
    <div ref={root} className="home-network-strip">
      <h2>Your team is about to work at agentic speed</h2>
      <div className="home-networks">
        {modes.map((label, mode) => (
          <figure key={label}>
            <svg viewBox="0 0 280 210" role="img" aria-label={label}>
              {points.map(([x, y], index) => (
                <path
                  key={index}
                  className={
                    mode === 2
                      ? "network-edge network-bandwidth"
                      : "network-edge"
                  }
                  d={`M${x},${y} L${points[(index + 1) % 3].join(",")}`}
                />
              ))}
              {points.map(([x, y], index) => (
                <circle
                  key={index}
                  className={
                    mode === 2
                      ? "network-packet network-agent-packet"
                      : "network-packet"
                  }
                  data-packet={index}
                  data-x={x}
                  data-y={y}
                  data-end-x={points[(index + 1) % 3][0]}
                  data-end-y={points[(index + 1) % 3][1]}
                  cx={x}
                  cy={y}
                  r={mode === 2 ? 3.8 : 2.4}
                  opacity="0"
                />
              ))}
              {points.map(([x, y], index) => {
                const length = Math.hypot(x - 130, y - 110);
                const outer = [
                  x + ((x - 130) / length) * 28,
                  y + ((y - 110) / length) * 28,
                ];
                const person = mode === 2 ? outer : [x, y];
                const agent = mode === 2 ? [x, y] : outer;
                const radius = mode === 0 ? 14 : 22;
                return (
                  <g key={index}>
                    <g
                      transform={`translate(${person.join(" ")})`}
                      data-breathe="human"
                      data-index={index}
                      data-transmit={mode !== 2 ? "true" : undefined}
                      data-stalled={mode === 1 ? "true" : undefined}
                    >
                      <circle
                        className="network-halo"
                        r={radius + 5}
                        opacity="0"
                      />
                      <g className="network-body">
                        <circle className="network-human" r={radius} />
                        <g transform={`scale(${radius / 25})`}>
                          <path
                            className="network-person-icon"
                            d="M-8 9 C-8 -1 8 -1 8 9 M-4 -7 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0"
                          />
                        </g>
                      </g>
                    </g>
                    {mode > 0 && (
                      <g
                        transform={`translate(${agent.join(" ")})`}
                        data-breathe="agent"
                        data-index={index}
                        data-transmit={mode === 2 ? "true" : undefined}
                      >
                        <circle
                          className="network-halo network-agent-halo"
                          r="15"
                          opacity="0"
                        />
                        <g className="network-body">
                          <circle className="network-agent" r="12" />
                          <path
                            className="network-agent-icon"
                            d="M0 -7 L2 -2 L7 0 L2 2 L0 7 L-2 2 L-7 0 L-2 -2 Z"
                          />
                        </g>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
            <figcaption>{label}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
