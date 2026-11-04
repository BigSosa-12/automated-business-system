// Pure display-state logic for the Engine page. Deterministic and side-effect free so it can be tested with fixtures.
import type { EngineState, EngineStatus } from './types';

export type Spin = 'idle' | 'fast' | 'slow' | 'stopped';
export interface EngineView { state: EngineState; spin: Spin; label: string; detail: string; ageMin: number | null; lastConfirmed: string | null; stopped: boolean; amber: boolean }

export function engineView(e: EngineStatus | null, now: number): EngineView {
  if (!e) return { state: 'UNKNOWN', spin: 'stopped', label: 'UNKNOWN', detail: 'No engine telemetry has been published.', ageMin: null, lastConfirmed: null, stopped: true, amber: false };
  const age = (now - new Date(e.generatedAt).getTime()) / 60000;
  const t = e.thresholds;
  const base = { ageMin: age, lastConfirmed: e.generatedAt };
  if (!Number.isFinite(age)) return { ...base, state: 'UNKNOWN', spin: 'stopped', label: 'UNKNOWN', detail: 'Telemetry timestamp is invalid.', stopped: true, amber: false, ageMin: null };
  if (age > t.snapshotStaleMin) return { ...base, state: 'STALE', spin: 'stopped', label: 'STALE', detail: 'Telemetry is older than its freshness threshold. The monitoring exporter may be offline.', stopped: true, amber: true };
  switch (e.state) {
    case 'BLOCKED': return { ...base, state: 'BLOCKED', spin: 'stopped', label: e.stoppedKind === 'FAILED' ? 'FAILED' : 'BLOCKED', detail: e.headline, stopped: true, amber: false };
    case 'UNKNOWN': return { ...base, state: 'UNKNOWN', spin: 'stopped', label: 'UNKNOWN', detail: e.headline, stopped: true, amber: false };
    case 'SLOW': return { ...base, state: 'SLOW', spin: 'slow', label: 'SLOW', detail: e.headline || 'Slowdown detected — cause unknown', stopped: false, amber: true };
    case 'PROCESSING':
      // "Processing" is only asserted while the observation is fresh. After that, live status is paused, never extrapolated.
      if (age > t.processingTtlMin) return { ...base, state: 'UNKNOWN', spin: 'stopped', label: 'LIVE VIEW PAUSED', detail: 'Last confirmed processing; live status is paused between snapshots.', stopped: true, amber: false };
      return { ...base, state: 'PROCESSING', spin: 'fast', label: 'PROCESSING', detail: e.headline, stopped: false, amber: false };
    default: return { ...base, state: 'IDLE', spin: 'idle', label: e.caution ? 'IDLE · ATTENTION' : 'HEALTHY · IDLE', detail: e.headline, stopped: false, amber: e.caution };
  }
}
