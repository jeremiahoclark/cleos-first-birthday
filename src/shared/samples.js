// Sample data for the design / testing phase. Borrowed image URLs (picsum.photos)
// give the masonry varied natural dimensions so the cobblestone layout can be
// tuned before any real submissions exist. The API returns these only when D1
// has no real rows for the event, so they vanish the moment guests start playing.

const SAMPLE_NAMES = [
  "Auntie Mia", "Uncle J", "Grandma Lou", "Cousin Dev", "Nia", "Theo",
  "Reggie", "Camille", "Pop-Pop", "Jess", "Mateo", "Priya"
];

const SAMPLE_PROMPTS = [
  { title: "The Cleo Coalition", prompt: "Photo with Cleo and a guest you didn't arrive with.", text: "Met Ava and Sam by the cake — instant friends." },
  { title: "The Silly Hat Snapshot", prompt: "Find a silly hat and the story behind it.", text: "Mario's sombrero: wore it to every family fiesta since '09." },
  { title: "The Time Capsule Toast", prompt: "A 15-second message for future Cleo.", text: "Stay wild, kid. The world is yours." },
  { title: "The Cleo Museum", prompt: "Four photos from the party.", text: "Cake, decor, bubbles, and one very happy baby." },
  { title: "The Future Advice Council", prompt: "Video advice for Cleo from you and a guest.", text: "Never lose your curiosity, little one." },
  { title: "The New Friend", prompt: "Meet someone new at the party.", text: "Ravi from down the block — we both love mangoes." },
  { title: "The Out-of-State Traveler", prompt: "Find a guest from out of state.", text: "Flew in from Portland just for this. Worth it." },
  { title: "The Birthday Cheer", prompt: "Record a birthday pose for Cleo.", text: "Arms up, biggest grin, full party energy." }
];

function picum(seed, w, h) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;
}

function dimsFor(index) {
  // Mix of portrait, square, and landscape so the masonry has rhythm.
  const set = [
    [600, 800], [600, 600], [600, 780], [600, 500],
    [600, 860], [600, 620], [600, 720], [600, 540],
    [600, 900], [600, 640], [600, 760], [600, 480]
  ];
  return set[index % set.length];
}

export function samplePartyPosts() {
  return SAMPLE_PROMPTS.map((p, i) => {
    const name = SAMPLE_NAMES[i % SAMPLE_NAMES.length];
    const [w, h] = dimsFor(i);
    const likeCount = (i * 7 + 3) % 11;
    const commentCount = (i * 3) % 4;
    return {
      id: `sample_${i}`,
      userId: null,
      userName: name,
      questId: null,
      questTitle: p.title,
      prompt: p.prompt,
      caption: p.text,
      requiredFields: {},
      imageUrl: picum(`cleo-${i}`, w, h),
      createdAt: new Date(Date.now() - i * 1000 * 60 * 37).toISOString(),
      likeCount,
      likedByMe: false,
      commentCount,
      comments: commentCount > 0
        ? [
            {
              id: `sample_c_${i}`,
              userName: SAMPLE_NAMES[(i + 5) % SAMPLE_NAMES.length],
              body: ["So sweet!", "This is gold.", "Cleo's gonna love this.", "Best one yet."][i % 4],
              createdAt: new Date(Date.now() - i * 1000 * 60 * 12).toISOString()
            }
          ]
        : [],
      sample: true
    };
  });
}

export function sampleLeaderboard() {
  const totals = [23, 27, 31, 34, 38, 42, 46, 51, 55, 58]; // active minutes
  const ranked = totals.map((m, i) => {
    const total = m * 60 + ((i * 7) % 60);
    const s1 = Math.round(total * 0.28);
    const s2 = Math.round(total * 0.22);
    const s3 = Math.round(total * 0.35);
    const s4 = total - s1 - s2 - s3;
    return {
      rank: i + 1,
      userId: null,
      gameName: SAMPLE_NAMES[i % SAMPLE_NAMES.length],
      realName: SAMPLE_NAMES[i % SAMPLE_NAMES.length],
      score: 10,
      finishedAll: true,
      totalActiveSeconds: total,
      stages: [s1, s2, s3, s4],
      submissions: [],
      sample: true
    };
  });
  const others = SAMPLE_NAMES.slice(2).map((name, i) => ({
    rank: null,
    userId: null,
    gameName: name,
    realName: name,
    score: 4 + ((i * 2) % 6),
    finishedAll: false,
    totalActiveSeconds: null,
    stages: [null, null, null, null],
    submissions: [],
    sample: true
  }));
  return { ranked, others, sample: true };
}
