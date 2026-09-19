import type { DocState, Snapshot } from '../types';

/** 可注入的存储接口，测试中用内存实现替代 localStorage。 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_KEY = 'grantkit-workbench-v1';
export const STORAGE_VERSION = 1;

/** 持久化形态：文档 + 撤销/重做栈 + 快照，刷新后完整恢复。 */
export interface PersistedState {
  version: number;
  doc: DocState;
  past: DocState[];
  future: DocState[];
  snapshots: Snapshot[];
}

function defaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // 隐私模式等场景下访问 localStorage 会抛错
  }
  return null;
}

export function saveState(
  state: PersistedState,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false; // 配额满等情况：静默失败，不打断评审
  }
}

/** 校验持久化数据的基本形状，损坏或版本不符时返回 null（调用方回退到初始样例）。 */
export function loadState(
  storage: StorageLike | null = defaultStorage(),
): PersistedState | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedState;
    if (parsed?.version !== STORAGE_VERSION) return null;
    if (!parsed.doc || !Array.isArray(parsed.doc.applications)) return null;
    if (!parsed.doc.ruleSet || !Array.isArray(parsed.doc.ruleSet.eligibility)) return null;
    if (!Array.isArray(parsed.past) || !Array.isArray(parsed.future)) return null;
    if (!Array.isArray(parsed.snapshots)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearState(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // 忽略
  }
}

/** 测试与 SSR 场景使用的内存存储。 */
export function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}
