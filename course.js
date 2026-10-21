// GLP1 Life Classes: a structured course for people using a prescribed GLP-1 medicine for weight loss (e.g. Wegovy, Mounjaro).
// General education only. STRICT: no doses, schedules or titration; no calculators; no vials/reconstitution/peptides/
// compounded or unlicensed products; no sourcing or prices. Every lesson ends with "follow your prescriber and the patient leaflet".
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ALWAYS = 'Always follow your prescriber\'s advice and the patient information leaflet that comes with your medicine. This course is general information, not medical advice.';
export const MODULES = [
 { id: 'start', icon: '🌱', title: 'Starting your weight-loss journey', lessons: [
  { id: 'what', title: 'What GLP-1 weight-loss medicines do', body: ['Medicines such as Wegovy (semaglutide) and Mounjaro (tirzepatide) are licensed in the UK for weight management alongside a reduced-calorie diet and more activity.', 'They act on hormones that control appetite and fullness, so many people feel full sooner and think about food less.', 'They are prescribed medicines: only use a licensed pen prescribed for you by a registered prescriber.'] },
  { id: 'expect', title: 'Realistic expectations', body: ['Weight loss is usually gradual and uneven: some weeks drop, some stay the same, some go up a little.', 'Track trends over weeks, not single weigh-ins. Measurements, clothes and energy matter too.', 'Your prescriber will review how you are getting on; bring your questions to those check-ins.'] },
  { id: 'goals', title: 'Setting goals that stick', body: ['Pick 2 or 3 habit goals (for example protein at every meal, 2 litres of fluid, a daily walk) alongside any weight goal.', 'Use the Weigh In and Hydration trackers in GLP1 Life to see progress.'] } ] },
 { id: 'pen', icon: '💉', title: 'Using your pre-filled pen safely', lessons: [
  { id: 'prep', title: 'Before you inject', body: ['Read the instructions for use in your pen\'s leaflet every time you start a new pen type: pens differ (some have a needle to attach, some are single-use auto-injectors).', 'Wash and dry your hands. Check the pen name, that it is in date, and that the liquid looks as the leaflet describes.', 'Only prime or "flow check" a pen if your pen\'s leaflet tells you to, exactly as it describes.'] },
  { id: 'sites', title: 'Injection sites and rotating them', body: ['The main sites are the tummy (left or right) and the front of the thighs (left or right). Leaflets also list the upper arm, usually done with help from someone else.', 'Change the spot each time, even within the same area, to avoid sore or lumpy skin. Avoid skin that is bruised, tender, scarred or hard.', 'Log the site you used in the Injection Tracker so you remember to rotate.'] },
  { id: 'needle', title: 'Needles and sharps disposal', body: ['If your pen uses a separate needle, use a new one each time and follow the leaflet steps to attach and remove it.', 'Put used needles and pens straight into a sharps bin. Ask your pharmacy or GP surgery how to get one and how to return it locally. Never put sharps in household rubbish.', 'Never share pens or needles, even with a new needle.'] },
  { id: 'store', title: 'Storage and travel', body: ['Store pens as the leaflet says: many must be kept in the fridge before first use and must not be frozen. Keep the cap on to protect from light.', 'When travelling, keep pens in hand luggage, carry your prescription or a letter, and check the leaflet for how long the pen can be out of the fridge.'] },
  { id: 'missed', title: 'If you miss an injection', body: ['Do not guess. What to do after a missed injection depends on the medicine and how long ago it was due.', 'Follow the missed-dose section of your patient leaflet, or ask your pharmacist or prescriber.', 'Never take two to "catch up" unless your prescriber tells you to.'] } ] },
 { id: 'safety', icon: '🚩', title: 'Side effects and red flags', lessons: [
  { id: 'common', title: 'Common side effects', body: ['Feeling sick, constipation, diarrhoea, burping, heartburn and tiredness are common, especially early on or after a change your prescriber makes.', 'Eating smaller meals slowly, stopping when full, avoiding very fatty food and drinking regularly can help.', 'Tell your prescriber or pharmacist if side effects are bothering you.'] },
  { id: 'flags', title: 'Red flags: get help', body: ['Call 999 or go to A&E for severe tummy pain that will not go away (it may spread to your back), with or without vomiting: this can be pancreatitis.', 'Get urgent advice (NHS 111 or your GP) for pain in the upper right tummy, yellow skin or eyes, or fever (possible gallbladder problems); vomiting or diarrhoea that stops you keeping fluids down (risk of dehydration and kidney problems); or signs of an allergic reaction.', 'Call 999 for swelling of the face or throat or difficulty breathing.'] },
  { id: 'meds', title: 'Other medicines and contraception', body: ['Tell your prescriber about all other medicines and supplements.', 'Some GLP-1 medicines can affect how well the contraceptive pill works, especially with tummy upsets. Check your leaflet and ask your pharmacist about contraception.', 'Do not use these medicines if pregnant, trying to get pregnant or breastfeeding unless your prescriber says so.'] } ] },
 { id: 'food', icon: '🥗', title: 'Appetite, nutrition and protein', lessons: [
  { id: 'appetite', title: 'Eating with a smaller appetite', body: ['Smaller portions are normal. Make each meal count: protein first, then vegetables, then carbs.', 'Eat slowly and stop at the first sign of fullness; overeating often brings on nausea.'] },
  { id: 'protein', title: 'Protein to protect muscle', body: ['Losing weight quickly can mean losing muscle too. Protein at every meal plus strength exercise helps keep it.', 'Good choices: eggs, Greek yoghurt, cottage cheese, chicken, fish, lean mince, tofu, beans and lentils.', 'Use Meal Plan Builder for high-protein, small-portion ideas. A dietitian or your prescriber can advise on your own needs.'] },
  { id: 'water', title: 'Hydration', body: ['A smaller appetite can mean drinking less too. Sip through the day; most adults need around 6 to 8 drinks a day, more in heat or with exercise.', 'Dark urine, headaches and dizziness can be signs of dehydration. Use the Hydration tracker in 500 ml steps.'] } ] },
 { id: 'move', icon: '🏃', title: 'Exercise and muscle', lessons: [
  { id: 'why', title: 'Why strength matters', body: ['Strength work 2 or more days a week helps keep muscle and bone while you lose weight.', 'Start gently: chair exercises, walking, Pilates or low-impact cardio all count. See the Workouts section.'] },
  { id: 'safe', title: 'Exercising safely', body: ['Eat a little and drink before exercise if your appetite is low. Stop if you feel dizzy, faint or unwell.', 'Check with your GP before starting new exercise if you have health conditions.'] } ] },
 { id: 'mind', icon: '🧠', title: 'Mindset and habits', lessons: [
  { id: 'food-noise', title: 'Food noise and emotional eating', body: ['Many people notice "food noise" goes quieter. Use this time to build habits that last: regular meals, planned snacks, good sleep.', 'If you eat for comfort, try a 10-minute pause, a walk or a chat with a friend or the GLP1 Life community.'] },
  { id: 'kind', title: 'Be kind to yourself', body: ['Progress is not a straight line. Celebrate non-scale wins.', 'If you feel low or anxious, talk to your GP. Changes in mood are worth mentioning to your prescriber.'] } ] },
 { id: 'long', icon: '📈', title: 'Plateaus, stopping and maintaining', lessons: [
  { id: 'plateau', title: 'Plateaus', body: ['Plateaus are normal as your body adapts. Look at sleep, protein, portion creep, fluids and activity.', 'Discuss your plan with your prescriber. Never change how you take your medicine on your own.'] },
  { id: 'stop', title: 'Coming off and keeping it off', body: ['Appetite often returns after stopping, and some weight can come back. Any decision to stop or change treatment is one to make with your prescriber.', 'The habits from this course (protein, strength, hydration, planning, sleep) are what help you maintain.', 'Keep weighing in regularly so you can act early.'] } ] },
];
export const SOURCES = 'Based on NHS patient information, MHRA guidance and the official patient leaflets for licensed GLP-1 medicines. Always check the leaflet for your own pen.';
const allLessons = () => MODULES.flatMap(m => m.lessons.map(l => `${m.id}/${l.id}`));
export function courseStats(done = {}) { const all = allLessons(), n = all.filter(k => done[k]).length; return { n, total: all.length, pct: Math.round(100 * n / all.length), complete: n === all.length }; }
export function renderCourse(el, { store, name = '', onCert } = {}) {
  const st = store.get('course', { done: {} }), s = courseStats(st.done);
  el.innerHTML = `<div class="card coursehead"><h3>🎓 GLP-1 weight-loss course</h3><p class="small">${s.n} of ${s.total} lessons · ${s.pct}%</p><div class="cbar"><i style="width:${s.pct}%"></i></div>
    ${s.complete ? `<button type="button" class="primary" id="courseCert">🏅 Your course certificate</button>` : '<p class="small muted">Finish every lesson to earn your GLP1 Life course certificate.</p>'}</div>
    ${MODULES.map(m => { const d = m.lessons.filter(l => st.done[`${m.id}/${l.id}`]).length; return `<details class="card cmod"><summary><span class="cmi">${m.icon}</span><b>${esc(m.title)}</b><span class="cmc ${d === m.lessons.length ? 'ok' : ''}">${d === m.lessons.length ? '✓' : `${d}/${m.lessons.length}`}</span></summary>
      ${m.lessons.map(l => { const k = `${m.id}/${l.id}`; return `<button type="button" class="clesson" data-lesson="${k}"><span class="ctick ${st.done[k] ? 'on' : ''}">${st.done[k] ? '✓' : ''}</span>${esc(l.title)}</button>`; }).join('')}</details>`; }).join('')}
    <p class="small muted">${esc(SOURCES)}</p>`;
  el.querySelectorAll('[data-lesson]').forEach(b => b.onclick = () => openLesson(b.dataset.lesson, { store, el, name, onCert }));
  el.querySelector('#courseCert')?.addEventListener('click', () => onCert?.(st));
}
function openLesson(k, ctx) {
  const [mid, lid] = k.split('/'), m = MODULES.find(x => x.id === mid), l = m?.lessons.find(x => x.id === lid); if (!l) return;
  let o = document.getElementById('lessonModal'); if (!o) { o = document.createElement('div'); o.id = 'lessonModal'; o.className = 'overlay recipe'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); document.body.append(o); }
  const st = ctx.store.get('course', { done: {} });
  o.innerHTML = `<div class="rsheet lessonsheet"><button type="button" class="rclose" id="lessonClose" aria-label="Close">✕</button><p class="small muted">${m.icon} ${esc(m.title)}</p><h2>${esc(l.title)}</h2>
    ${l.body.map(p => `<p>${esc(p)}</p>`).join('')}<div class="card note"><b>Remember:</b> ${esc(ALWAYS)}</div>
    <button type="button" class="primary big" id="lessonDone">${st.done[k] ? '✓ Completed' : 'Mark as complete'}</button></div>`;
  o.hidden = false; document.body.classList.add('modal-open');
  const close = () => { o.hidden = true; o.innerHTML = ''; document.body.classList.remove('modal-open'); renderCourse(ctx.el, ctx); };
  o.querySelector('#lessonClose').onclick = close; o.onclick = e => { if (e.target === o) close(); };
  o.querySelector('#lessonDone').onclick = () => { const s = ctx.store.get('course', { done: {} }); s.done[k] = new Date().toISOString(); if (courseStats(s.done).complete && !s.completedAt) s.completedAt = new Date().toISOString(); ctx.store.set('course', s); close(); };
}
export function drawCourseCert(ctx, { name, date }, W = 1080, H = 1350) {
  ctx.fillStyle = '#2a1740'; ctx.fillRect(0, 0, W, H); ctx.strokeStyle = '#3ecf8e'; ctx.lineWidth = 6; ctx.strokeRect(50, 70, W - 100, H - 140); ctx.textAlign = 'center';
  ctx.fillStyle = '#fff'; ctx.font = '700 54px system-ui, sans-serif'; ctx.fillText('GLP1 Life', W / 2, 190);
  ctx.fillStyle = '#c9b6e4'; ctx.font = '600 34px system-ui, sans-serif'; ctx.fillText('CERTIFICATE OF COMPLETION', W / 2, 260);
  ctx.font = '400 38px system-ui, sans-serif'; ctx.fillText('This certifies that', W / 2, 480);
  ctx.fillStyle = '#fff'; ctx.font = '800 76px system-ui, sans-serif'; ctx.fillText(name || 'You', W / 2, 580, W - 160);
  ctx.fillStyle = '#c9b6e4'; ctx.font = '400 38px system-ui, sans-serif'; ctx.fillText('has completed the', W / 2, 670);
  ctx.fillStyle = '#3ecf8e'; ctx.font = '800 58px system-ui, sans-serif'; ctx.fillText('GLP-1 Weight-Loss Course', W / 2, 770, W - 140);
  ctx.fillStyle = '#fff'; ctx.font = '500 34px system-ui, sans-serif'; ctx.fillText(`${MODULES.length} modules · ${allLessons().length} lessons`, W / 2, 850);
  ctx.fillStyle = '#c9b6e4'; ctx.fillText(new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }), W / 2, 1120);
}
