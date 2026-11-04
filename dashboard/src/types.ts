export type Health = 'HEALTHY' | 'DEGRADED' | 'BLOCKED' | 'UNKNOWN';
export type CheckState = 'OK' | 'WARN' | 'FAIL' | 'UNKNOWN';
export type WindowState = 'SCHEDULED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED' | 'BLOCKED' | 'MISSED' | 'UNKNOWN';
export type StageStatus = 'OK' | 'DEGRADED' | 'FAILED' | 'BLOCKED' | 'UNKNOWN' | 'STALE';

export interface Check { id: string; label: string; state: CheckState; detail: string; blocking: boolean }
export interface Campaign {
  id: string; label: string; short: string; territory: string | null; target: number | null;
  total: number; qualified: number; ready: number; readyEmail: number; readyForm: number; unresolved: number; suppressed: number;
  inventoryState: 'CRITICAL' | 'LOW' | 'HEALTHY' | 'SURPLUS' | null;
}
export interface FunnelStage { id: string; label: string; count: number | null; note: string }
export interface Leads {
  total: number | null; classified: number | null;
  byQualification: { QUALIFIED: number; READY: number; UNRESOLVED: number; SUPPRESSED: number } | null;
  readyByRoute: { EMAIL: number; FORM: number } | null;
  contactChannels: { channel: string; verification: string; n: number }[];
  potentialDuplicates: number | null; unassigned: number | null;
  routeQueue: { ready: number | null; blocked: number | null } | null;
  blockedReasons: { reason: string; n: number }[]; quarantined: number | null;
  byCampaign: Campaign[]; funnel: FunnelStage[];
}
export interface DispatchWindow {
  id: string; label: string; scheduledAt: string | null; startedAt: string | null; finishedAt: string | null;
  sent: number | null; errors: number | null; runId: string | null; evidence: string; state: WindowState;
}
export interface Outreach {
  dailyCap: number; sentToday: number | null; remainingToday: number | null; sentThisWeek: number; sentThisMonth: number; sent7d: number; sent30d: number;
  capacityNote: string; coverage: { status: string; note: string }; evidence: string; inboxDeliveryConfirmed: boolean;
  daily: { day: string; count: number }[]; byCampaign: { campaign: string; count: number }[]; byAccount: { account: string; count: number }[];
  failedAttempts: number | null; suppressedContacts: number | null; bounces: number | null; duplicatesPrevented: number | null;
  queued: { routeReady: number | null; preparedSnapshots: number | null; queueRows: number | null; agingHours: number | null };
  windows: DispatchWindow[];
  lastDispatch: { at: string | null; runId: string; sent: number | null; state: string; blockers: string[] } | null;
  nextDispatchAt: string | null;
  lastPreparation: { at: string | null; rows: number | null; state: string } | null;
}
export interface Replies {
  coverage: string; counts: Record<string, number | null>; converted: number | null;
  rates: { reply: number | null; positive: number | null; conversion: number | null; denominator: string };
  pendingUnreadable: number; needsAttention: { kind: string; note: string }[];
  revenue: { tracked: boolean }; conversions: { tracked: boolean };
}
export interface Schedule { name: string; mode: string | null; enabled: boolean; times: string[]; lastRun: string | null; lastResult: string | null; nextRun: string | null; taskStatus: string | null }
export interface Stage { id: string; label: string; lastRun: string | null; lastSuccess: string | null; durationSec: number | null; status: StageStatus; items: number | null; errors: number | null; note: string | null }
export interface Alert { id: string; severity: 'CRITICAL' | 'WARNING' | 'INFO'; title: string; detail: string; firstDetected: string; lastDetected: string; state: string }
export interface Snapshot {
  schemaVersion: 1; generatedAt: string; sourceAsOf: string | null; timezone: string;
  exporter: { version: string; mode: string; refreshMinutes: number; staleAfterMinutes: number };
  health: { status: Health; reasons: string[]; checks: Check[]; rule: string };
  leads: Leads; outreach: Outreach; replies: Replies; schedules: Schedule[];
  schedulerEvidence: { available: boolean; reason: string | null };
  locks: { production: string; protectedWindowNow: boolean };
  pipeline: Stage[];
  charts: {
    leadGrowth: { day: string; new: number; cumulative: number }[];
    emailActivity: { day: string; count: number }[];
    campaignPerformance: { id: string; label: string; sent: number; ready: number | null; replies: number | null; positive: number | null; converted: number | null }[];
    queueHealth: { id: string; label: string; ready: number; blocked: number | null }[];
    reliability: { day: string; completed: number; failed: number; blocked: number; unknown: number }[];
    conversionTrend: unknown[];
  };
  alerts: Alert[];
  history: { startsOn: string; days: { day: string; total: number | null; qualified: number | null; ready: number | null; sent: number; health: Health }[] };
  dataQuality: {
    availability: Record<string, { state: string; note: string }>;
    crossChecks: { id: string; ok: boolean; detail: string }[];
    sources: { name: string; present: boolean; asOf: string | null }[];
  };
}
