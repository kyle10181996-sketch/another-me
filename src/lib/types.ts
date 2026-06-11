export type MemoryType =
  | "fact"
  | "preference"
  | "value"
  | "pattern"
  | "fear"
  | "desire"
  | "relationship"
  | "goal"
  | "lesson"
  | "blind_spot";

export type Memory = {
  id: string;
  userId: string;
  type: MemoryType;
  title: string;
  content: string;
  evidenceIds: string[];
  confidence: number;
  importance: number;
  visibility: "normal" | "private" | "sensitive";
  status: "active" | "archived" | "deleted";
  createdAt: string;
  updatedAt: string;
};

export type DailyLog = {
  id: string;
  userId: string;
  date: string;
  rawText: string;
  extractedMemoryIds: string[];
  emotions: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type DecisionOption = {
  id: string;
  label: string;
  description: string;
};

export type DecisionRecord = {
  id: string;
  userId: string;
  title: string;
  context: string;
  options: DecisionOption[];
  userInitialPreference?: string;
  fears: string[];
  desires: string[];
  affectedAreas: string[];
  status: "open" | "decided" | "reviewed";
  createdAt: string;
  updatedAt: string;
};

export type PersonalityProfile = {
  userId: string;
  riskPreference: string;
  decisionStyle: string;
  motivationPattern: string;
  stressPattern: string;
  longTermValues: string[];
  recurringBlindSpots: string[];
  strengths: string[];
  lastGeneratedAt: string;
};

export type SimulationBranch = {
  optionLabel: string;
  oneYear: string;
  threeYears: string;
  tenYears: string;
  benefits: string[];
  risks: string[];
  regretProbability: "low" | "medium" | "high" | "unknown";
};

export type SimulationResult = {
  id: string;
  decisionId: string;
  coreConflict: string;
  likelyPastChoice: string;
  branches: SimulationBranch[];
  inertiaPatterns: string[];
  blindSpots: string[];
  futureEvaluation: string;
  evidence: string[];
  minimumAction: string;
  uncertaintyNote: string;
  createdAt: string;
};

export type AppState = {
  dailyLogs: DailyLog[];
  decisions: DecisionRecord[];
  memories: Memory[];
  simulations: SimulationResult[];
};

export type LocalSettings = {
  apiKey?: string;
  baseUrl: string;
  model: string;
  updatedAt?: string;
};

export type PublicSettings = {
  hasApiKey: boolean;
  maskedApiKey?: string;
  baseUrl: string;
  model: string;
  updatedAt?: string;
};
