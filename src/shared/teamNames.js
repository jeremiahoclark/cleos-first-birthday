const ADJECTIVES = [
  "Giggle",
  "Confetti",
  "Bubble",
  "Cupcake",
  "Tiny",
  "Sparkle",
  "Candle",
  "Rainbow",
  "Snack",
  "Birthday"
];

const NOUNS = [
  "Squad",
  "Crew",
  "Club",
  "Sprouts",
  "Champions",
  "Brigade",
  "Patrol",
  "Parade",
  "Council",
  "Collective"
];

export function generateTeamName(index = 0) {
  const adjective = ADJECTIVES[index % ADJECTIVES.length];
  const noun = NOUNS[Math.floor(index / ADJECTIVES.length) % NOUNS.length];
  return `${adjective} ${noun}`;
}

export function chooseBalancedTeam(teams = [], maxTeamSize = 7) {
  const available = teams
    .filter((team) => (team.memberCount ?? 0) < maxTeamSize)
    .sort((a, b) => (a.memberCount ?? 0) - (b.memberCount ?? 0));
  return available[0] ?? null;
}

