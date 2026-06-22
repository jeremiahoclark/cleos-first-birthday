const QUEST_TOASTS = {
  "cleo-coalition": [
    "Coalition formed. Cleo's crew just got wider.",
    "New names in the archive — love that."
  ],
  "tiny-welcoming-committee": [
    "First-week lore captured. That's heirloom material.",
    "Baby Cleo history, locked in."
  ],
  "parent-origin-story": [
    "Before-Cleo era documented. The parents will melt.",
    "Origin story secured. Main-character energy."
  ],
  "first-year-witness": [
    "Newborn season memory saved. So good.",
    "Early-days witness logged. Treasure tier."
  ],
  "new-friendship-proof": [
    "New friend at the party — mission accomplished.",
    "Strangers no more. Cleo's world grows."
  ],
  "silly-hat-snapshot": [
    "Hat story acquired. Absolute party gold.",
    "Silly hat, serious memory. Chef's kiss."
  ],
  "family-bridge": [
    "You just bridged two worlds. Regina and Logan approve.",
    "Family bridge built. That's the whole point of today."
  ],
  "birthday-chorus": [
    "Birthday cheer delivered. Cleo felt that.",
    "Pose locked. Party energy: immaculate."
  ],
  "farthest-traveler": [
    "Out-of-state love captured. They came a long way for this.",
    "Traveler found. That wish for Cleo is going in the book."
  ],
  "local-legend": [
    "Local intel secured. Cleo's future field guide grows.",
    "Hometown tip logged. She'll need this someday."
  ],
  "three-generation-shot": [
    "Different life chapters, one photo. Beautiful.",
    "Life chapter swap complete. Real party magic."
  ],
  "timeline-lineup": [
    "Earlier connection found. The timeline thickens.",
    "You've got seniority on this quest now. Nice."
  ],
  "time-capsule-toast": [
    "Future Cleo just got a message. Try not to cry.",
    "Time capsule sealed. She'll watch this one day."
  ],
  "mini-documentary": [
    "Director's cut submitted. Oscar-worthy B-roll.",
    "Twenty seconds of truth for future Cleo."
  ],
  "cleo-museum": [
    "Four exhibits for the Cleo Museum. Curator behavior.",
    "Museum wing complete. Gallery-worthy set."
  ],
  "first-birthday-field-notes": [
    "Field notes from floor level. Anthropology gold.",
    "Baby's-eye view captured. Science fair ready."
  ],
  "circle-crossover": [
    "Circles crossed. Regina's world met Logan's — chaos achieved.",
    "Different circles, one photo. That's the crossover."
  ],
  "grand-assembly": [
    "Guest spotted and catalogued. Sharp eye.",
    "Category found. The party roster makes sense now."
  ],
  "future-advice-council": [
    "Advice for future Cleo — on camera. She'll need this.",
    "Final treasure. The council has spoken."
  ]
};

const DEFAULT_TOASTS = [
  "Quest captured. Cleo's archive just got better.",
  "That one is birthday-book material.",
  "Excellent proof. The parents are going to love this.",
  "Legend behavior.",
  "Memory secured. On to the next quest."
];

export function getQuestToast(questId, dramatic = false) {
  const pool = QUEST_TOASTS[questId] || DEFAULT_TOASTS;
  const message = pool[Math.floor(Math.random() * pool.length)];
  return { message, dramatic: dramatic || Math.random() > 0.35 };
}
