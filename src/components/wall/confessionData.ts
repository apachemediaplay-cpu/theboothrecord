import type { ConfessionEntry } from "./ConfessionCard";

export const SYSTEM_MESSAGES = [
  "NEW CONFESSION RECORDED",
  "ANOTHER TRUTH LOGGED",
  "CONFESSION ACCEPTED",
  "ENTRY ADDED TO THE WALL",
  "GUILT ARCHIVED",
  "TRUTH CAPTURED",
];

export const EXTRA_CONFESSIONS: Omit<ConfessionEntry, "id" | "confessorId" | "timestamp" | "insertedAt">[] = [
  {
    confession: "I read their journal.\nI never told them.",
    verdict: "Privacy violated.",
    verdictHidden: "You consumed someone's inner world without consent. Knowledge stolen is a wound that festers in silence.",
  },
  {
    confession: "I only called\nbecause I needed something.",
    verdict: "Transactional connection logged.",
    verdictHidden: "Every conversation became a negotiation. They felt it, even if they never said it.",
  },
  {
    confession: "I let them take the blame.\nIt was easier.",
    verdict: "Cowardice recorded.",
    verdictHidden: "The truth sat in your throat like a stone. You swallowed it and let someone else choke.",
  },
  {
    confession: "I said I was happy for them.\nI wasn't.",
    verdict: "False joy catalogued.",
    verdictHidden: "Their success illuminated your stagnation. The smile you wore was a mask stitched from resentment.",
  },
  {
    confession: "I kept the money.\nThey never asked for it back.",
    verdict: "Debt unresolved.",
    verdictHidden: "Silence is not forgiveness. The transaction haunts the space between you both.",
  },
  {
    confession: "I watched them struggle\nand said nothing.",
    verdict: "Inaction documented.",
    verdictHidden: "Your silence was a choice. The booth does not distinguish between harm done and harm permitted.",
  },
  {
    confession: "I lied on my résumé.\nI got the job.",
    verdict: "False credentials filed.",
    verdictHidden: "Every accomplishment since rests on a foundation of fabrication. The imposter knows.",
  },
  {
    confession: "I told them I'd changed.\nI haven't even started.",
    verdict: "False promise detected.",
    verdictHidden: "The version of you they believe in does not exist. You perform growth while standing still.",
  },
  {
    confession: "I pretended not to see them\nin the grocery store.",
    verdict: "Avoidance logged.",
    verdictHidden: "You chose invisibility over discomfort. The aisle became a corridor of cowardice.",
  },
  {
    confession: "I broke something valuable\nand blamed the dog.",
    verdict: "Deflection archived.",
    verdictHidden: "An innocent creature bore the weight of your carelessness. Guilt transferred is guilt doubled.",
  },
  {
    confession: "I screenshot their messages\nand showed everyone.",
    verdict: "Trust weaponized.",
    verdictHidden: "Intimacy was currency you spent freely. Every share was a small betrayal compounding.",
  },
  {
    confession: "I knew the answer\nbut let them fail.",
    verdict: "Withheld assistance noted.",
    verdictHidden: "Knowledge hoarded while another drowns is a quiet form of cruelty the booth cannot forgive.",
  },
];

export const BASE_CONFESSIONS: ConfessionEntry[] = [
  {
    id: 1,
    confessorId: "#1842",
    timestamp: "12 Mar 2026 — 11:48 PM",
    confession: "I told them I was busy…\nbut I just didn't want to see them.",
    verdict: "Avoidance catalogued.",
    verdictHidden: "The distance you maintain is a mirror you refuse to look into. Guilt festers in silence.",
  },
  {
    id: 2,
    confessorId: "#1839",
    timestamp: "11 Mar 2026 — 09:14 PM",
    confession: "I said it didn't matter.\nBut I still check their profile.",
    verdict: "Attachment remains.",
    verdictHidden: "You hold onto what you claim to have released. The algorithm of longing does not forget.",
  },
  {
    id: 3,
    confessorId: "#1831",
    timestamp: "10 Mar 2026 — 03:22 AM",
    confession: "I smiled when they failed.\nI hated myself for it.",
    verdict: "Envy acknowledged.",
    verdictHidden: "Schadenfreude is the confession within the confession. Your awareness is the only redemption offered.",
  },
  {
    id: 4,
    confessorId: "#1824",
    timestamp: "09 Mar 2026 — 07:55 PM",
    confession: "I took the credit.\nThey'll never know.",
    verdict: "Theft of recognition logged.",
    verdictHidden: "The weight of stolen praise compounds silently. Every compliment you receive echoes with debt.",
  },
  {
    id: 5,
    confessorId: "#1817",
    timestamp: "08 Mar 2026 — 11:01 PM",
    confession: "I told her I forgave her.\nI haven't.",
    verdict: "False absolution detected.",
    verdictHidden: "Forgiveness spoken without conviction is just another form of deception. The wound remains open.",
  },
  {
    id: 6,
    confessorId: "#1809",
    timestamp: "07 Mar 2026 — 02:33 AM",
    confession: "I deleted the messages\nbefore anyone could see.",
    verdict: "Evidence destroyed.",
    verdictHidden: "Digital erasure does not erase memory. The booth remembers what you choose to forget.",
  },
  {
    id: 7,
    confessorId: "#1802",
    timestamp: "06 Mar 2026 — 06:17 PM",
    confession: "I pretend to care about things\nthat mean nothing to me.",
    verdict: "Performed empathy noted.",
    verdictHidden: "The mask you wear fits so well you've forgotten it's there. Authenticity is the first casualty.",
  },
];
