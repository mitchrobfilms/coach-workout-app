// Navigate like a user: dock button if the section is in the dock, otherwise open the Reta orb and tap the tile.
export async function nav(p, tab) {
  if (await p.evaluate(() => { const d = document.getElementById('dock'); const h = d?.classList.contains('hide'); d?.classList.remove('hide'); return h; })) await p.waitForTimeout(350);
  if (await p.$(`#dock [data-tab=${tab}]`)) return p.click(`#dock [data-tab=${tab}]`);
  if (await p.isHidden('#launcher')) { await p.click('#orbBtn'); await p.waitForSelector('#launcher.open'); await p.waitForTimeout(320); }
  await p.click(`#launcher [data-tab=${tab}]:not([data-lscroll])`);
}
