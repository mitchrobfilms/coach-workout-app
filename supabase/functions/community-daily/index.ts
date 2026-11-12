// NOT DEPLOYED. Do not schedule or deploy this until migration 011 is applied.
// Posts daily section prompts and scheduled announcements.
// Time zone: Europe/London. The SQL function community_daily_run() does the clock check.
//
// How to run it later (do not enable this from the repo):
//   Supabase dashboard → Edge Functions → community-daily → schedule every 15 minutes, or
//   pg_cron, after you enable the extension yourself:
//     select cron.schedule('community-daily', '*/15 * * * *', $$select public.community_daily_run()$$);
// This file does not enable pg_cron and does not call production.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async () => {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !key) return Response.json({ ok: false, error: 'service_role_missing' }, { status: 503 });
  const sb = createClient(url, key);
  const { data, error } = await sb.rpc('community_daily_run');
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, posted: data, zone: 'Europe/London' });
});
