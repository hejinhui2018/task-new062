import type {
  Application,
  DocState,
  MarkStatus,
  ReviewState,
  RuleSet,
  Snapshot,
} from '../types';
import { defaultRuleSet, ROUNDS, sampleApplications } from '../lib/samples';
import {
  loadState,
  type PersistedState,
  type StorageLike,
  STORAGE_VERSION,
} from '../lib/storage';

export interface WorkbenchState {
  doc: DocState;
  past: DocState[];
  future: DocState[];
  snapshots: Snapshot[];
}

export const HISTORY_LIMIT = 100;

export type Action =
  | { type: 'importApplications'; applications: Application[] }
  | { type: 'importRuleSet'; ruleSet: RuleSet }
  | { type: 'loadSamples' }
  | { type: 'reset' }
  | { type: 'setRound'; round: string }
  | { type: 'select'; applicationId: string | null }
  | { type: 'markMaterial'; applicationId: string; materialId: string; status: MarkStatus }
  | { type: 'toggleWaive'; applicationId: string; ruleId: string }
  | { type: 'setComment'; applicationId: string; comment: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'takeSnapshot'; id: string; name: string; createdAt: string }
  | { type: 'restoreSnapshot'; snapshotId: string }
  | { type: 'deleteSnapshot'; snapshotId: string };

export function reviewKey(round: string, applicationId: string): string {
  return `${round}::${applicationId}`;
}

export function emptyReview(): ReviewState {
  return { marks: {}, waivedRules: [], comment: '' };
}

export function seedDoc(): DocState {
  return {
    applications: sampleApplications,
    ruleSet: defaultRuleSet,
    rounds: [...ROUNDS],
    activeRound: ROUNDS[0],
    selectedApplicationId: sampleApplications[0]?.id ?? null,
    reviews: {},
  };
}

export function seedState(): WorkbenchState {
  return { doc: seedDoc(), past: [], future: [], snapshots: [] };
}

/** 提交一次可撤销的修改：当前文档入历史栈，清空重做栈。 */
function commit(state: WorkbenchState, doc: DocState): WorkbenchState {
  const past = [...state.past, state.doc].slice(-HISTORY_LIMIT);
  return { ...state, doc, past, future: [] };
}

/** 不可撤销的导航类修改（切换轮次/选中、写评语）：直接替换文档。 */
function navigate(state: WorkbenchState, doc: DocState): WorkbenchState {
  return { ...state, doc };
}

function updateReview(
  doc: DocState,
  applicationId: string,
  updater: (review: ReviewState) => ReviewState,
): DocState {
  const key = reviewKey(doc.activeRound, applicationId);
  const current = doc.reviews[key] ?? emptyReview();
  return { ...doc, reviews: { ...doc.reviews, [key]: updater(current) } };
}

export function reducer(state: WorkbenchState, action: Action): WorkbenchState {
  switch (action.type) {
    case 'importApplications': {
      const first = action.applications[0]?.id ?? null;
      return commit(state, {
        ...state.doc,
        applications: action.applications,
        selectedApplicationId: first,
        reviews: {},
      });
    }
    case 'importRuleSet':
      return commit(state, { ...state.doc, ruleSet: action.ruleSet });
    case 'loadSamples':
      return commit(state, seedDoc());
    case 'reset':
      return seedState();
    case 'setRound':
      if (!state.doc.rounds.includes(action.round)) return state;
      return navigate(state, { ...state.doc, activeRound: action.round });
    case 'select':
      return navigate(state, { ...state.doc, selectedApplicationId: action.applicationId });
    case 'markMaterial':
      return commit(
        state,
        updateReview(state.doc, action.applicationId, (review) => {
          const marks = { ...review.marks };
          if (action.status === 'unmarked') delete marks[action.materialId];
          else marks[action.materialId] = action.status;
          return { ...review, marks };
        }),
      );
    case 'toggleWaive':
      return commit(
        state,
        updateReview(state.doc, action.applicationId, (review) => {
          const waived = review.waivedRules.includes(action.ruleId)
            ? review.waivedRules.filter((id) => id !== action.ruleId)
            : [...review.waivedRules, action.ruleId];
          return { ...review, waivedRules: waived };
        }),
      );
    case 'setComment':
      // 评语是高频输入，不进撤销历史（避免逐字符撤销），但仍会持久化
      return navigate(
        state,
        updateReview(state.doc, action.applicationId, (review) => ({
          ...review,
          comment: action.comment,
        })),
      );
    case 'undo': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        ...state,
        doc: previous,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future],
      };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return {
        ...state,
        doc: next,
        past: [...state.past, state.doc],
        future: rest,
      };
    }
    case 'takeSnapshot':
      return {
        ...state,
        snapshots: [
          ...state.snapshots,
          { id: action.id, name: action.name, createdAt: action.createdAt, doc: state.doc },
        ],
      };
    case 'restoreSnapshot': {
      const snapshot = state.snapshots.find((s) => s.id === action.snapshotId);
      if (!snapshot) return state;
      return commit(state, snapshot.doc);
    }
    case 'deleteSnapshot':
      return { ...state, snapshots: state.snapshots.filter((s) => s.id !== action.snapshotId) };
  }
}

/* ---------- 持久化与恢复 ---------- */

export function toPersisted(state: WorkbenchState): PersistedState {
  return {
    version: STORAGE_VERSION,
    doc: state.doc,
    past: state.past,
    future: state.future,
    snapshots: state.snapshots,
  };
}

export function fromPersisted(persisted: PersistedState): WorkbenchState {
  return {
    doc: persisted.doc,
    past: persisted.past,
    future: persisted.future,
    snapshots: persisted.snapshots,
  };
}

/** 启动时恢复：有存档则恢复（刷新恢复），否则载入内置样例。 */
export function initWorkbench(storage?: StorageLike | null): WorkbenchState {
  const persisted = loadState(storage);
  if (persisted) return fromPersisted(persisted);
  return seedState();
}
