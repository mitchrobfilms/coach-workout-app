import assert from 'node:assert/strict'; import fs from 'node:fs';
import { LINES, classLines, slug, introText } from '../voicelines.js'; import { buildLibrary } from '../classes.js';
const lib = buildLibrary(JSON.parse(fs.readFileSync(new URL('../library.json', import.meta.url))));
const cat = JSON.parse(fs.readFileSync(new URL('../voice-catalogue.json', import.meta.url)));
const ids = cat.lines.map(l => l.id);
assert.equal(new Set(ids).size, ids.length, 'catalogue ids unique');
for (const [id, t] of Object.entries(LINES)) assert.ok(cat.lines.find(l => l.id === id && l.text === t), 'common line in catalogue ' + id);
for (let n = 1; n <= 20; n++) assert.equal(LINES[`count.${n}`], String(n));
assert.equal(LINES['count.21'], undefined, 'numbers above 20 use the phone voice');
for (const c of lib) {
  assert.ok(ids.includes(`class.${c.id}.welcome`));
  for (const s of c.steps.filter(s => s.kind !== 'trans' && s.kind !== 'water')) {
    assert.ok(cat.lines.some(l => l.text === introText(s)), `intro text in catalogue: ${c.id} ${s.name}`);
    for (const q of s.cues || []) assert.ok(cat.lines.some(l => l.text === q), 'cue in catalogue ' + q);
  }
  assert.ok(classLines(c).every(l => /^[a-z0-9._-]+$/.test(l.id)), 'ids are file-safe');
}
assert.equal(slug('Child\'s pose (long)'), 'child-s-pose-long');
const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
assert.ok(app.includes("settings.voiceMode !== 'phone'") && fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').includes('Recorded (realistic)'));
console.log('voicelines tests passed:', ids.length, 'lines');
