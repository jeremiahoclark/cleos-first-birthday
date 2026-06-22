export const HOST_SIDE_QUESTS = [
  {
    id: "host-cake-moment",
    title: "Cake Moment",
    prompt: "Snap Cleo and the cake — frosting, giggles, or the big smash."
  }
];

export function findHostSideQuest(id) {
  return HOST_SIDE_QUESTS.find((quest) => quest.id === id) || null;
}
