import { deserialize, serialize, STORAGE_KEY, type PersistedState, type StorageLike } from '../core/persistence';
import { defaultRounds, sampleApplications, sampleRuleset } from '../core/samples';
import type {
  Application,
  EvidenceMark,
  ReviewMark,
  RoundState,
  Ruleset,
  SessionState,
  Snapshot,
} from '../core/types';

export interface WorkbenchView {
  applications: Application[];
  ruleset: Ruleset;
  rounds: RoundState[];
  activeRoundId: string;
  selectedApplicantId: string | null;
  snapshots: Snapshot[];
  canUndo: boolean;
  canRedo: boolean;
  restoredFromStorage: boolean;
}

const HISTORY_LIMIT = 100;
const PERSISTED_HISTORY = 50;

function clone<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T);
}

function browserStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    /* 隐私模式等场景下访问 localStorage 可能抛错 */
  }
  return null;
}

function freshSession(): SessionState {
  return {
    applications: sampleApplications(),
    ruleset: sampleRuleset(),
    rounds: defaultRounds(),
    activeRoundId: 'round-1',
  };
}

/**
 * 工作台状态容器（框架无关，可单测）。
 * - 可撤销操作：标记证据、导入材料/规则、载入示例、新建轮次、恢复快照
 * - 不可撤销操作：切换轮次、选择申请人、保存/删除快照
 * - 每次变更即写入 localStorage，刷新后完整恢复（含撤销历史）
 */
export class WorkbenchStore {
  private session: SessionState;
  private selectedApplicantId: string | null;
  private snapshots: Snapshot[] = [];
  private past: SessionState[] = [];
  private future: SessionState[] = [];
  private listeners = new Set<() => void>();
  private cachedView: WorkbenchView | null = null;
  private readonly storage: StorageLike | null;
  private readonly restored: boolean;

  constructor(storage?: StorageLike | null) {
    this.storage = storage === undefined ? browserStorage() : storage;
    const persisted = this.storage ? deserialize(this.storage.getItem(STORAGE_KEY)) : null;
    if (persisted) {
      this.session = persisted.session;
      this.snapshots = persisted.snapshots;
      this.past = persisted.past;
      this.future = persisted.future;
      this.selectedApplicantId = persisted.selectedApplicantId;
      this.restored = true;
    } else {
      this.session = freshSession();
      this.selectedApplicantId = this.session.applications[0]?.id ?? null;
      this.restored = false;
    }
    this.ensureSelection();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getView = (): WorkbenchView => {
    if (!this.cachedView) {
      this.cachedView = {
        applications: this.session.applications,
        ruleset: this.session.ruleset,
        rounds: this.session.rounds,
        activeRoundId: this.session.activeRoundId,
        selectedApplicantId: this.selectedApplicantId,
        snapshots: this.snapshots,
        canUndo: this.past.length > 0,
        canRedo: this.future.length > 0,
        restoredFromStorage: this.restored,
      };
    }
    return this.cachedView;
  };

  // ---------- 内部 ----------

  private emit(): void {
    this.cachedView = null;
    this.persist();
    for (const l of this.listeners) l();
  }

  private persist(): void {
    if (!this.storage) return;
    try {
      const payload: PersistedState = {
        session: this.session,
        snapshots: this.snapshots,
        past: this.past.slice(-PERSISTED_HISTORY),
        future: this.future.slice(-PERSISTED_HISTORY),
        selectedApplicantId: this.selectedApplicantId,
      };
      this.storage.setItem(STORAGE_KEY, serialize(payload));
    } catch {
      /* 存储不可用（配额/隐私模式）时静默失败，不影响评审操作 */
    }
  }

  private ensureSelection(): void {
    if (
      this.selectedApplicantId &&
      !this.session.applications.some((a) => a.id === this.selectedApplicantId)
    ) {
      this.selectedApplicantId = this.session.applications[0]?.id ?? null;
    }
    if (!this.session.rounds.some((r) => r.id === this.session.activeRoundId)) {
      this.session = { ...this.session, activeRoundId: this.session.rounds[0]?.id ?? '' };
    }
  }

  private commit(next: SessionState): void {
    this.past.push(clone(this.session));
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
    this.session = next;
    this.ensureSelection();
    this.emit();
  }

  // ---------- 可撤销操作 ----------

  setMark(applicantId: string, evidenceId: string, mark: EvidenceMark): void {
    const rounds = this.session.rounds.map((round) => {
      if (round.id !== this.session.activeRoundId) return round;
      const list = [...(round.marks[applicantId] ?? [])];
      const idx = list.findIndex((m) => m.evidenceId === evidenceId);
      const entry: ReviewMark = { evidenceId, mark };
      if (idx >= 0) list[idx] = entry;
      else list.push(entry);
      return { ...round, marks: { ...round.marks, [applicantId]: list } };
    });
    this.commit({ ...this.session, rounds });
  }

  clearMark(applicantId: string, evidenceId: string): void {
    const rounds = this.session.rounds.map((round) => {
      if (round.id !== this.session.activeRoundId) return round;
      const list = (round.marks[applicantId] ?? []).filter((m) => m.evidenceId !== evidenceId);
      return { ...round, marks: { ...round.marks, [applicantId]: list } };
    });
    this.commit({ ...this.session, rounds });
  }

  importApplications(applications: Application[]): void {
    this.commit({ ...this.session, applications });
  }

  importRuleset(ruleset: Ruleset): void {
    this.commit({ ...this.session, ruleset });
  }

  loadSamples(): void {
    this.commit(freshSession());
  }

  addRound(): void {
    const n = this.session.rounds.length + 1;
    const stamp = Date.now().toString(36);
    const round: RoundState = {
      id: `round-${stamp}`,
      name: `第${n}轮`,
      salt: `grantkit-round-${stamp}`,
      marks: {},
    };
    this.commit({ ...this.session, rounds: [...this.session.rounds, round], activeRoundId: round.id });
  }

  restoreSnapshot(id: string): void {
    const snap = this.snapshots.find((s) => s.id === id);
    if (snap) this.commit(clone(snap.state));
  }

  undo(): void {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(clone(this.session));
    this.session = prev;
    this.ensureSelection();
    this.emit();
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(clone(this.session));
    this.session = next;
    this.ensureSelection();
    this.emit();
  }

  // ---------- 不可撤销的导航/管理操作 ----------

  switchRound(id: string): void {
    if (id === this.session.activeRoundId) return;
    if (!this.session.rounds.some((r) => r.id === id)) return;
    this.session = { ...this.session, activeRoundId: id };
    this.emit();
  }

  selectApplicant(id: string | null): void {
    if (id === this.selectedApplicantId) return;
    this.selectedApplicantId = id;
    this.emit();
  }

  saveSnapshot(name: string): void {
    const snap: Snapshot = {
      id: `snap-${Date.now().toString(36)}-${this.snapshots.length}`,
      name: name.trim() || `快照 ${this.snapshots.length + 1}`,
      createdAt: new Date().toISOString(),
      state: clone(this.session),
    };
    this.snapshots = [...this.snapshots, snap];
    this.emit();
  }

  deleteSnapshot(id: string): void {
    this.snapshots = this.snapshots.filter((s) => s.id !== id);
    this.emit();
  }

  resetAll(): void {
    this.session = freshSession();
    this.snapshots = [];
    this.past = [];
    this.future = [];
    this.selectedApplicantId = this.session.applications[0]?.id ?? null;
    this.emit();
  }
}
