// Run: node app-script/code.test.js  (checks the pure helpers in code.gs without Google services)
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const ctx = {};
vm.runInNewContext(fs.readFileSync(__dirname + '/code.gs', 'utf8'), ctx);

const values = [
  ['date ', 'event_name ', 'type ', 'rank ', 'winner_name ', 'blade1 ', 'ratchet1 ', 'bit1 ', 'blade2', 'ratchet2', 'bit2', 'blade3', 'ratchet3', 'bit3', 'source_link ', 'note', 'approved'],
  ['2/10/2026', 'Shop "A"', 'shop winner', '1', 'Por', 'SharkScale', '1-60', 'NR', '', '', '', '', '', '', '', 'secret', 'TRUE'],
  ['3/10/2026', 'Spam', 'shop winner', '1', 'x', 'X', '1-60', 'F', '', '', '', '', '', '', '', '', 'FALSE'],
];
const csv = ctx.winnersCsv(values).split('\n');
assert.strictEqual(csv.length, 2, 'only approved rows');
assert.ok(csv[0].startsWith('"date","event_name"'), 'trimmed headers');
assert.ok(csv[1].includes('"Shop ""A"""'), 'quotes escaped');
assert.ok(!csv.join().includes('secret'), 'unlisted columns stay private');

const headers = ctx.trimmed(values[0]);
const row = ctx.winnerRow({ date: '2026-11-02', event_name: ' Zoulnenz ', type: 'G1 Official', rank: '99', winner_name: 'Nont',
  blade1: 'WizardRod', ratchet1: '1-60', bit1: 'H', source_link: 'javascript:alert(1)' }, headers);
const at = k => row[headers.indexOf(k)];
assert.strictEqual(at('date'), "'2/11/2026");
assert.strictEqual(at('event_name'), "'Zoulnenz");
assert.strictEqual(at('rank'), "'8", 'rank clamped');
assert.strictEqual(at('source_link'), '', 'only http links');
assert.strictEqual(at('approved'), false);
assert.strictEqual(at('note'), '');
assert.throws(() => ctx.winnerRow({ date: '2026-11-02', event_name: 'A', type: 'hacker', winner_name: 'B', blade1: 'C', bit1: 'D' }, headers));
assert.throws(() => ctx.winnerRow({ date: '2/11/2026', event_name: 'A', type: 'shop winner', winner_name: 'B', blade1: 'C', bit1: 'D' }, headers));
const profiles = [['winner_name', 'image'], ['Bank', 'https://x/d/1'], ['', ''], ['Nont  Ja', 'https://x/d/2']];
assert.strictEqual(ctx.profilesList(profiles).length, 2, 'blank rows skipped');
assert.strictEqual(ctx.profileRow(profiles, ' bank '), 2, 'case and spaces ignored');
assert.strictEqual(ctx.profileRow(profiles, 'nont ja'), 4);
assert.strictEqual(ctx.profileRow(profiles, 'Por'), 0);
console.log('ok');
const tl = [['id', 'owner', 'image', 'date'], ['100', 'Bank', 'https://x/d/a', '2026-11-01'], ['', '', '', ''], ['300', 'Nont', 'https://x/d/b', '2026-11-12'], ['200', 'NoPic', '', '2026-11-05']];
assert.deepStrictEqual(ctx.tierListsList(tl).map(r => r.owner), ['Nont', 'Bank'], 'newest first, rows without a picture skipped');
assert.strictEqual(ctx.tierListRow(tl, 300), 4);
assert.strictEqual(ctx.tierListRow(tl, '999'), 0);
const ordered = [['id', 'owner', 'image', 'date', 'order'], ['100', 'A', 'x', 'd', 2], ['200', 'B', 'x', 'd', 1], ['300', 'New', 'x', 'd', ''], ['400', 'Newer', 'x', 'd', '']];
assert.deepStrictEqual(ctx.tierListsList(ordered).map(r => r.owner), ['Newer', 'New', 'B', 'A'], 'unordered uploads first (newest first), then admin order');
assert.strictEqual(JSON.stringify(ctx.orderColumn(ordered, ['300', '100'])), JSON.stringify([[2], [1], [1], ['']]), 'listed ids get 1..n, others keep their value');
console.log('ok tierlists');
