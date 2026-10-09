export const USECASE={name:'Read compressed Session pages without whole-file reconstruction',description:'Exercise real Core chunk/index/HTTP-cache code with owned temporary native transcripts and a loopback byte transport. Verify four provider projections, cross-turn tool dependencies, pinned append pages, exact integrity checks, incremental index resume, locator-only remote indexes and receiver restart without re-downloading frames. Server upload tests verify bounded interrupted and malformed frames. This contract suite does not claim installed GUI, production migration, or real S3 acceptance.'};
export const META={
  "id": "context.sessions.reading.compressed-chunks",
  "module": "context/sessions/reading",
  "surface": "integration",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "suite": "business",
  "testLevel": "contract",
  "locks": [
    "write:build.cargo"
  ],
  "affectedPaths": [
    "local/crates/core/src/session_chunks.rs",
    "local/crates/local-api/src/sessions",
    "server/standalone/crates/api/src/session_upload.rs"
  ],
  "statusReason": "Reviewed Run 20261009T141937Z-3f2d8095: six passing assertions execute 4 frame, 16 Session and 4 streamed upload tests, including real loopback receiver download/restart and temporary fixture cleanup. Contract scope only; no installed GUI or provider performance claim."
};
export async function run(ctx){
  for(const [name,manifest,crateName,filter,minimum] of [
    ['Frame integrity and seek bounds','local/Cargo.toml','colab-local-core','session_chunks::',4],
    ['Provider paging and actual receiver cache','local/Cargo.toml','colab-local-api','sessions::',16],
    ['Streamed Server upload validation','server/standalone/Cargo.toml','colab-server','session_upload::',4],
  ]){
    const result=await ctx.command(name,'cargo',['test','--locked','--manifest-path',manifest,'-p',crateName,filter]);
    ctx.assert(name+' exits successfully',result.code,0);
    const count=Number(result.stdout.match(/test result: ok\. (\d+) passed/)?.[1]??0);
    ctx.assert(name+' actually exercises the selected scenarios',count>=minimum,true);
  }
}
