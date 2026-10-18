// Full-length follow-along classes: scripts + pure pose analysers (no DOM; importable in Node for tests).
// Every class is EXACTLY 30:00 = 5:00 warm-up + 20:00 main (blocks + 15s transitions / water breaks) + 5:00 cool-down.
import { LM, angle, allVisible, Smoother, RepCounter, makeAnalyser } from './logic.js';

export const WARM = 300, MAIN = 1200, COOL = 300, TOTAL = 1800, TRANS = 15;
const MET = { warm: 3.0, trans: 2.5, water: 1.8, cool: 2.0 };

// helpers to keep the scripts readable
const W = (name, dur, slug, fb, how, cues = [], extra = {}) => ({ kind: 'warm', name, dur, slug, fb, how, cues, ...extra });
const M = (name, dur, slug, fb, how, cues = [], extra = {}) => ({ kind: 'main', name, dur, slug, fb, how, cues, ...extra });
const C = (name, dur, slug, fb, how, cues = [], extra = {}) => ({ kind: 'cool', name, dur, slug, fb, how, cues, ...extra });

function build(c) {
  const steps = [];
  const sum = a => a.reduce((t, s) => t + s.dur, 0);
  if (sum(c.warm) !== WARM) throw new Error(`${c.id}: warm-up is ${sum(c.warm)}s, must be ${WARM}`);
  if (sum(c.cool) !== COOL) throw new Error(`${c.id}: cool-down is ${sum(c.cool)}s, must be ${COOL}`);
  for (const s of c.warm) steps.push({ ...s, met: s.met ?? MET.warm, bpm: s.bpm ?? c.bpm, track: s.track ?? c.warmTrack ?? 'move' });
  c.main.forEach((s, i) => {
    if (s.dur < 45 || s.dur > 90) throw new Error(`${c.id}: block "${s.name}" is ${s.dur}s (must be 45–90)`);
    steps.push({ ...s, met: s.met ?? c.met, bpm: s.bpm ?? c.bpm, track: s.track ?? c.track });
    const water = (i + 1) % 4 === 0;
    const nxt = c.main[i + 1] || c.cool[0];
    steps.push({ kind: water ? 'water' : 'trans', name: water ? 'Water break' : 'Transition', dur: TRANS, slug: null, fb: null,
      how: water ? 'Grab a sip of water and shake out your arms.' : `Get ready for ${nxt.name}.`, next: nxt.name, cues: [], met: water ? MET.water : MET.trans, bpm: nxt.bpm ?? c.bpm, track: 'none' });
  });
  if (sum(steps) - WARM !== MAIN) throw new Error(`${c.id}: main section is ${sum(steps) - WARM}s, must be ${MAIN}`);
  for (const s of c.cool) steps.push({ ...s, met: s.met ?? MET.cool, bpm: s.bpm ?? c.coolBpm ?? c.bpm, track: s.track ?? 'still', music: 'ambient' });
  let at = 0; for (const s of steps) { s.at = at; at += s.dur; }
  const { warm, main, cool, ...meta } = c;
  return { ...meta, steps, total: at };
}

/* ---------------- BOXING (male lead, ~120 bpm) ---------------- */
const BOX = 'Guard up: fists by your cheeks, elbows in, soft knees, one foot slightly forward.';
const boxing = build({
  id: 'boxing', name: 'Boxing', lead: 'm', intensity: 'Moderate', tags: ['cardio'], music: 'boxing', bpm: 120, met: 5.5, track: 'punch',
  blurb: 'Shadow boxing combos to a 120 bpm beat. Punches are counted, and Reta checks your guard.',
  warm: [
    W('March and arm circles', 60, 'stance-bounce', 'march', 'March on the spot and circle your arms forwards, then backwards.', ['Big arm circles', 'Swap direction', 'Nice and loose']),
    W('Step-touch and shoulder rolls', 60, 'guard-shuffle', 'march', 'Step side to side and roll your shoulders back.', ['Roll them back', 'Breathe out as you step']),
    W('Slow bob and weave', 60, 'slip-duck', 'squat', 'Small squat as you dip your head side to side under an imaginary rope.', ['Bend the knees, not the back', 'Eyes forward']),
    W('Easy jabs', 60, 'jab', 'march', `${BOX} Gentle jabs with the lead hand.`, ['Snap it out, snap it back', 'Hands back to your cheeks'], { track: 'punch' }),
    W('Torso twists in guard', 60, 'guard-shuffle', 'march', 'Hold your guard and rotate gently from the waist.', ['Pivot the back foot', 'Guard stays up']),
  ],
  main: [
    M('Jab-cross ×8', 60, 'jab-cross', 'march', `${BOX} Jab (front hand), cross (back hand). 8 then reset.`, ['Jab, cross!', 'Rotate the back hip on the cross', 'Exhale on every punch'], { combo: '1-2 ×8' }),
    M('Jab-cross ×8, then hooks', 75, 'hooks', 'march', 'Eight jab-crosses, then hooks: elbow up at shoulder height, swing round, pivot.', ['8 jab-crosses…', 'Now hooks!', 'Elbow up like a hook'], { combo: '1-2 ×8 → 3-4' }),
    M('Speed jabs (low impact)', 45, 'jab', 'march', 'Quick light jabs, small bounce or just soft knees.', ['Fast hands!', 'Breathe!', 'Keep it light'], { combo: 'fast 1s' }),
    M('Hooks left and right', 60, 'hooks', 'march', 'Left hook, right hook. Elbows up, pivot the feet.', ['Pivot the foot', 'Turn the hip', 'Guard back after each one'], { combo: '3-4' }),
    M('Jab-cross-hook', 75, 'hooks', 'march', 'Jab, cross, lead hook. Reset to guard.', ['One, two, three!', 'Guard up between combos'], { combo: '1-2-3' }),
    M('Uppercuts', 60, 'uppercuts', 'squat', 'Dip slightly, drive up from the legs, palm facing you.', ['Drive from the legs', 'Short punches, under the chin'], { combo: '5-6' }),
    M('Jab-cross-slip', 75, 'slip-duck', 'squat', 'Jab, cross, then slip: small dip of the head to one side.', ['Slip to the side', 'Bend the knees'], { combo: '1-2-slip' }),
    M('Body jabs with a squat', 60, 'body-punches', 'squat', 'Bend the knees and jab to body height, stand back up.', ['Sit back like the chair is there', 'Chest up'], { combo: 'low 1-2' }),
    M('Uppercut-hook combo', 75, 'uppercuts', 'march', 'Rear uppercut, lead hook, repeat.', ['Up and round!', 'Smooth, not rushed'], { combo: '6-3' }),
    M('Speed punches', 45, 'jab-cross', 'march', 'Fast straight punches, light hands, soft knees.', ['Go go go!', 'Last few seconds!'], { combo: 'fast 1-2' }),
    M('Jab-cross-hook-cross', 90, 'cross', 'march', 'The classic four-punch combo: 1-2-3-2.', ['One, two, three, two!', 'Reset your guard'], { combo: '1-2-3-2' }),
    M('Bob and weave + cross', 60, 'slip-duck', 'squat', 'Weave under the rope, come up with a cross.', ['Under… and cross!', 'Knees soft'], { combo: 'weave-2' }),
    M('Combo ladder', 75, 'step-back-jab', 'march', 'Build it up: 1-2, then 1-2-3, then 1-2-3-2.', ['Add one more punch', 'Stay sharp'], { combo: '1-2 / 1-2-3 / 1-2-3-2' }),
    M('Power round: jab-cross ×8 then hooks', 75, 'hooks', 'march', 'Eight strong jab-crosses, then hooks until the bell.', ['Strong and controlled', 'Hooks now!'], { combo: '1-2 ×8 → 3-4' }),
    M('Finisher: speed punches', 45, 'jab-cross', 'march', 'Everything you have left, fast light punches.', ['Empty the tank!', '10 seconds!'], { combo: 'fast 1-2' }),
  ],
  cool: [
    C('Slow march and breathe', 60, 'stance-bounce-slow', 'march', 'Slow march, big breath in, long breath out.'),
    C('Chest and shoulder stretch', 60, 'stretch-chest', 'cool', 'Hands behind you, gently open the chest.'),
    C('Triceps stretch', 60, 'stretch-triceps', 'cool', 'One hand down your back, gently press the elbow. Swap at 30 seconds.'),
    C('Thigh stretch (hold the chair)', 60, 'stretch-quad', 'cool', 'Hold a chair, bring one heel to your bum. Swap at 30 seconds.'),
    C('Calf stretch and breathe', 60, 'stretch-calf', 'cool', 'Hands on the wall, one leg back, heel down. Swap at 30 seconds.'),
  ],
});

/* ---------------- DANCE (female lead, 124 bpm, 8-count blocks that layer) ---------------- */
const dance = build({
  id: 'dance', name: 'Dance', lead: 'f', intensity: 'Moderate', tags: ['cardio', 'dance'], music: 'dance', bpm: 124, met: 5.0, track: 'rhythm', warmTrack: 'rhythm',
  blurb: 'Low-impact dance cardio in 8-count blocks that build into two routines.',
  warm: [
    W('Step-touch', 60, 'step-touch-clap', 'march', 'Step right, tap left; step left, tap right.', [], { counts: ['1-2 step-touch right, 3-4 left, repeat'], dir: 'RRLLRRLL' }),
    W('Step-touch with arm swings', 60, 'arm-waves', 'march', 'Add a gentle arm swing across the body.', [], { counts: ['Step-touch', 'Add arms: swing on every step'], dir: 'RRLLRRLL' }),
    W('Slow grapevine', 60, 'grapevine', 'march', 'Step side, cross behind, step side, tap. Then back.', [], { counts: ['1-4 grapevine right', '5-8 grapevine left'], dir: 'RRRRLLLL' }),
    W('Hip rolls and shoulder pops', 60, 'hip-rolls', 'march', 'Feet wide, roll the hips, pop the shoulders on the beat.', [], { counts: ['1-4 hip roll', '5-8 shoulder pops'] }),
    W('Knee lift and clap', 60, 'knee-up-clap', 'knees', 'Lift a knee and clap under it, alternate.', [], { counts: ['Knee on 1, clap; knee on 3, clap'], dir: 'RRLLRRLL' }),
  ],
  main: [
    M('Box step', 60, 'box-step', 'march', 'Right foot forward, left forward, right back, left back.', [], { counts: ['1 forward R, 2 forward L, 3 back R, 4 back L'] }),
    M('Box step + arms', 75, 'box-step', 'march', 'Layer the arms: reach up on 1-2, down on 3-4.', [], { counts: ['Box step', 'Add arms: up on 1-2, down on 3-4'] }),
    M('Grapevine + clap', 60, 'grapevine', 'march', 'Grapevine right with a clap on 4, left with a clap on 8.', [], { counts: ['1-3 grapevine right, clap on 4', '5-7 grapevine left, clap on 8'], dir: 'RRRRLLLL' }),
    M('Routine A: box step + grapevine', 90, 'grapevine', 'march', 'Put them together: one 8 of box steps, one 8 of grapevines.', [], { counts: ['8 box step', '8 grapevine right and left', 'Repeat, smile!'], dir: '' }),
    M('Hamstring curls + arms', 60, 'side-groove', 'knees', 'Step out and curl the heel behind, pull the arms in.', [], { counts: ['Curl right on 1-2, left on 3-4', 'Add a row with the arms'], dir: 'RRLLRRLL' }),
    M('Double step-touch', 45, 'step-touch-clap', 'march', 'Two step-touches right, two left.', [], { counts: ['1-4 double right', '5-8 double left'], dir: 'RRRRLLLL' }),
    M('Routine A with arms', 75, 'arm-waves', 'march', 'Routine A with all the arm layers.', [], { counts: ['Box step, arms up', 'Grapevine, clap on 4 and 8'] }),
    M('Side step + body roll', 60, 'side-groove', 'march', 'Step out wide and roll through the body (small is fine).', [], { counts: ['1-2 step right, 3-4 roll', '5-6 step left, 7-8 roll'], dir: 'RRRRLLLL' }),
    M('Kick-ball-change (low)', 60, 'cha-cha-step', 'march', 'Small kick forward, step back on the ball of the foot, change. No jumping.', [], { counts: ['Kick, ball, change on 1-2', 'Other side on 3-4'] }),
    M('Routine B layered', 75, 'shoulder-shimmies', 'march', 'Side step + body roll, then kick-ball-change.', [], { counts: ['8 side step + roll', '8 kick-ball-change'] }),
    M('Low-impact pony step', 45, 'side-groove', 'march', 'Small side-to-side shuffle, no jumping.', [], { counts: ['Shuffle right 1&2', 'Shuffle left 3&4'], dir: 'RRLLRRLL' }),
    M('Mambo step', 60, 'cha-cha-step', 'march', 'Step forward, rock back, step together.', [], { counts: ['1 forward, 2 rock, 3 together, hold 4'] }),
    M('Routine B with arms', 75, 'shoulder-shimmies', 'march', 'Routine B with arms reaching on every step.', [], { counts: ['Side step, roll, arms wide', 'Kick-ball-change, arms punch down'] }),
    M('Freestyle groove', 45, 'freestyle-groove', 'march', 'Your move! Any step from today, stay on the beat.', [], { counts: ['Pick any move', 'Stay on the beat'] }),
    M('Full routine A + B', 90, 'box-step', 'march', 'Everything: routine A, then routine B, on repeat.', [], { counts: ['Routine A: box + grapevine', 'Routine B: roll + kick-ball-change'] }),
  ],
  cool: [
    C('Slow sway', 60, 'side-groove', 'march', 'Slow side-to-side sway, let the arms float.'),
    C('Side stretch', 60, 'stretch-side', 'cool', 'One arm up and over. Swap at 30 seconds.'),
    C('Hamstring stretch', 60, 'stretch-hamstring', 'cool', 'One heel forward, toes up, hinge from the hips.'),
    C('Thigh stretch (hold the chair)', 60, 'stretch-quad', 'cool', 'Heel to bum, holding a chair. Swap at 30 seconds.'),
    C('Breathe and shake out', 60, 'breathe', 'cool', 'Big breaths, shake out the hands and legs.'),
  ],
});

/* ---------------- LATIN DANCE CARDIO (Zumba-style), female lead, 100–130 bpm by section ---------------- */
const latin = build({
  id: 'latin', name: 'Latin Dance Cardio (Zumba-style)', lead: 'f', intensity: 'Moderate', tags: ['cardio', 'dance'], music: 'latin', bpm: 110, met: 5.5, track: 'rhythm', warmTrack: 'rhythm', coolBpm: 96,
  blurb: 'Merengue, salsa, cumbia and reggaeton-style steps. Low impact, 100–130 bpm. Not affiliated with Zumba®.',
  warm: [
    W('Merengue march', 60, 'merengue', 'march', 'March on the spot, let the hips move naturally.', [], { bpm: 100, counts: ['March 1-8, hips loose'] }),
    W('Merengue + arms', 60, 'merengue-arms', 'march', 'Add arm rolls and elbow pumps.', [], { bpm: 104, counts: ['March', 'Add arm rolls on 5-8'] }),
    W('Slow salsa basic', 60, 'salsa-basic', 'march', 'Forward on 1, back to centre on 2-3; back on 5, centre on 6-7.', [], { bpm: 100, counts: ['1 forward, 2-3 back to centre', '5 back, 6-7 centre'] }),
    W('Hip sways', 60, 'hip-sway', 'march', 'Feet wide, sway the hips side to side.', [], { bpm: 104, counts: ['Sway right 1-2, left 3-4'], dir: 'RRLLRRLL' }),
    W('Slow cumbia step', 60, 'cumbia', 'march', 'Step back on a diagonal, return; other side.', [], { bpm: 100, counts: ['1-2 back right, 3-4 back left'], dir: 'RRLLRRLL' }),
  ],
  main: [
    M('Merengue', 60, 'merengue', 'march', 'Marching merengue, add side steps.', [], { bpm: 128, counts: ['March 1-4', 'Side steps right 5-8'], dir: 'NNNNRRRR' }),
    M('Salsa basic', 75, 'salsa-basic', 'march', 'Forward-back salsa basic, add shoulders.', [], { bpm: 110, counts: ['1 forward, 2-3 centre', '5 back, 6-7 centre', 'Add shoulders'] }),
    M('Salsa side + arms', 60, 'salsa-side', 'march', 'Side salsa: right on 1, left on 5, arms open.', [], { bpm: 110, counts: ['1 side right, 2-3 centre', '5 side left, 6-7 centre'], dir: 'RRRRLLLL' }),
    M('Cumbia', 75, 'cumbia', 'march', 'Cumbia step with a small turn of the shoulders.', [], { bpm: 105, counts: ['Back right 1-2, back left 3-4', 'Add shoulder turn'], dir: 'RRLLRRLL' }),
    M('Reggaeton step (low impact)', 60, 'reggaeton', 'march', 'Bounce the knees, step side, tap.', [], { bpm: 100, counts: ['Step right, tap', 'Step left, tap', 'Add arm pumps'], dir: 'RRLLRRLL' }),
    M('Cha-cha side', 45, 'cha-cha', 'march', 'Rock step, then cha-cha-cha to the side.', [], { bpm: 115, counts: ['2-3 rock step, 4&5 cha-cha-cha right', '6-7 rock, 8&1 cha-cha-cha left'], dir: 'RRRRLLLL' }),
    M('Combo: merengue + salsa', 90, 'combo-merengue-salsa', 'march', 'One 8 merengue, one 8 salsa basic.', [], { bpm: 120, counts: ['8 merengue', '8 salsa basic', 'Repeat and smile'] }),
    M('Mambo', 60, 'mambo', 'march', 'Mambo forward and back.', [], { bpm: 120, counts: ['1 forward, 2 rock, 3 together', '5 back, 6 rock, 7 together'] }),
    M('Samba-style bounce (low)', 60, 'samba', 'march', 'Small bounce through the knees, step-ball-change. No jumping.', [], { bpm: 126, counts: ['Bounce 1-a-2', 'Other side 3-a-4'] }),
    M('Cumbia combo', 75, 'cumbia', 'march', 'Cumbia + side steps with arms.', [], { bpm: 110, counts: ['8 cumbia', '8 side steps, arms open'], dir: '' }),
    M('Slow salsa turn', 45, 'salsa-turn', 'march', 'Easy walk-around turn in 4 steps, or just sway.', [], { bpm: 110, counts: ['Turn right 1-4', 'Turn left 5-8'], dir: 'RRRRLLLL' }),
    M('Merengue party', 75, 'merengue', 'march', 'Merengue with big arms and hip sways.', [], { bpm: 130, counts: ['March', 'Add arm rolls', 'Add hip sways'] }),
    M('Reggaeton combo', 60, 'reggaeton', 'march', 'Step-taps with shoulder pops.', [], { bpm: 100, counts: ['Step-tap right, pop', 'Step-tap left, pop'], dir: 'RRLLRRLL' }),
    M('Freestyle fiesta', 45, 'freestyle', 'march', 'Any Latin step you like, stay with the beat.', [], { bpm: 124, counts: ['Your move!', 'Stay on the beat'] }),
    M('Full combo', 90, 'combo-full', 'march', 'Merengue, salsa, cumbia: one 8 each.', [], { bpm: 124, counts: ['8 merengue', '8 salsa', '8 cumbia'] }),
  ],
  cool: [
    C('Slow sway', 60, 'sway', 'march', 'Slow hip sway, long breaths.'),
    C('Arm and shoulder stretch', 60, 'stretch-chest', 'cool', 'Arm across the chest, then swap.'),
    C('Side stretch', 60, 'stretch-side', 'cool', 'Reach up and over, swap at 30 seconds.'),
    C('Hamstring stretch', 60, 'stretch-hamstring', 'cool', 'Heel forward, hinge from the hips.'),
    C('Breathe', 60, 'breathe', 'cool', 'Hands on your heart, slow breaths.'),
  ],
});

/* ---------------- YOGA (female lead, ambient) ---------------- */
const yoga = build({
  id: 'yoga', name: 'Yoga', lead: 'f', intensity: 'Gentle', tags: ['mind-body', 'gentle'], music: 'ambient', bpm: 60, met: 2.5, track: 'hold', warmTrack: 'still',
  blurb: 'Slow, beginner yoga with breath cues. Reta times your holds, and the timer only counts while you\'re in the pose.',
  warm: [
    W('Breathing with arms', 60, 'mountain-arms', 'cool', 'Stand tall. Breathe in for 4 as the arms rise, out for 6 as they lower.', ['Breathe in… 2… 3… 4', 'And out… slowly']),
    W('Neck and shoulder rolls', 60, 'mountain-arms', 'cool', 'Gentle half-circles with the head, then roll the shoulders.'),
    W('Cat-cow (seated or all fours)', 60, 'cat-cow', 'cool', 'Breathe in, lift the chest; breathe out, round the back.', ['Inhale, open', 'Exhale, round']),
    W('Standing side bend', 60, 'mountain-arms', 'cool', 'Arms up, lean gently to one side, then the other.'),
    W('Mountain pose', 60, 'mountain-arms', 'cool', 'Stand tall, feet hip-width, arms by your sides. Breathe.', ['Crown of the head lifts', 'Soft shoulders']),
  ],
  main: [
    M('Chair pose', 60, 'chair-pose', 'squat', 'Feet together or hip-width, sit back as if into a chair, arms up.', ['Breathe in, reach up', 'Breathe out, sit a little lower'], { pose: 'chair' }),
    M('Warrior II (right)', 60, 'warrior-2', 'lunge', 'Feet wide, right toes out, bend the right knee over the ankle, arms out at shoulder height.', ['Gaze over the front hand', 'Breathe'], { pose: 'warrior2' }),
    M('Warrior II (left)', 60, 'warrior-2', 'lunge', 'Same on the left side.', ['Long through both arms', 'Soft breath'], { pose: 'warrior2' }),
    M('Tree pose (right, hold the chair)', 60, 'tree-chair', 'cool', 'Stand on the left leg, right foot on your ankle or calf (never the knee). Hold a chair if you like.', ['Steady gaze', 'Breathe'], { pose: 'tree' }),
    M('Tree pose (left)', 60, 'tree-chair', 'cool', 'Stand on the right leg, left foot on the ankle or calf.', ['Find a spot to focus on'], { pose: 'tree' }),
    M('Chair pose flow', 90, 'chair-pose', 'squat', 'Inhale stand, exhale sit into chair pose. Hold the last one.', ['Inhale up', 'Exhale, sit back'], { pose: 'chair' }),
    M('Downward dog (knees bent)', 60, 'down-dog-bent', 'cool', 'From all fours, tuck the toes and lift the hips. Keep the knees bent and heels up.', ['Long spine', 'Breathe'], { track: 'still' }),
    M('Cat-cow flow', 60, 'cat-cow', 'cool', 'On all fours: inhale, lift the chest; exhale, round the back.', ['Inhale, open', 'Exhale, round'], { track: 'still' }),
    M('Triangle (right, short)', 60, 'triangle', 'lunge', 'Legs wide, reach forward over the right leg, hand to the shin or a chair, other arm up.', ['Long side body'], { track: 'still' }),
    M('Triangle (left, short)', 60, 'triangle', 'lunge', 'Other side.', ['Breathe into the side'], { track: 'still' }),
    M('Mountain flow with arms', 90, 'mountain-arms', 'cool', 'Stand tall. Inhale, arms overhead; exhale, hands to heart.', ['Inhale, reach', 'Exhale, soften'], { track: 'still' }),
    M('Chair pose hold', 75, 'chair-pose', 'squat', 'One more chair pose. Hold and breathe.', ['Stay with the breath', 'Sink a little lower if you can'], { pose: 'chair' }),
    M('Warrior II flow (both sides)', 90, 'warrior-2', 'lunge', 'Warrior II right, straighten, warrior II left, with the breath.', ['Inhale straighten', 'Exhale bend'], { pose: 'warrior2' }),
    M('Tree pose (right) again', 45, 'tree-chair', 'cool', 'Try lifting the arms if you feel steady.', [], { pose: 'tree' }),
    M('Tree pose (left) again', 45, 'tree-chair', 'cool', 'Other side.', [], { pose: 'tree' }),
  ],
  cool: [
    C('Seated forward fold', 60, 'seated-fold', 'cool', 'Sit, legs forward, hinge gently towards your toes.'),
    C('Gentle cat-cow', 60, 'cat-cow', 'cool', 'On all fours, slow cat-cow with long breaths.'),
    C('Supine twist', 60, 'supine-twist', 'cool', 'On your back, knees bent, let them drop to one side, then the other.'),
    C('Child\'s pose', 60, 'childs-pose', 'cool', 'Knees wide, sit back to your heels, arms forward.'),
    C('Relaxation', 60, 'childs-pose', 'cool', 'Lie or sit comfortably. Close your eyes. Breathe.'),
  ],
});

/* ---------------- PILATES (male lead, ambient) ---------------- */
const pilates = build({
  id: 'pilates', name: 'Pilates', lead: 'm', intensity: 'Gentle', tags: ['mind-body', 'gentle', 'strength'], music: 'ambient', bpm: 70, met: 3.0, track: 'reps', warmTrack: 'still',
  blurb: 'Controlled mat Pilates on a towel or carpet: bridges, leg lifts, clams, bird dog and knee planks. Reps are counted.',
  warm: [
    W('Breathing and pelvic tilts', 60, 'pelvic-tilt', 'bridge', 'Lie on your back, knees bent. Gently tilt the pelvis with the breath.'),
    W('Small bridges', 60, 'glute-bridge', 'bridge', 'Peel the hips up a little, then down. Slow.', [], { rep: 'bridge', track: 'reps' }),
    W('Cat-cow', 60, 'cat-cow', 'cool', 'On all fours, breathe in to lift the chest, out to round.'),
    W('Seated spine twist', 60, 'seated-twist', 'cool', 'Sit tall and twist gently side to side.'),
    W('Knee folds', 60, 'knee-folds', 'deadbug', 'On your back, lift one knee to tabletop, lower, swap. Back stays still.'),
  ],
  main: [
    M('Glute bridge', 60, 'glute-bridge', 'bridge', 'Feet flat, squeeze and lift the hips, lower slowly.', ['Squeeze at the top', 'Lower one bone at a time'], { rep: 'bridge' }),
    M('Side-lying leg lift (right)', 75, 'leg-lift', 'bridge', 'Lie on your left side, lift the top leg slowly, lower with control.', ['Lift for 2, lower for 2', 'Hips stacked'], { rep: 'legLift' }),
    M('Side-lying leg lift (left)', 75, 'leg-lift', 'bridge', 'Other side.', ['Long leg, slow'], { rep: 'legLift' }),
    M('Clams (right)', 75, 'clams', 'bridge', 'Lie on your side, knees bent, feet together, open the top knee.', ['Feet stay together', 'Slow and controlled'], { rep: 'clam' }),
    M('Clams (left)', 75, 'clams', 'bridge', 'Other side.', ['Hips stay still'], { rep: 'clam' }),
    M('Bird dog', 75, 'bird-dog', 'deadbug', 'On all fours, reach one arm forward and the opposite leg back, return, swap.', ['Reach long', 'Back flat like a table'], { rep: 'birddog' }),
    M('Knee plank', 45, 'knee-plank', 'pushup', 'Forearms down, knees down, straight line from head to knees.', ['Belly in', 'Breathe'], { track: 'plank' }),
    M('Bridge with a hold', 60, 'glute-bridge', 'bridge', 'Lift, hold for 2, lower slowly.', ['Hold… and lower'], { rep: 'bridge' }),
    M('Leg lift (right) round 2', 60, 'leg-lift', 'bridge', 'Smaller and slower than before.', [], { rep: 'legLift' }),
    M('Leg lift (left) round 2', 60, 'leg-lift', 'bridge', 'Other side.', [], { rep: 'legLift' }),
    M('Bird dog round 2', 75, 'bird-dog', 'deadbug', 'Pause for a breath at full reach.', [], { rep: 'birddog' }),
    M('Knee plank round 2', 45, 'knee-plank', 'pushup', 'Head to knees in one line.', [], { track: 'plank' }),
    M('Clams (right) round 2', 60, 'clams', 'bridge', 'Pause at the top.', [], { rep: 'clam' }),
    M('Clams (left) round 2', 60, 'clams', 'bridge', 'Other side.', [], { rep: 'clam' }),
    M('Bridge pulses', 75, 'glute-bridge', 'bridge', 'Lift, then small pulses at the top, lower slowly.', ['Tiny pulses', 'Keep breathing'], { rep: 'bridge' }),
  ],
  cool: [
    C('Child\'s pose', 60, 'childs-pose', 'cool', 'Knees wide, sit back, arms long.'),
    C('Lying spine twist', 60, 'lying-twist', 'cool', 'On your back, knees to one side, then the other.'),
    C('Hamstring stretch', 60, 'stretch-hamstring', 'cool', 'On your back, one leg up, hold behind the thigh.'),
    C('Figure-4 stretch', 60, 'figure-4', 'cool', 'Ankle on the opposite knee, gently draw in. Swap at 30 seconds.'),
    C('Breathe', 60, 'breathe', 'cool', 'Long slow breaths. Well done.'),
  ],
});

export const CLASSES = [boxing, dance, latin, yoga, pilates];
export const classById = id => CLASSES.find(c => c.id === id);

/** kcal for a stretch of time at a MET value: kcal/min = MET × 3.5 × kg / 200 (approx.). */
export const kcal = (met, kg, sec) => met * 3.5 * (kg || 75) / 200 * (sec / 60);
export const classKcal = (c, kg) => Math.round(c.steps.reduce((t, s) => t + kcal(s.met, kg, s.dur), 0));

/** "Recommended for you": gentle options on low-energy / GLP-1 days, otherwise the class done least recently. */
export function recommend({ history = [], lowEnergy = false, glp1 = false } = {}) {
  const last = id => { const h = history.filter(x => x.cls === id).map(x => +new Date(x.date)); return h.length ? Math.max(...h) : 0; };
  const pool = lowEnergy ? CLASSES.filter(c => c.tags.includes('gentle')) : CLASSES;
  const pick = [...pool].sort((a, b) => last(a.id) - last(b.id))[0];
  const why = lowEnergy ? (glp1 ? 'Low-energy day: a gentle class that\'s kind to your appetite and energy on GLP-1 medication.' : 'Low-energy day: a gentle, slower class.')
    : last(pick.id) ? 'You haven\'t done this one for a while.' : 'You haven\'t tried this one yet.';
  return { cls: pick, why };
}

/* ================= pose analysers ================= */
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2 });

/** Boxing: counts punches per side (elbow snaps open fast from guard), hooks (wrist crosses the midline at shoulder height),
 *  and checks the guard is up between punches. Uses world landmarks for angles, image landmarks for positions. */
export class PunchCounter {
  constructor() { this.reset(); }
  reset() {
    this.left = 0; this.right = 0; this.hooks = 0; this.guardOk = 1; this.guardDownSince = null;
    this.s = { L: { sm: new Smoother(0.5), state: 'guard', since: 0, last: 0, crossed: false }, R: { sm: new Smoother(0.5), state: 'guard', since: 0, last: 0, crossed: false } };
  }
  get total() { return this.left + this.right; }
  frame(lm, w, t) {
    if (!allVisible(lm, [LM.LS, LM.RS, LM.LE, LM.RE, LM.LW, LM.RW])) return { ready: false, events: [], flags: [] };
    const events = [], flags = [];
    const torso = allVisible(lm, [LM.LH, LM.RH]) ? Math.abs(mid(lm[LM.LS], lm[LM.RS]).y - mid(lm[LM.LH], lm[LM.RH]).y) || 0.25 : 0.25;
    const midX = mid(lm[LM.LS], lm[LM.RS]).x, shY = mid(lm[LM.LS], lm[LM.RS]).y;
    let extended = false;
    for (const [side, S, E, Wr] of [['L', LM.LS, LM.LE, LM.LW], ['R', LM.RS, LM.RE, LM.RW]]) {
      const st = this.s[side], a = st.sm.push(angle(w[S], w[E], w[Wr]));
      // straight punch: elbow from bent (<110°) to nearly straight (>145°) within 450 ms
      if (st.state === 'guard' && a < 110) { st.since = t; }
      const forward = Math.abs(lm[Wr].y - shY) < 0.4 * torso; // punches go out at about shoulder height, not hanging down
      if (st.state === 'guard' && a > 145 && forward && t - st.since < 450 && t - st.last > 220) { st.state = 'out'; st.last = t; side === 'L' ? this.left++ : this.right++; events.push({ type: 'punch', side, kind: 'straight' }); }
      else if (st.state === 'out' && a < 115) { st.state = 'guard'; st.since = t; }
      if (st.state === 'out') extended = true;
      // hook: wrist swings across the body midline at about shoulder height
      const wx = lm[Wr].x, atShoulder = Math.abs(lm[Wr].y - shY) < 0.35 * torso;
      const across = side === 'L' ? wx < midX - 0.05 : wx > midX + 0.05; // image coords: person's left arm is on image right
      if (atShoulder && across && !st.crossed && t - st.last > 250 && a > 70 && a < 140) { st.crossed = true; st.last = t; side === 'L' ? this.left++ : this.right++; this.hooks++; events.push({ type: 'punch', side, kind: 'hook' }); }
      else if (!across) st.crossed = false;
    }
    // guard: both wrists at or above roughly chin level when not punching
    const guardUp = [LM.LW, LM.RW].every(i => lm[i].y < shY + 0.12 * torso);
    if (!extended && !guardUp) { this.guardDownSince ??= t; if (t - this.guardDownSince > 1200) flags.push('guard'); } else this.guardDownSince = null;
    this.guardOk = this.guardOk * 0.97 + (extended || guardUp ? 1 : 0) * 0.03;
    return { ready: true, events, flags };
  }
}

/** Dance/Latin: movement energy, on-beat score ("stay in rhythm"), and step-direction matching. */
export class RhythmMeter {
  constructor() { this.reset(); }
  reset() { this.prev = null; this.energy = 0; this.rhythm = 0.5; this.dirScore = 0.5; this.points = 0; this.speeds = []; this.cx = []; this.lastPeak = 0; }
  // beat: { period (ms), phase(t) -> 0..1 within the current beat, count(t) -> 1..8 }, dir: 'RRLL...' (8 chars; R/L/N) or ''
  frame(lm, t, beat, dir = '') {
    if (!allVisible(lm, [LM.LS, LM.RS, LM.LH, LM.RH])) return { ready: false, events: [], flags: [] };
    const pts = [LM.LS, LM.RS, LM.LH, LM.RH, LM.LW, LM.RW, LM.LA, LM.RA, LM.LK, LM.RK].map(i => lm[i]);
    const body = Math.abs(mid(lm[LM.LS], lm[LM.RS]).y - mid(lm[LM.LH], lm[LM.RH]).y) || 0.25;
    const cx = mid(lm[LM.LH], lm[LM.RH]).x;
    let speed = 0;
    if (this.prev) { const dt = Math.max(1, t - this.prev.t); speed = pts.reduce((s, p, k) => s + ((p.visibility ?? 1) > 0.5 ? dist2(p, this.prev.p[k]) : 0), 0) / body / dt * 1000; }
    this.prev = { t, p: pts.map(p => ({ x: p.x, y: p.y })) };
    this.energy = this.energy * 0.95 + Math.min(1, speed / 6) * 0.05;
    // peak detection on speed: a local maximum above a floor counts as a "hit"; score its distance to the nearest beat
    this.speeds.push({ t, s: speed }); if (this.speeds.length > 3) this.speeds.shift();
    const events = [];
    if (this.speeds.length === 3 && beat?.period) {
      const [a, b, c] = this.speeds;
      if (b.s > a.s && b.s >= c.s && b.s > 1.2 && b.t - this.lastPeak > beat.period * 0.45) {
        this.lastPeak = b.t; const ph = beat.phase(b.t); const err = Math.min(ph, 1 - ph); // 0 = on the beat, 0.5 = off
        const hit = 1 - 2 * err; this.rhythm = this.rhythm * 0.85 + hit * 0.15;
        if (hit > 0.6) { this.points += 1; events.push({ type: 'onbeat' }); }
      }
    }
    // direction: hips moving towards the expected side over the last ~half second
    this.cx.push({ t, x: cx }); while (this.cx.length && t - this.cx[0].t > 500) this.cx.shift();
    if (dir && beat?.count && this.cx.length > 3) {
      const want = dir[(beat.count(t) - 1) % dir.length];
      const dx = this.cx[this.cx.length - 1].x - this.cx[0].x; // image x grows to the person's LEFT (raw, unmirrored)
      if ((want === 'R' || want === 'L') && Math.abs(dx) > 0.01) { const ok = want === 'R' ? dx < 0 : dx > 0; this.dirScore = this.dirScore * 0.9 + (ok ? 1 : 0) * 0.1; }
    }
    const score = Math.round(100 * Math.min(1, 0.5 * Math.min(1, this.energy * 2.5) + 0.3 * Math.max(0, this.rhythm) + 0.2 * (dir ? this.dirScore : 0.7)));
    return { ready: true, events, flags: this.energy < 0.05 ? ['still'] : [], score, energy: this.energy, rhythm: Math.max(0, this.rhythm) };
  }
}

/** Yoga: approximate pose matching from key joint angles + stillness; the hold timer only counts while matched and steady. */
export function matchPose(pose, lm, w) {
  const need = [LM.LS, LM.RS, LM.LH, LM.RH, LM.LK, LM.RK, LM.LA, LM.RA];
  if (!allVisible(lm, need)) return { ready: false };
  const kL = angle(w[LM.LH], w[LM.LK], w[LM.LA]), kR = angle(w[LM.RH], w[LM.RK], w[LM.RA]);
  const torso = Math.abs(mid(lm[LM.LS], lm[LM.RS]).y - mid(lm[LM.LH], lm[LM.RH]).y) || 0.25;
  if (pose === 'chair') {
    const k = (kL + kR) / 2;
    if (k > 155) return { ready: true, ok: false, tip: 'Sink a bit lower into the chair pose', joints: [LM.LK, LM.RK] };
    if (k < 85) return { ready: true, ok: false, tip: 'Come up a little, knees no lower than the chair', joints: [LM.LK, LM.RK] };
    return { ready: true, ok: true, tip: 'Lovely chair pose. Breathe' };
  }
  if (pose === 'warrior2') {
    const bent = Math.min(kL, kR), straight = Math.max(kL, kR);
    const wide = Math.abs(lm[LM.LA].x - lm[LM.RA].x) > 1.3 * Math.abs(lm[LM.LS].x - lm[LM.RS].x);
    const armsOk = allVisible(lm, [LM.LW, LM.RW]) ? [LM.LW, LM.RW].every((i, k) => Math.abs(lm[i].y - lm[k ? LM.RS : LM.LS].y) < 0.3 * torso) : true;
    if (!wide) return { ready: true, ok: false, tip: 'Step your feet wider apart', joints: [LM.LA, LM.RA] };
    if (bent > 150) return { ready: true, ok: false, tip: 'Bend your front knee over your ankle', joints: [LM.LK, LM.RK] };
    if (straight < 150) return { ready: true, ok: false, tip: 'Straighten your back leg', joints: [LM.LK, LM.RK] };
    if (!armsOk) return { ready: true, ok: false, tip: 'Arms out at shoulder height', joints: [LM.LW, LM.RW] };
    return { ready: true, ok: true, tip: 'Strong warrior. Breathe' };
  }
  if (pose === 'tree') {
    const lift = Math.abs(lm[LM.LA].y - lm[LM.RA].y);
    const standing = lm[LM.LA].y > lm[LM.RA].y ? kL : kR;
    if (lift < 0.08 * torso) return { ready: true, ok: false, tip: 'Lift one foot onto your ankle or calf, hold the chair if you need', joints: [LM.LA, LM.RA] };
    if (standing < 155) return { ready: true, ok: false, tip: 'Stand tall on the supporting leg', joints: [LM.LK, LM.RK] };
    return { ready: true, ok: true, tip: 'Beautiful tree. Steady breath' };
  }
  return { ready: true, ok: true };
}
export class HoldTracker {
  constructor(pose = null) { this.pose = pose; this.reset(); }
  reset() { this.held = 0; this.prev = null; this.motion = 0; this.lastT = null; this.inPose = false; }
  frame(lm, w, t) {
    const m = this.pose ? matchPose(this.pose, lm, w) : { ready: allVisible(lm, [LM.LS, LM.RS, LM.LH, LM.RH]), ok: true };
    if (!m.ready) { this.lastT = t; return { ready: false, events: [], flags: [] }; }
    const pts = [LM.LS, LM.RS, LM.LH, LM.RH, LM.LW, LM.RW].map(i => ({ x: lm[i].x, y: lm[i].y }));
    if (this.prev) this.motion = this.motion * 0.85 + pts.reduce((s, p, k) => s + dist2(p, this.prev[k]), 0) * 0.15;
    this.prev = pts;
    const still = this.motion < 0.012;
    this.inPose = !!m.ok && still;
    if (this.inPose && this.lastT != null) this.held += Math.min(250, t - this.lastT) / 1000;
    this.lastT = t;
    return { ready: true, events: [], flags: m.ok ? (still ? [] : ['wobble']) : ['pose'], ok: m.ok, still, tip: m.tip, joints: m.joints, held: this.held };
  }
}

/** Pilates reps: bridge (from logic.js), side-lying leg lift, clam, bird dog; plank = straight-line hold. */
export function makePilates(kind) {
  if (kind === 'bridge') return makeAnalyser('bridge');
  if (kind === 'legLift' || kind === 'clam') {
    const [A, B, top, bottom] = kind === 'legLift' ? [LM.LA, LM.RA, 30, 14] : [LM.LK, LM.RK, 32, 15];
    const rc = new RepCounter({ mode: 'rise', top, bottom, minRepMs: 800 }), sm = new Smoother(0.4);
    return { rc, frame(lm, w, t) {
      if (!allVisible(lm, [A, B, LM.LH, LM.RH])) return { ready: false };
      const v = sm.push(angle(w[A], mid(w[LM.LH], w[LM.RH]), w[B])); const ev = rc.update(v, t);
      return { ready: true, value: v, events: ev ? [ev] : [], flags: [] };
    } };
  }
  if (kind === 'birddog') {
    const rc = new RepCounter({ mode: 'rise', top: 150, bottom: 120, minRepMs: 900 }), sm = new Smoother(0.4);
    return { rc, frame(lm, w, t) {
      const sides = [[LM.LH, LM.LS, LM.LW, LM.RS, LM.RH, LM.RA], [LM.RH, LM.RS, LM.RW, LM.LS, LM.LH, LM.LA]];
      let best = null;
      for (const [h, s, wr, s2, h2, an] of sides) if (allVisible(lm, [h, s, wr, s2, h2, an])) { const v = Math.min(angle(w[h], w[s], w[wr]), angle(w[s2], w[h2], w[an])); best = Math.max(best ?? 0, v); }
      if (best == null) return { ready: false };
      const v = sm.push(best), ev = rc.update(v, t); return { ready: true, value: v, events: ev ? [ev] : [], flags: [] };
    } };
  }
  if (kind === 'plank') {
    const h = { held: 0, lastT: null };
    return { rc: { reps: 0, reset() {} }, hold: h, frame(lm, w, t) {
      const side = [[LM.LS, LM.LH, LM.LK], [LM.RS, LM.RH, LM.RK]].find(ids => allVisible(lm, ids));
      if (!side) { h.lastT = t; return { ready: false }; }
      const a = angle(w[side[0]], w[side[1]], w[side[2]]);
      const horiz = Math.abs(lm[side[0]].y - lm[side[1]].y) < 0.6 * Math.abs(lm[side[0]].x - lm[side[1]].x);
      const ok = a > 150 && horiz;
      if (ok && h.lastT != null) h.held += Math.min(250, t - h.lastT) / 1000; h.lastT = t;
      return { ready: true, ok, held: h.held, tip: ok ? 'Solid plank. Breathe' : a <= 150 ? 'Make a straight line from head to knees' : 'Forearms and knees down, body long', events: [], flags: ok ? [] : ['line'] };
    } };
  }
  return makeAnalyser('timed');
}
