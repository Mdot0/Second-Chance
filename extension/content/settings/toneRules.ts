export type ProfanityEntry = {
  word: string;
  severity: "medium" | "high";
};

export const PROFANITY: ProfanityEntry[] = [
  { word: "fuck", severity: "high" },
  { word: "fucking", severity: "high" },
  { word: "shit", severity: "high" },
  { word: "bullshit", severity: "high" },
  { word: "asshole", severity: "high" },
  { word: "bastard", severity: "high" },
  { word: "bitch", severity: "medium" },
  { word: "damn", severity: "medium" },
  { word: "dammit", severity: "medium" },
  { word: "crap", severity: "medium" },
  { word: "moron", severity: "medium" },
  { word: "idiot", severity: "medium" },
  { word: "jerk", severity: "medium" },
  { word: "screw you", severity: "high" },
  { word: "piss off", severity: "high" },
  { word: "nigger", severity: "high" },
  { word: "nigga", severity: "high" },
  { word: "retard", severity: "high" },
  { word: "chink", severity: "high" },
  { word: "clanker", severity: "high" },
];
