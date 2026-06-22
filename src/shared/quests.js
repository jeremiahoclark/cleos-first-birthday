export const QUEST_STAGES = [
  {
    stage: 1,
    name: "Warm-Up Quests",
    slots: [
      [
        {
          id: "cleo-coalition",
          title: "The Cleo Coalition",
          composition: "caption",
          prompt:
            "Take a photo with Cleo and one guest you didn't arrive with. Get everyone's first names.",
          requiredFields: ["Everyone's first names"]
        },
        {
          id: "tiny-welcoming-committee",
          title: "The First Week Friend",
          composition: "caption",
          prompt:
            "Find a person (who's not the parents) who met Cleo in her first week of life. Submit a photo with them.",
          requiredFields: ["Person's name", "Their memory from that first week"]
        }
      ],
      [
        {
          id: "parent-origin-story",
          title: "The Parent Origin Story",
          composition: "caption",
          prompt:
            "Find someone who knew one of Cleo's parents before Cleo was born. Submit a photo with that person and a one-sentence story.",
          requiredFields: ["Person's name", "One-sentence parent story"]
        },
        {
          id: "first-year-witness",
          title: "The First-Year Witness",
          composition: "caption",
          prompt:
            "Find someone who saw Cleo during one of her first three months. Submit a photo with them and one newborn-season memory.",
          requiredFields: ["Person's name", "Newborn-season memory"]
        }
      ],
      [
        {
          id: "new-friendship-proof",
          title: "The New Friend",
          composition: "side-by-side",
          prompt:
            "Meet someone at the party you didn't know before today. Submit a photo together.",
          requiredFields: ["Their name", "One thing you have in common"]
        },
        {
          id: "silly-hat-snapshot",
          title: "The Silly Hat Snapshot",
          composition: "caption",
          prompt:
            "Find someone wearing a silly hat who you did not arrive with. Ask their name and the hat story, then submit a photo together.",
          requiredFields: ["Hat wearer's first name", "The hat story"]
        }
      ]
    ]
  },
  {
    stage: 2,
    name: "Social-Mixing Quests",
    slots: [
      [
        {
          id: "family-bridge",
          title: "The Family Bridge",
          composition: "caption",
          prompt:
            "Submit a photo with at least one person from each side of Cleo's family or social world.",
          requiredFields: ["How each person is connected to Cleo"]
        },
        {
          id: "birthday-chorus",
          title: "The Birthday Cheer",
          composition: "plain",
          prompt:
            "Record a short video or selfie of you doing a birthday pose, cheer, or gesture for Cleo.",
          requiredFields: ["Your name"]
        }
      ],
      [
        {
          id: "farthest-traveler",
          title: "The Out-of-State Traveler",
          composition: "caption",
          prompt:
            "Find a guest who arrived from out of state. Ask where they came from and one thing they hope Cleo gets from this party.",
          requiredFields: ["Where they came from", "Their wish for Cleo"]
        },
        {
          id: "local-legend",
          title: "The Local Legend",
          composition: "caption",
          prompt:
            "Find a guest who lives nearby. Submit a photo with them and a local place Cleo should visit when she's older.",
          requiredFields: ["Their name", "A local place Cleo should visit when she is older"]
        }
      ],
      [
        {
          id: "three-generation-shot",
          title: "The Life Chapter",
          composition: "side-by-side",
          prompt:
            "Find a guest who's in a different life chapter than you right now — new parent, grandparent, student, between jobs, starting fresh, whatever fits. Submit a photo together.",
          requiredFields: ["Their name", "What life chapter they're in right now"]
        },
        {
          id: "timeline-lineup",
          title: "The Earlier Connection",
          composition: "caption",
          prompt:
            "Find a guest who met Cleo or her parents earlier than you did. Submit a photo with them.",
          requiredFields: ["Their name", "When they first met Cleo or her parents"]
        }
      ]
    ]
  },
  {
    stage: 3,
    name: "Hard Mode Quests",
    slots: [
      [
        {
          id: "time-capsule-toast",
          title: "The Time Capsule Toast",
          composition: "plain",
          mediaType: "video",
          prompt:
            "Record a 15-second video message for Cleo to watch years from now — just you, on camera.",
          requiredFields: ["Your name"]
        },
        {
          id: "mini-documentary",
          title: "The Mini Documentary",
          composition: "plain",
          mediaType: "video",
          prompt:
            "Record a 20-second video answering: What should Cleo know about this day? Just you, on camera.",
          requiredFields: ["Your name"]
        }
      ],
      [
        {
          id: "cleo-museum",
          title: "The Cleo Museum",
          composition: "collage",
          prompt:
            "Capture four photos at the party — one for each label below.",
          photoSlots: [
            "Cleo with a favorite object",
            "Party decor",
            "Food or cake nearby",
            "A guest making her smile"
          ],
          requiredFields: []
        },
        {
          id: "first-birthday-field-notes",
          title: "The First Birthday Field Notes",
          composition: "collage",
          prompt:
            "Capture a five-photo set from a baby's-eye view — one shot for each label below.",
          photoSlots: [
            "Something colorful",
            "Something loud",
            "Something sweet",
            "Someone laughing",
            "Cleo being celebrated"
          ],
          requiredFields: []
        }
      ],
      [
        {
          id: "circle-crossover",
          title: "The Circle Crossover",
          composition: "caption",
          prompt:
            "Find a guest whose relationship circle in Regina or Logan's world is different from yours. Submit a photo together.",
          requiredFields: ["Their name", "Their circle (Regina or Logan)"]
        },
        {
          id: "grand-assembly",
          title: "The Guest Spotter",
          composition: "plain",
          prompt:
            "Find one guest who fits any of these: met Cleo before today, met her today, is under 10, or is over 60. Submit a photo with them.",
          requiredFields: ["Their name", "Which category they fit"]
        }
      ]
    ]
  }
];

export const FINAL_QUEST = {
  id: "future-advice-council",
  title: "The Future Advice Council",
  composition: "caption",
  prompt:
    "Ask one guest for a piece of advice for future Cleo. Submit a photo with them and write their advice.",
  requiredFields: ["Their name", "Their advice for Cleo"]
};

export function getQuestPhotoSlots(quest) {
  return Array.isArray(quest?.photoSlots) && quest.photoSlots.length ? quest.photoSlots : null;
}

export function createSeededRandom(seed = "cleo") {
  let hash = 2166136261;
  for (const char of String(seed)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return () => {
    hash += 0x6d2b79f5;
    let value = hash;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateQuestBoard(seed) {
  const random = createSeededRandom(seed);
  const quests = [];
  let slot = 1;
  for (const stage of QUEST_STAGES) {
    for (const pair of stage.slots) {
      const choice = pair[Math.floor(random() * pair.length)];
      quests.push({ ...choice, slot, stage: stage.stage, stageName: stage.name });
      slot += 1;
    }
  }
  quests.push({ ...FINAL_QUEST, slot: 10, stage: 4, stageName: "Shared Final Quest" });
  return quests;
}

export function findQuestById(id) {
  if (!id) return null;
  if (FINAL_QUEST.id === id) return FINAL_QUEST;
  for (const stage of QUEST_STAGES) {
    for (const pair of stage.slots) {
      for (const quest of pair) {
        if (quest.id === id) return quest;
      }
    }
  }
  return null;
}

export function scoreSubmissions(submissions = []) {
  const completedSlots = new Set(
    submissions
      .filter((submission) => submission && submission.status !== "rejected")
      .map((submission) => Number(submission.questSlot))
      .filter((slot) => Number.isInteger(slot) && slot >= 1 && slot <= 10)
  );
  return completedSlots.size;
}
