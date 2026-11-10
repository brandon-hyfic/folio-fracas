// Silly end-of-match awards from per-fighter stats. Pure.
export function computeAwards(players) {
  // players: [{id,name,stats:{kos,dealt,pies,fell,steals}}]
  const out = [];
  const best = (key, min, title, line) => {
    const s = [...players].sort((a, b) => b.stats[key] - a.stats[key]);
    if (s[0] && s[0].stats[key] >= min && (!s[1] || s[1].stats[key] < s[0].stats[key])) out.push({ id: s[0].id, name: s[0].name, title, line: line(s[0]) });
  };
  best('pies', 1, 'Most Pies Eaten', (p) => `${p.stats.pies} pie${p.stats.pies > 1 ? 's' : ''} to the face`);
  best('fell', 1, 'Fell Off Alone', (p) => `${p.stats.fell} unassisted tumble${p.stats.fell > 1 ? 's' : ''}`);
  best('steals', 1, 'Stole Everything', (p) => `${p.stats.steals} item${p.stats.steals > 1 ? 's' : ''} nicked`);
  best('kos', 1, 'Top Brawler', (p) => `${p.stats.kos} KO${p.stats.kos > 1 ? 's' : ''}`);
  if (players.length > 1) {
    const pac = players.filter((p) => p.stats.dealt < 1);
    if (pac.length === 1) out.push({ id: pac[0].id, name: pac[0].name, title: 'Pacifist', line: 'Did no damage. Peaceful.' });
  }
  return out;
}
