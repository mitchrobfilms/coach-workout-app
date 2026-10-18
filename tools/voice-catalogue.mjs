// Writes voice-catalogue.json: every recordable line (stable id -> text, tags) for the instructor voice job.
import fs from 'node:fs'; import path from 'node:path';
import { buildLibrary } from '../classes.js'; import { LINES, classLines } from '../voicelines.js';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const lib = buildLibrary(JSON.parse(fs.readFileSync(path.join(ROOT, 'library.json'), 'utf8')));
const map = new Map(Object.entries(LINES).map(([id, text]) => [id, { id, text, tags: [id.split('.')[0]] }]));
for (const c of lib) for (const l of classLines(c)) { let id = l.id, n = 2; while (map.has(id) && map.get(id).text !== l.text) id = `${l.id}-${n++}`; if (!map.has(id)) map.set(id, { ...l, id }); }
const out = { note: 'Record each line for both trainers as media/voice/<m|f>/<id>.mp3 and list it in media/voice/voice-manifest.json. IDs are stable.', count: map.size, lines: [...map.values()] };
fs.writeFileSync(path.join(ROOT, 'voice-catalogue.json'), JSON.stringify(out, null, 1));
console.log('voice-catalogue.json:', map.size, 'lines');
