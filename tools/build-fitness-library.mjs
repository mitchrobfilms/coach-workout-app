// Builds fitness-library.json. Original GLP1 Life sessions only. No third-party class names.
import fs from 'node:fs';

const tip = 'Move slowly, keep the range comfortable, and breathe out on the effort.';
const harder = 'Slow the lowering to a count of three, and pause for a breath at the hardest point.';

function seg(partial) {
  return { mode: 'timer', tip, harder, ...partial };
}

function build(minutes, pool) {
  const total = minutes * 60;
  const warmSec = 45;
  const parts = [{ ...seg({ id: 'warm', phase: 'warmup', name: 'Easy march', seconds: warmSec, swap: 'March seated, lifting the heels only.', harder: 'Lift the knees a little higher, with both feet staying quiet.' }) }];
  let used = warmSec;
  const coolFloor = 60;
  let i = 0;
  while (used + coolFloor + 30 <= total && i < 24) {
    if (parts.some(p => p.phase === 'work')) {
      const rest = 20;
      if (used + rest + 30 + coolFloor > total) break;
      parts.push(seg({ id: 'rest-' + i, phase: 'rest', name: 'Rest', seconds: rest, swap: 'Sit down for this rest.', harder: 'Stay standing and march slowly.', tip: 'Shake your hands loose and take an easy breath.' }));
      used += rest;
    }
    const room = total - coolFloor - used;
    const seconds = Math.min(60, room);
    if (seconds < 30) break;
    const move = pool[i % pool.length];
    parts.push(seg({ id: 'work-' + i, phase: 'work', seconds, reps: move.reps || null, ...move }));
    used += seconds;
    i++;
  }
  parts.push(seg({ id: 'cool', phase: 'cooldown', name: 'Easy cool-down', seconds: total - used, swap: 'Stay seated and roll your shoulders.', harder: 'Add a gentle chest opener against a doorway.', tip: 'Slow the march, then stretch only as far as feels easy.' }));
  const sum = parts.reduce((a, s) => a + s.seconds, 0);
  if (sum !== total) throw new Error('sum ' + sum + ' != ' + total);
  return parts;
}

const chair = 'Hold the back of a sturdy chair and make the move smaller.';
const seat = 'Do this seated, and only lift as far as is comfortable.';
const wall = 'Keep a hand on the wall and shorten the step.';

const W = (id, title, level, focus, equipment, minutes, met, blurb, pool) => ({
  id, kind: 'follow', title, level, focus, equipment, intensity: 'low', minutes, met, blurb, segments: build(minutes, pool),
});

const squat = { name: 'Sit to stand', reps: 8, swap: chair, tip: 'Use a sturdy chair. Sit back, then stand tall without locking the knees.' };
const wallPush = { name: 'Wall push', reps: 8, swap: 'Step closer to the wall so the push is shorter.', tip: 'Hands at shoulder height, body in a straight line, elbows point slightly down.' };
const bridge = { name: 'Glute bridge', reps: 8, swap: 'Lift the hips only a little, or press the feet down without lifting.', tip: 'Lie on a towel, ribs down, and pause for a breath at the top.' };
const tap = { name: 'Step-back tap', reps: 6, swap: wall, tip: 'Tap the toes back. A small bend in both knees is enough.' };
const march = { name: 'March and swing', swap: seat, tip: 'Swing the arms below shoulder height and keep the steps quiet.' };
const side = { name: 'Side step and touch', swap: 'Make the step tiny, or touch the toe out without shifting weight.', tip: 'Step out, touch the other foot beside it, and stay tall.' };
const knee = { name: 'Low knee lift', reps: 8, swap: chair, tip: 'Lift the knee only as high as is easy. Hold a chair if you like.' };
const row = { name: 'Standing row', reps: 8, swap: seat, tip: 'Elbows brush the ribs, shoulders stay down, and you squeeze between the shoulder blades.' };
const hinge = { name: 'Hip hinge', reps: 8, swap: 'Rest both hands on your thighs and only tip a little.', tip: 'Soft knees, send the hips back, and keep the back long.' };
const deadbug = { name: 'Heel tap', reps: 6, swap: 'Keep both feet down and only slide one heel a little way.', tip: 'On a towel, back resting down, tap one heel at a time.' };
const bird = { name: 'Bird dog', reps: 6, swap: 'Move one arm only, or one leg only.', tip: 'Hands under shoulders. Reach long without arching the back.' };
const clam = { name: 'Side-lying lift', reps: 8, swap: 'Lift the knee only a few centimetres, or skip the lift and just hold.', tip: 'Lie on your side, heels together, and lift the top knee a little.' };
const twist = { name: 'Seated turn', reps: 6, swap: 'Turn only the head, and keep the shoulders still.', tip: 'Sit tall on a chair and turn the chest a small way. Stop if your back complains.' };
const extend = { name: 'Seated leg reach', reps: 8, swap: 'Straighten the knee only part of the way.', tip: 'Sit back in the chair and reach one heel forward, toes up.' };
const calf = { name: 'Calf raise hold', swap: chair, tip: 'Rise onto the toes only as far as is steady, then lower slowly.' };
const opener = { name: 'Chest opener', swap: 'Clasp the hands in front instead, and only open a little.', tip: 'Hands on the hips or lightly behind you. Open the chest without forcing the shoulders.' };
const figure = { name: 'Figure-four stretch', swap: 'Keep the foot on the floor and only cross the ankle over the knee while seated.', tip: 'Seated, ankle over the other knee, and hinge only a little.' };
const breath = { name: 'Slow side reach', swap: 'Reach only to shoulder height.', tip: 'One arm up, lean a small way, and keep breathing.' };

const workouts = [
  W('five-minute-reset', 'Five-minute reset', 'beginner', 'mobility', 'none', 5, 2.3, 'A short low-impact reset for a stiff or low-energy day.', [march, side, opener]),
  W('gentle-start-8', 'Gentle start', 'beginner', 'full', 'none', 8, 2.8, 'A first full-body session. No equipment, no bouncing, and a rest between moves.', [squat, wallPush, march, bridge]),
  W('chair-strength-10', 'Chair strength', 'beginner', 'strength', 'basic', 10, 3.0, 'A seated and standing strength session that uses one sturdy chair.', [extend, twist, squat, row]),
  W('core-beginner-10', 'Core basics', 'beginner', 'core', 'none', 10, 3.0, 'Quiet core work on a towel, with a smaller option for every move.', [deadbug, bridge, bird, breath]),
  W('mobility-10', 'Easy mobility', 'beginner', 'mobility', 'none', 10, 2.4, 'Slow ranges for hips, chest and shoulders. Nothing is held to the point of pain.', [opener, figure, breath, march]),
  W('easy-march-12', 'Easy march', 'beginner', 'cardio', 'none', 12, 3.2, 'A home march with side steps and low knee lifts.', [march, side, knee, march]),
  W('core-builder-12', 'Core builder short', 'intermediate', 'core', 'none', 12, 3.4, 'A slightly longer core session. Keep the back resting down on the floor moves.', [deadbug, bird, clam, bridge]),
  W('easy-march-15', 'Steady march', 'beginner', 'cardio', 'none', 15, 3.3, 'Fifteen minutes of low-impact steps you can make smaller at any time.', [march, side, knee, side]),
  W('full-flow-15', 'Full-body flow', 'beginner', 'full', 'none', 15, 3.5, 'Squat, push, hinge and bridge, with a rest after each block.', [squat, wallPush, hinge, bridge, knee]),
  W('core-builder-15', 'Core builder', 'intermediate', 'core', 'none', 15, 3.6, 'Core strength with bird dog, bridges and side-lying lifts.', [bird, bridge, deadbug, clam]),
  W('steady-strength-20', 'Steady strength', 'intermediate', 'strength', 'none', 20, 3.8, 'A low-impact strength circuit. Slow lowering is the harder option.', [squat, wallPush, hinge, row, bridge]),
  W('low-burn-20', 'Low-impact burn', 'intermediate', 'cardio', 'none', 20, 4.0, 'Continuous easy steps and low knees. Both feet stay quiet.', [march, side, knee, side, march]),
  W('core-advanced-20', 'Core longer', 'advanced', 'core', 'none', 20, 4.0, 'A longer core session for people who already feel steady on the shorter ones.', [bird, deadbug, clam, bridge, bird]),
  W('steady-strength-25', 'Strength builder', 'intermediate', 'strength', 'none', 25, 4.0, 'The same low-impact strength pattern, with more rounds.', [squat, row, hinge, wallPush, calf]),
  W('low-burn-25', 'Longer burn', 'intermediate', 'cardio', 'none', 25, 4.2, 'A longer low-impact cardio session. Take the seated march if you need it.', [march, knee, side, march, knee]),
  W('low-burn-30', 'Fat-burn march', 'intermediate', 'cardio', 'none', 30, 4.3, 'Thirty minutes of quiet cardio with planned rests.', [march, side, knee, march, side]),
  W('strong-flow-30', 'Strong flow', 'advanced', 'full', 'none', 30, 4.5, 'A full-body session for people who found the shorter flows comfortable.', [squat, wallPush, hinge, row, bridge, knee]),
  W('long-build-40', 'Long build', 'advanced', 'full', 'none', 40, 4.2, 'Forty low-impact minutes. Rests stay in the plan. Stop early if you feel unwell.', [squat, hinge, wallPush, row, bridge, bird, march]),
  W('long-march-50', 'Long march', 'advanced', 'cardio', 'none', 50, 4.0, 'Fifty minutes of easy marching for people who already walk this long without pain.', [march, side, knee, march, side, knee]),
];

const videos = [
  { id: 'video-ai-walk-15', kind: 'video', videoId: 'ai-walk-15', title: 'Beginner Indoor Walk', level: 'beginner', focus: 'cardio', equipment: 'none', intensity: 'low', minutes: 15, met: 3.3, coach: 'Coach Ava', blurb: 'The published Coach Ava indoor walk. Follow the video at your own pace.' },
  { id: 'video-ai-seated-10', kind: 'video', videoId: 'ai-seated-10', title: 'Seated Chair Workout', level: 'beginner', focus: 'strength', equipment: 'basic', intensity: 'low', minutes: 10, met: 2.8, coach: 'Coach Ava', blurb: 'The published seated class with Coach Ava. A chair without wheels is the only equipment.' },
  { id: 'video-ai-fullbody-15', kind: 'video', videoId: 'ai-fullbody-15', title: 'Full-Body Bodyweight', level: 'intermediate', focus: 'full', equipment: 'none', intensity: 'low', minutes: 15, met: 3.8, coach: 'Coach Ava', blurb: 'The published full-body class with Coach Ava. Every move in the video has an easier option.' },
];

const day = id => ({ rest: false, workoutId: id });
const rest = { rest: true, workoutId: null };
const week = (...ids) => ({ days: ids.map(id => id ? day(id) : rest) });

const programmesClean = [
  ['start-up', 'Start-Up', 'beginner', 'full', 'Four weeks of low-impact movement for getting started. Three short sessions most weeks, and rest between them.', [
    week('gentle-start-8', null, 'chair-strength-10', null, 'easy-march-12', null, null),
    week('gentle-start-8', null, 'chair-strength-10', null, 'easy-march-15', null, null),
    week('full-flow-15', null, 'chair-strength-10', null, 'easy-march-15', 'core-beginner-10', null),
    week('full-flow-15', null, 'five-minute-reset', null, 'easy-march-15', 'mobility-10', null),
  ]],
  ['lean-strong', 'Lean & Strong', 'intermediate', 'strength', 'Six weeks of low-impact strength with a cardio day and a rest day after the harder sessions.', [
    week('steady-strength-20', null, 'core-builder-12', null, 'low-burn-20', null, null),
    week('steady-strength-20', null, 'core-builder-12', null, 'low-burn-20', null, 'mobility-10'),
    week('steady-strength-25', null, 'core-builder-15', null, 'low-burn-25', null, null),
    week('steady-strength-25', null, 'core-builder-15', null, 'low-burn-25', null, 'mobility-10'),
    week('strong-flow-30', null, 'core-builder-15', null, 'low-burn-25', null, 'mobility-10'),
    week('strong-flow-30', null, 'steady-strength-25', null, 'low-burn-25', null, 'mobility-10'),
  ]],
  ['fat-burn', 'Low-Impact Fat Burn', 'intermediate', 'cardio', 'Four weeks of longer marches and low-impact steps. Rest days are part of the plan.', [
    week('easy-march-15', null, 'low-burn-20', null, 'easy-march-12', null, null),
    week('low-burn-20', null, 'easy-march-15', null, 'low-burn-20', null, 'mobility-10'),
    week('low-burn-25', null, 'full-flow-15', null, 'low-burn-25', null, 'mobility-10'),
    week('low-burn-30', null, 'strong-flow-30', null, 'low-burn-25', null, 'mobility-10'),
  ]],
  ['core-builder', 'Core Builder', 'beginner', 'core', 'Five weeks that start with short core basics and build only if the earlier weeks felt manageable.', [
    week('core-beginner-10', null, 'chair-strength-10', null, 'core-beginner-10', null, null),
    week('core-builder-12', null, 'full-flow-15', null, 'core-builder-12', null, 'mobility-10'),
    week('core-builder-15', null, 'steady-strength-20', null, 'core-builder-15', null, null),
    week('core-builder-15', null, 'steady-strength-20', null, 'core-advanced-20', null, 'mobility-10'),
    week('core-advanced-20', null, 'strong-flow-30', null, 'core-builder-15', null, 'mobility-10'),
  ]],
].map(([id, title, level, focus, blurb, weeks]) => ({ id, title, level, focus, intensity: 'low', weeks: weeks.length, blurb, weeksPlan: weeks }));

const gp = 'Check with your GP before you change how you eat or train. This is general information, not a meal plan or a medical instruction.';
const tips = [
  { id: 'recovery', topic: 'recovery', title: 'Recovery between sessions', minutes: 2, body: `Muscles and joints like a gap after a session. On GLP1 Life that gap is a rest day in the programme, a walk around the house, or an early night. Soreness that eases as you move is common. Pain that is sharp, one-sided, or still there the next morning is a reason to stop that move and choose the easier option next time.\n\nA rest day is still part of the plan. You do not have to fill it. If you want to move, use the five-minute reset or a slow march rather than repeating the hardest session.\n\nEat something with protein when you can, drink water through the day, and sleep before you add more minutes. ${gp}` },
  { id: 'sleep', topic: 'sleep', title: 'Sleep when appetite is quieter', minutes: 2, body: `A smaller appetite can make evening meals easy to skip, and a skipped meal can make sleep lighter. Aim for a regular bedtime and a small, protein-containing snack if you are waking hungry, such as yoghurt or a piece of cheese with fruit. Keep the bedroom dark and cool, and leave the phone outside the bed if you can.\n\nExercise earlier in the day if a late session leaves you wired. A short mobility session is a better evening choice than a long march.\n\nIf sleep has been poor for more than a couple of weeks, or you feel faint when you stand up, talk to your GP. Do not use exercise to push through exhaustion. ${gp}` },
  { id: 'mindset', topic: 'mindset', title: 'A low-energy day still counts', minutes: 2, body: `Some days the plan will feel like too much. That is information, not a failure. Open the session, use the easier option on every move, or swap to the five-minute reset. A finished short session keeps the week streak. An abandoned hard session does not make you fitter.\n\nTell the planner how the session felt. Too hard makes the next one gentler. Too easy makes the next one a little slower and stronger, still without bouncing.\n\nCompare yourself with your own last week, not with anyone else in the app. Coach Ava is an AI-generated instructor. The timed sessions in this library are written plans, not a live person watching you. ${gp}` },
  { id: 'deficit', topic: 'eating', title: 'A gentle calorie deficit', minutes: 3, body: `Weight change, if that is your goal, usually comes from a modest gap between the energy you eat and the energy you use. A gentle deficit is a slightly smaller plate, not a day of skipping meals. Very low calorie diets and crash weeks are a poor fit when you are already eating less, and they are not what these workouts assume.\n\nKeep a protein food at meals you do eat, include vegetables or fruit, and keep a carbohydrate you tolerate, such as potatoes, rice, or bread. The workouts add a little movement. They are not a licence to eat very little.\n\nThe calorie figure on a workout is an estimate from a standard formula. It is not a target to "earn" food, and it is not measured from your body. If you are losing weight very quickly, feeling cold, dizzy, or unwell, stop and speak to your GP or a registered dietitian. ${gp}` },
  { id: 'protein', topic: 'eating', title: 'Protein when meals are smaller', minutes: 3, body: `Smaller meals can mean less protein unless you plan for it. A practical pattern is a protein food at each meal you eat: eggs, yoghurt, milk, fish, chicken, tofu, beans, or cheese. You do not need a powder. If you use one, treat it as a food, read the label, and ask your GP or dietitian if it suits you.\n\nSpread protein across the day rather than saving it for one large meal you may not finish. If nausea makes solid food difficult, a yoghurt or a milky drink can be easier than a dry piece of meat.\n\nThis app does not set a gram target for you. Needs differ, and a prescriber or dietitian can set one if you need it. ${gp}` },
  { id: 'hydration', topic: 'eating', title: 'Hydration through the day', minutes: 2, body: `Thirst can be easy to miss when you are eating less often. Keep a glass of water nearby and sip through the session and afterwards. The home screen water goal is a prompt, not a medical fluid target.\n\nAdd drinks you enjoy: water, squash, tea, or milk. If you are dizzy on standing, cramping, or you have been sick, do not try to fix that with a large amount of water in one go. Contact your GP or NHS 111.\n\nAlcohol is dehydrating and it is easy to under-eat around it. You do not need a sports drink for these low-impact sessions. ${gp}` },
];

const lib = {
  version: 1,
  updated: '2026-11-12',
  safety: 'Stop if anything hurts, you feel dizzy, or you feel unwell. Keep both feet quiet: do not bounce or hop. This is general movement guidance, not medical advice. Check with your GP before you start a new exercise plan.',
  workouts, videos, programmes: programmesClean, tips,
};

fs.writeFileSync(new URL('../fitness-library.json', import.meta.url), JSON.stringify(lib, null, 2) + '\n');
console.log('workouts', workouts.length, 'programmes', programmesClean.map(p => p.id + ':' + p.weeks).join(','), 'tips', tips.length);
