import { describe, expect, it } from 'vitest';
import {
  fromPersisted,
  initWorkbench,
  reducer,
  reviewKey,
  seedState,
  toPersisted,
  type Action,
  type WorkbenchState,
} from '../state/store';
import {
  createMemoryStorage,
  loadState,
  saveState,
  STORAGE_KEY,
} from '../lib/storage';

const KEY_001 = reviewKey('初审', 'A-001');

function run(state: WorkbenchState, ...actions: Action[]): WorkbenchState {
  return actions.reduce(reducer, state);
}

function markA001(): Action {
  return {
    type: 'markMaterial',
    applicationId: 'A-001',
    materialId: 'A001-M1',
    status: 'verified',
  };
}

describe('撤销 / 重做', () => {
  it('标记材料后可撤销、可重做', () => {
    let s = seedState();
    s = reducer(s, markA001());
    expect(s.doc.reviews[KEY_001].marks['A001-M1']).toBe('verified');

    s = reducer(s, { type: 'undo' });
    expect(s.doc.reviews[KEY_001]).toBeUndefined();

    s = reducer(s, { type: 'redo' });
    expect(s.doc.reviews[KEY_001].marks['A001-M1']).toBe('verified');
  });

  it('撤销后执行新操作会清空重做栈', () => {
    let s = seedState();
    s = reducer(s, markA001());
    s = reducer(s, { type: 'undo' });
    expect(s.future).toHaveLength(1);
    s = reducer(s, {
      type: 'markMaterial',
      applicationId: 'A-001',
      materialId: 'A001-M1',
      status: 'excluded',
    });
    expect(s.future).toHaveLength(0);
    expect(s.doc.reviews[KEY_001].marks['A001-M1']).toBe('excluded');
  });

  it('空历史上撤销/重做是安全的空操作', () => {
    const s = seedState();
    expect(reducer(s, { type: 'undo' })).toBe(s);
    expect(reducer(s, { type: 'redo' })).toBe(s);
  });

  it('切换轮次后各轮次的评审记录互相独立', () => {
    let s = seedState();
    s = reducer(s, markA001());
    s = reducer(s, { type: 'setRound', round: '复审' });
    expect(s.doc.reviews[reviewKey('复审', 'A-001')]).toBeUndefined();
    expect(s.doc.reviews[KEY_001].marks['A001-M1']).toBe('verified');
  });

  it('豁免证据可撤销', () => {
    let s = seedState();
    s = reducer(s, { type: 'toggleWaive', applicationId: 'A-001', ruleId: 'S3' });
    expect(s.doc.reviews[KEY_001].waivedRules).toContain('S3');
    s = reducer(s, { type: 'undo' });
    expect(s.doc.reviews[KEY_001]).toBeUndefined();
  });
});

describe('版本快照', () => {
  const snap = { id: 'snap-1', name: '评审到中点', createdAt: '2026-09-19T10:00:00.000Z' };

  it('恢复快照回到保存时的文档状态', () => {
    let s = seedState();
    s = reducer(s, markA001());
    s = reducer(s, { type: 'takeSnapshot', ...snap });
    // 快照之后再做修改
    s = reducer(s, {
      type: 'markMaterial',
      applicationId: 'A-001',
      materialId: 'A001-M2',
      status: 'excluded',
    });
    expect(s.doc.reviews[KEY_001].marks['A001-M2']).toBe('excluded');

    s = reducer(s, { type: 'restoreSnapshot', snapshotId: 'snap-1' });
    expect(s.doc.reviews[KEY_001].marks['A001-M1']).toBe('verified');
    expect(s.doc.reviews[KEY_001].marks['A001-M2']).toBeUndefined();
  });

  it('恢复快照本身也可撤销', () => {
    let s = seedState();
    s = reducer(s, markA001());
    s = reducer(s, { type: 'takeSnapshot', ...snap });
    s = reducer(s, {
      type: 'markMaterial',
      applicationId: 'A-001',
      materialId: 'A001-M2',
      status: 'excluded',
    });
    s = reducer(s, { type: 'restoreSnapshot', snapshotId: 'snap-1' });
    s = reducer(s, { type: 'undo' });
    expect(s.doc.reviews[KEY_001].marks['A001-M2']).toBe('excluded');
  });

  it('删除快照', () => {
    let s = seedState();
    s = reducer(s, { type: 'takeSnapshot', ...snap });
    expect(s.snapshots).toHaveLength(1);
    s = reducer(s, { type: 'deleteSnapshot', snapshotId: 'snap-1' });
    expect(s.snapshots).toHaveLength(0);
  });
});

describe('持久化与刷新恢复', () => {
  it('序列化 → 存储 → 恢复后文档一致', () => {
    const storage = createMemoryStorage();
    let s = seedState();
    s = run(
      s,
      markA001(),
      { type: 'toggleWaive', applicationId: 'A-001', ruleId: 'S3' },
      { type: 'setComment', applicationId: 'A-001', comment: '材料待补充' },
      { type: 'takeSnapshot', id: 'snap-1', name: '中途', createdAt: '2026-09-19T10:00:00.000Z' },
    );
    saveState(toPersisted(s), storage);

    const persisted = loadState(storage);
    expect(persisted).not.toBeNull();
    const restored = fromPersisted(persisted!);
    expect(restored.doc).toEqual(s.doc);
    expect(restored.past).toEqual(s.past);
    expect(restored.snapshots).toHaveLength(1);
  });

  it('模拟刷新：initWorkbench 从同一存储恢复全部评审记录', () => {
    const storage = createMemoryStorage();
    let s = seedState();
    s = run(s, markA001(), { type: 'setComment', applicationId: 'A-001', comment: '刷新前' });
    saveState(toPersisted(s), storage);

    const reloaded = initWorkbench(storage);
    expect(reloaded.doc.reviews[KEY_001].marks['A001-M1']).toBe('verified');
    expect(reloaded.doc.reviews[KEY_001].comment).toBe('刷新前');
    // 撤销历史也随存档恢复
    expect(reloaded.past.length).toBeGreaterThan(0);
  });

  it('存档损坏时回退到内置样例', () => {
    const storage = createMemoryStorage();
    storage.setItem(STORAGE_KEY, '{ 这不是合法 JSON');
    expect(loadState(storage)).toBeNull();
    const s = initWorkbench(storage);
    expect(s.doc.applications).toHaveLength(3);
    expect(s.doc.ruleSet.id).toBe('rs-2026-v1');
  });

  it('存档版本不符时回退到内置样例', () => {
    const storage = createMemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 999, doc: {} }));
    expect(loadState(storage)).toBeNull();
    expect(initWorkbench(storage).doc.applications).toHaveLength(3);
  });

  it('无存档时（首次打开）载入内置样例', () => {
    const s = initWorkbench(createMemoryStorage());
    expect(s.doc.applications.map((a) => a.id)).toEqual(['A-001', 'A-002', 'A-003']);
    expect(s.doc.activeRound).toBe('初审');
  });
});
