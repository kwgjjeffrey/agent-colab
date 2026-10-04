alter table agent_requests
    add column source_canvas_id uuid references canvases(id) on delete set null;

-- Earlier Canvas requests embedded the authoritative title in the server-rendered prompt but did
-- not retain its resource identity. Backfill only an unambiguous title match within the Channel;
-- duplicate titles deliberately remain unassociated instead of guessing.
with unique_canvases as (
    select channel_id, title, (array_agg(id))[1] canvas_id
    from canvases
    group by channel_id, title
    having count(*) = 1
)
update agent_requests request
set source_canvas_id = canvas.canvas_id
from unique_canvases canvas
where request.kind = 'canvas_mention'
  and request.channel_id = canvas.channel_id
  and position('Work on the collaborative Canvas document “' || canvas.title || '”.' in request.query) = 1;

create index agent_requests_canvas_idx
    on agent_requests(source_canvas_id, created_at desc)
    where source_canvas_id is not null;
