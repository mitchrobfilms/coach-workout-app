// Recordings may use their own IDs too: the app also matches by exact text, and by per-class alternates (<class>.intro, <class>.water, <class>.cool).
// Stable phrase IDs for pre-recorded instructor lines (media/voice/<m|f>/<id>.mp3). Never rename an ID: the voice job maps
// recordings to these. Lines are matched by ID first, then by exact text, then as chained phrase clips (number + phrase); only lines with
// the user's name (food check-in, outside classes) use the phone voice.
export const LINES = {
  'common.pause': 'Paused. Say resume when you\'re ready.',
  'common.resume': 'And we\'re back.',
  'common.skip': 'Skipping ahead.',
  'common.step_back': 'Step back so I can see your whole body',
  'class.halfway': 'Halfway there!',
  'class.halfway_hold': 'Halfway. Keep breathing.',
  'class.ten_seconds': '10 seconds left!',
  'class.ten_seconds_punch': '10 seconds, empty the tank!',
  'class.ten_seconds_hold': '10 more seconds, breathe.',
  'class.count_in_dance': 'Five, six, seven, eight!',
  'class.count_in': 'In three, two, one…',
  'class.nice_work': 'Nice work.',
  'class.water': 'Water break. Grab a sip.',
  'class.cooldown': 'Cool-down time.',
  'class.next_cool': 'Next up: the cool-down.',
  'class.finish_first': 'Let\'s finish this one first.',
  'cue.guard_up': 'Guard up! Hands back to your cheeks.',
  'cue.great_rhythm': 'Great rhythm! You\'re right on the beat.',
  'cue.keep_moving': 'Keep moving. Small steps are perfect.',
  'cue.kick_drum': 'Listen for the kick drum and step with it.',
  'cue.still_point': 'Find a still point to look at. Breathe.',
  'cue.slower': 'Slower and more controlled.',
  'cue.bridge_higher': 'Lift a little higher, squeeze your glutes.',
  'cue.bigger_range': 'A little bigger range, still slow.',
  'cue.strong_work': 'Strong work!',
  'pose.chair_lower': 'Sink a bit lower into the chair pose',
  'pose.chair_higher': 'Come up a little, knees no lower than the chair',
  'pose.chair_good': 'Lovely chair pose. Breathe',
  'pose.warrior_wider': 'Step your feet wider apart',
  'pose.warrior_bend': 'Bend your front knee over your ankle',
  'pose.warrior_straighten': 'Straighten your back leg',
  'pose.warrior_arms': 'Arms out at shoulder height',
  'pose.warrior_good': 'Strong warrior. Breathe',
  'pose.tree_lift': 'Lift one foot onto your ankle or calf, hold the chair if you need',
  'pose.tree_tall': 'Stand tall on the supporting leg',
  'pose.tree_good': 'Beautiful tree. Steady breath',
  'plank.good': 'Solid plank. Breathe',
  'plank.line': 'Make a straight line from head to knees',
  'plank.setup': 'Forearms and knees down, body long',
};
Object.assign(LINES, {
  'class.complete': 'Class complete! Brilliant work. Your stats are on the screen. Remember to drink some water.',
  'class.effort': 'Nice effort today. Your stats are on the screen. Remember to drink some water.',
  'class.more_than_last': 'And that\'s more than last time. Brilliant!',
  'class.end': 'That\'s the end of the class.',
  'cmd.sorry': 'Sorry, I didn\'t catch that. Try pause, next, resume, or what\'s next.',
  'cmd.already': 'We\'re already going!',
  'cmd.food_later': 'Let\'s log food after the workout.',
  'cmd.prep_later': 'Let\'s plan your prep after the workout.',
  'cmd.shop_later': 'Let\'s look at the shopping list after the workout.',
  'cmd.weigh_saved': 'Weigh-in saved. Remember, it\'s the trend over weeks that matters.',
  'cmd.weigh_ask': 'Sure. What do you weigh today? You can say kilos, pounds, or stone.',
  'cmd.weigh_got': 'Got it, weigh-in saved.',
  'cmd.weigh_nonum': 'Sorry, I didn\'t catch a number. You can type it on the Progress tab.',
  'music.off': 'Music off.',
  // phrase clips that follow a number clip (see numberParts in classvoice.js)
  'sfx.punches_strong': 'punches! Strong work.', 'sfx.held_lovely': 'seconds held. Lovely.',
  'sfx.sofar.punches': 'punches so far.', 'sfx.sofar.onbeat': 'on-beat moves so far.', 'sfx.sofar.held': 'seconds held so far.', 'sfx.sofar.reps': 'reps so far.',
  'sfx.about': 'That\'s about', 'sfx.calories': 'calories.',
});
for (let v = 10; v <= 100; v += 10) { LINES[`music.up.${v}`] = `Music up, ${v} percent.`; LINES[`music.down.${v}`] = `Music down, ${v} percent.`; }
for (let n = 1; n <= 60; n++) LINES[`count.${n}`] = String(n); // energetic rep counts
for (let n = 0; n <= 100; n++) LINES[`num.${n}`] = String(n); // plain numbers for chaining
for (let h = 1; h <= 9; h++) { LINES[`num.h${h}`] = `${h} hundred`; LINES[`num.ha${h}`] = `${h} hundred and`; LINES[`num.k${h}`] = `${h} thousand`; }
for (let n = 25; n <= 500; n += 25) LINES[`punches.${n}`] = `${n} punches! Strong work.`;
for (let n = 20; n <= 180; n += 20) LINES[`hold.${n}`] = `${n} seconds held. Lovely.`;
export const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
const plain = c => c.name.replace(' (Zumba-style)', '').replace('(Zumba-style)', '');
/** Line ids/texts used by a class (same strings the class engine speaks). */
export function classLines(c) {
  const out = [], add = (id, text, tags) => out.push({ id, text, tags });
  add(`class.${c.id}.welcome`, `Welcome to ${plain(c)}! ${Math.round(c.total / 60)} minutes, beginner friendly. Let's start with a ${Math.round(c.sections.warm / 60)} minute warm-up.`, ['class', c.id]);
  for (const s of c.steps) {
    const k = `class.${c.id}.${slug(s.name)}`;
    if (s.kind === 'trans' || s.kind === 'water') continue;
    add(`${k}.intro`, introText(s), ['class', c.id, s.kind]);
    add(`${k}.next_short`, `Next up: ${s.name}.`, ['class', c.id, 'transition']);
    (s.cues || []).forEach(t => add(`cue.${slug(t)}`, t, ['cue', c.id]));
    (s.counts || []).slice(1).forEach(t => add(`layer.${slug(t)}`, `Layer it up: ${t}`, ['cue', c.id, 'layer']));
  }
  return out;
}
export const introText = s => `${s.name}. ${s.how}${s.fix ? ` ${s.fix}.` : ''}`;
