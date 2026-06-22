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
            "Submit one photo with Cleo, one parent, and at least one person who had not met someone else in the photo before today.",
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
          title: "The New Friendship Proof",
          composition: "side-by-side",
          prompt:
            "Introduce two guests who did not know each other before the party. Submit a photo of them together.",
          requiredFields: ["Both names", "One thing they have in common"]
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
            "Submit a group photo with at least one person from each side of Cleo's family or social world.",
          requiredFields: ["How each person is connected to Cleo"]
        },
        {
          id: "circle-crossover",
          title: "The Circle Crossover",
          composition: "caption",
          prompt:
            "Submit a photo with four guests from four different relationship circles in Regina or Logan's worlds — such as family, friends, neighbors, coworkers, church, school, or parent groups.",
          requiredFields: ["Each guest's circle (Regina or Logan)"]
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
            "Find the guest who lives closest to the party. Submit a photo with them.",
          requiredFields: ["A local place Cleo should visit when she is older"]
        }
      ],
      [
        {
          id: "three-generation-shot",
          title: "The Three-Generation Shot",
          composition: "side-by-side",
          prompt:
            "Submit a photo that includes three generations. If three generations are not present, substitute the oldest and youngest guests in one photo.",
          requiredFields: ["Generation labels or approximate ages"]
        },
        {
          id: "timeline-lineup",
          title: "The Timeline Lineup",
          composition: "caption",
          prompt:
            "Gather four people who met Cleo or her parents at different life stages. Submit a photo ordered from earliest connection to newest connection.",
          requiredFields: ["Year or season each connection started"]
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
            "Record a 20-second video where three guests each answer: What should Cleo know about this day? No duplicate answers.",
          requiredFields: ["Speaker names"]
        }
      ],
      [
        {
          id: "cleo-museum",
          title: "The Cleo Museum",
          composition: "collage",
          prompt:
            "Submit a four-photo set: Cleo with a favorite object, party decor, food or cake nearby, and a guest making her smile.",
          requiredFields: ["What each photo shows"]
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
          id: "birthday-chorus",
          title: "The Birthday Chorus",
          composition: "plain",
          prompt:
            "Gather at least six guests for a photo or short video where everyone is doing the same birthday pose, cheer, or gesture.",
          requiredFields: ["Which guests you met at the party today"]
        },
        {
          id: "grand-assembly",
          title: "The Grand Assembly",
          composition: "plain",
          prompt:
            "Gather at least eight guests for one photo. Include someone who met Cleo before today, someone who met her today, someone younger than 10 if present, and someone older than 60 if present.",
          requiredFields: ["Who satisfies each category"]
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
    "Collect advice for future Cleo from five guests across different ages or life stages. Submit a group photo with at least three of them.",
  requiredFields: ["Five advice lines"]
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

export function scoreSubmissions(submissions = []) {
  const completedSlots = new Set(
    submissions
      .filter((submission) => submission && submission.status !== "rejected")
      .map((submission) => Number(submission.questSlot))
      .filter((slot) => Number.isInteger(slot) && slot >= 1 && slot <= 10)
  );
  return completedSlots.size;
}

