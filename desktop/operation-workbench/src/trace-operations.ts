import registry from "../tracing/registry.json";
export {registry};
export const operations=Object.fromEntries(registry.operations.flatMap(operation=>[[operation.id,operation],...(operation.id.startsWith("workbench.feedback.")||operation.id.startsWith("workbench.sessions.")?[[operation.id.slice(10),operation]]:[])]));
