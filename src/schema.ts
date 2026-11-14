export type Warning = 'same-name' | 'unnamed';
export type TargetInfo = {
  ref: string | null;
  role: string | null;
  name: string | null;
  matchCount: number | null;
};
export type ClickPoint = { x: number; y: number; width: number; height: number };
export type Step = {
  index: number;
  toolName: string;
  arguments: Record<string, unknown>;
  resultText: string;
  agentView: string;
  error: string | null;
  failureReason: string | null;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  screenshot: string | null;
  target: TargetInfo | null;
  clickPoint: ClickPoint | null;
  warnings: Warning[];
  agent: string | null;
  task: string | null;
  firstUrl: string | null;
  trackingHits: [];
};
