import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

export default {
  fetch: withSupabase({ auth: "user" }, async (_req, ctx) => {
    return Response.json({
      user_id: ctx.userClaims?.sub,
      modules: {
        auth: "supabase-auth",
        metadata: "postgres-rls",
        server_logic: "edge-functions",
        blobs: "private-storage",
        realtime: "postgres-changes",
        jobs: "pgmq-cron",
        search: "postgres-fts-pgvector",
      },
    });
  }),
};
