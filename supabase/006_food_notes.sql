-- Food diary: the member's own typed description of a meal (sent with the photo as the main hint, or used alone). Applied 2026-10-26.
alter table public.food_diary add column if not exists note text check (note is null or char_length(note) <= 300);
