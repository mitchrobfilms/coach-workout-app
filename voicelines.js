// Recordings may use their own IDs too: the app also matches by exact text, and by per-class alternates (<class>.intro, <class>.water, <class>.cool).
// Stable phrase IDs for pre-recorded instructor lines (media/voice/<m|f>/<id>.mp3). Never rename an ID: the voice job maps
// recordings to these. Lines are matched by ID first, then by exact text; anything else (names, numbers > 20) uses the phone voice.
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
for (let n = 1; n <= 20; n++) LINES[`count.${n}`] = String(n);
export const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
const plain = c => c.name.replace(' (Zumba-style)', '').replace('(Zumba-style)', '');
/** Line ids/texts used by a class (same strings the class engine speaks). */
export function classLines(c) {
  const out = [], add = (id, text, tags) => out.push({ id, text, tags });
  add(`class.${c.id}.welcome`, `Welcome to ${plain(c)}! I'm Reta. ${Math.round(c.total / 60)} minutes, beginner friendly. Let's start with a ${Math.round(c.sections.warm / 60)} minute warm-up.`, ['class', c.id]);
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
