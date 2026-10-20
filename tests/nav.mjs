// Navigate like a user: dock button if the section is in the dock, otherwise open the Reta orb and tap the tile.
export async function nav(p, tab) {
  await p.waitForTimeout(200); await p.evaluate(() => document.activeElement?.blur?.());
  if (await p.evaluate(() => { const d = document.getElementById('dock'); const h = d?.classList.contains('hide'); d?.classList.remove('hide'); return h; })) await p.waitForTimeout(350);
  if (await p.$(`#dock [data-tab=${tab}]`)) return p.click(`#dock [data-tab=${tab}]`, { timeout: 4000 }).catch(() => p.dispatchEvent(`#dock [data-tab=${tab}]`, 'click'));
  if (process.env.NAVDBG) console.log('NAVDBG', tab, await p.evaluate(() => { const o = document.getElementById('orbBtn').getBoundingClientRect(); let el = document.elementFromPoint(o.x + o.width / 2, o.y + o.height / 2); const ch = []; while (el && ch.length < 4) { ch.push(el.tagName + '#' + el.id + '.' + el.className); el = el.parentElement; } return ch.join(' < ') + ' ' + JSON.stringify(o) + ' vh' + innerHeight; }));
  if (await p.isHidden('#launcher')) { await p.click('#orbBtn', { timeout: 4000 }).catch(() => p.dispatchEvent('#orbBtn', 'click')); await p.waitForSelector('#launcher.open'); await p.waitForTimeout(320); }
  await p.click(`#launcher [data-tab=${tab}]:not([data-lscroll])`);
}
