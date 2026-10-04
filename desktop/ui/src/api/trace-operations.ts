import registry from "../../tracing/registry.json";
export { registry };
export const operations = Object.fromEntries(registry.operations.map(operation=>[operation.id,operation]));
