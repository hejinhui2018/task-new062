import type { SessionState, Snapshot } from './types';

export const STORAGE_KEY = 'grantkit-workbench-v1';
export const PERSIST_VERSION = 1;

/** 与浏览器 localStorage 兼容的最小接口，测试中用内存实现替换 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PersistedState {
  session: SessionState;
  snapshots: Snapshot[];
  past: SessionState[];
  future: SessionState[];
  selectedApplicantId: string | null;
}

interface Envelope {
  version: number;
  payload: PersistedState;
}

export function serialize(state: PersistedState): string {
  const envelope: Envelope = { version: PERSIST_VERSION, payload: state };
  return JSON.stringify(envelope);
}

/**
 * 反序列化并校验持久化内容。
 * 任何结构问题都返回 null（调用方回退到内置示例），
 * 历史/快照中的坏条目单独丢弃而不是整体失败。
 */
export function deserialize(raw: string | null): PersistedState | null {
  if (!raw) return null;
  try {
    const env = JSON.parse(raw) as Envelope;
    if (!env || typeof env !== 'object' || env.version !== PERSIST_VERSION || !env.payload) return null;
    const p = env.payload;
    if (!isSession(p.session)) return null;
    return {
      session: p.session,
      snapshots: Array.isArray(p.snapshots) ? p.snapshots.filter(isSnapshot) : [],
      past: Array.isArray(p.past) ? p.past.filter(isSession) : [],
      future: Array.isArray(p.future) ? p.future.filter(isSession) : [],
      selectedApplicantId: typeof p.selectedApplicantId === 'string' ? p.selectedApplicantId : null,
    };
  } catch {
    return null;
  }
}

function isSession(v: unknown): v is SessionState {
  if (!v || typeof v !== 'object') return false;
  const s = v as SessionState;
  return (
    Array.isArray(s.applications) &&
    !!s.ruleset &&
    typeof s.ruleset === 'object' &&
    Array.isArray(s.ruleset.eligibility) &&
    Array.isArray(s.ruleset.scoring) &&
    Array.isArray(s.ruleset.caps) &&
    Array.isArray(s.ruleset.piiFields) &&
    Array.isArray(s.rounds) &&
    s.rounds.every((r) => r && typeof r.id === 'string' && typeof r.salt === 'string') &&
    typeof s.activeRoundId === 'string'
  );
}

function isSnapshot(v: unknown): v is Snapshot {
  if (!v || typeof v !== 'object') return false;
  const s = v as Snapshot;
  return typeof s.id === 'string' && typeof s.name === 'string' && isSession(s.state);
}
