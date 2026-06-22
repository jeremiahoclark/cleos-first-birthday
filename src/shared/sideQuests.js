export const HOST_SIDE_QUESTS = [
  {
    id: "host-cake-moment",
    title: "Cake Moment",
    prompt: "Snap Cleo and the cake — frosting, giggles, or the big smash."
  },
  {
    id: "host-happy-birthday",
    title: "Happy Birthday Chorus",
    prompt: "Capture the room singing. Get the energy on camera."
  },
  {
    id: "host-candle-blow",
    title: "Candle Blow",
    prompt: "The blow, the assist, or the delighted aftermath."
  },
  {
    id: "host-dance-floor",
    title: "Dance Floor Pulse",
    prompt: "Whoever's moving — capture the party mid-groove."
  },
  {
    id: "host-grandparent-hug",
    title: "The Big Hug",
    prompt: "A grandparent, aunt, uncle, or favorite grown-up with Cleo."
  },
  {
    id: "host-decor-detail",
    title: "Decor Detail",
    prompt: "One gorgeous party detail the parents spent hours on."
  }
];

export function findHostSideQuest(id) {
  return HOST_SIDE_QUESTS.find((quest) => quest.id === id) || null;
}
