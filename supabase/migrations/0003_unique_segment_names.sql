-- Keep the oldest row for each case-insensitive segment name before enforcing uniqueness.
with ranked as (
  select id, row_number() over (
    partition by lower(name)
    order by created_at asc, id asc
  ) as position
  from segments
)
delete from segments
using ranked
where segments.id = ranked.id and ranked.position > 1;

create unique index segments_name_ci_key on segments (lower(name));
