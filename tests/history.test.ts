import { describe, expect, it } from 'vitest';
import { STORAGE_KEY, type StorageLike } from '../src/core/persistence';
import { WorkbenchStore } from '../src/state/store';

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function firstApplicant(store: WorkbenchStore) {
  return store.getView().applications[0];
}

describe('撤销 / 重做', () => {
  it('标记证据后可撤销、重做', () => {
    const store = new WorkbenchStore(new MemoryStorage());
    const appId = firstApplicant(store).id;
    const evId = firstApplicant(store).evidence[0].id;

    store.setMark(appId, evId, 'flagged');
    let round = store.getView().rounds.find((r) => r.id === store.getView().activeRoundId)!;
    expect(round.marks[appId]).toHaveLength(1);
    expect(store.getView().canUndo).toBe(true);

    store.undo();
    round = store.getView().rounds.find((r) => r.id === store.getView().activeRoundId)!;
    expect(round.marks[appId] ?? []).toHaveLength(0);
    expect(store.getView().canRedo).toBe(true);

    store.redo();
    round = store.getView().rounds.find((r) => r.id === store.getView().activeRoundId)!;
    expect(round.marks[appId]).toHaveLength(1);
    expect(round.marks[appId][0].mark).toBe('flagged');
  });

  it('新操作会清空重做栈', () => {
    const store = new WorkbenchStore(new MemoryStorage());
    const appId = firstApplicant(store).id;
    const evId = firstApplicant(store).evidence[0].id;
    store.setMark(appId, evId, 'flagged');
    store.undo();
    store.setMark(appId, evId, 'verified');
    expect(store.getView().canRedo).toBe(false);
  });

  it('导入新材料可撤销，恢复为内置三份示例', () => {
    const store = new WorkbenchStore(new MemoryStorage());
    expect(store.getView().applications).toHaveLength(3);
    store.importApplications([]);
    expect(store.getView().applications).toHaveLength(0);
    store.undo();
    expect(store.getView().applications).toHaveLength(3);
  });
});

describe('版本快照', () => {
  it('保存快照后可恢复，恢复本身也可撤销', () => {
    const store = new WorkbenchStore(new MemoryStorage());
    const appId = firstApplicant(store).id;
    const evId = firstApplicant(store).evidence[0].id;

    store.setMark(appId, evId, 'flagged');
    store.saveSnapshot('标记后');
    store.clearMark(appId, evId);

    const marksOf = () => {
      const v = store.getView();
      return v.rounds.find((r) => r.id === v.activeRoundId)!.marks[appId] ?? [];
    };
    expect(marksOf()).toHaveLength(0);

    const snapId = store.getView().snapshots[0].id;
    store.restoreSnapshot(snapId);
    expect(marksOf()).toHaveLength(1);

    store.undo(); // 撤销「恢复快照」
    expect(marksOf()).toHaveLength(0);
  });

  it('删除快照后不可恢复', () => {
    const store = new WorkbenchStore(new MemoryStorage());
    store.saveSnapshot('v1');
    expect(store.getView().snapshots).toHaveLength(1);
    store.deleteSnapshot(store.getView().snapshots[0].id);
    expect(store.getView().snapshots).toHaveLength(0);
  });
});

describe('刷新恢复（本地持久化）', () => {
  it('新会话从同一存储完整恢复：标记、轮次、快照、撤销历史', () => {
    const storage = new MemoryStorage();
    const s1 = new WorkbenchStore(storage);
    const appId = firstApplicant(s1).id;
    const evId = firstApplicant(s1).evidence[0].id;

    s1.setMark(appId, evId, 'flagged');
    s1.switchRound('round-2');
    s1.setMark(appId, evId, 'verified'); // round-2 的标记
    s1.saveSnapshot('终审前');

    // 模拟刷新：同一 storage 构造新实例
    const s2 = new WorkbenchStore(storage);
    const v = s2.getView();
    expect(v.restoredFromStorage).toBe(true);
    expect(v.activeRoundId).toBe('round-2');
    expect(v.snapshots).toHaveLength(1);
    expect(v.snapshots[0].name).toBe('终审前');

    const round1 = v.rounds.find((r) => r.id === 'round-1')!;
    const round2 = v.rounds.find((r) => r.id === 'round-2')!;
    expect(round1.marks[appId][0].mark).toBe('flagged');
    expect(round2.marks[appId][0].mark).toBe('verified');

    // 撤销历史也被恢复：可以继续撤销 round-2 的标记
    expect(v.canUndo).toBe(true);
    s2.undo();
    const after = s2.getView().rounds.find((r) => r.id === 'round-2')!;
    expect(after.marks[appId] ?? []).toHaveLength(0);
  });

  it('选中的申请人也会被恢复', () => {
    const storage = new MemoryStorage();
    const s1 = new WorkbenchStore(storage);
    const third = s1.getView().applications[2];
    s1.selectApplicant(third.id);
    const s2 = new WorkbenchStore(storage);
    expect(s2.getView().selectedApplicantId).toBe(third.id);
  });

  it('存储内容损坏时回退到内置示例，不抛异常', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, '{broken json!!!');
    const store = new WorkbenchStore(storage);
    expect(store.getView().applications).toHaveLength(3);
    expect(store.getView().restoredFromStorage).toBe(false);
  });

  it('版本号不匹配时回退到内置示例', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 999, payload: {} }));
    const store = new WorkbenchStore(storage);
    expect(store.getView().applications).toHaveLength(3);
  });

  it('无存储环境（storage=null）也能正常工作', () => {
    const store = new WorkbenchStore(null);
    const appId = firstApplicant(store).id;
    const evId = firstApplicant(store).evidence[0].id;
    store.setMark(appId, evId, 'verified');
    store.undo();
    store.redo();
    const v = store.getView();
    const round = v.rounds.find((r) => r.id === v.activeRoundId)!;
    expect(round.marks[appId][0].mark).toBe('verified');
  });
});

describe('评审轮次', () => {
  it('各轮次的标记互相独立', () => {
    const store = new WorkbenchStore(new MemoryStorage());
    const appId = firstApplicant(store).id;
    const evId = firstApplicant(store).evidence[0].id;

    store.setMark(appId, evId, 'flagged'); // round-1
    store.switchRound('round-2');
    let v = store.getView();
    expect(v.rounds.find((r) => r.id === 'round-2')!.marks[appId] ?? []).toHaveLength(0);

    store.setMark(appId, evId, 'verified'); // round-2
    v = store.getView();
    expect(v.rounds.find((r) => r.id === 'round-1')!.marks[appId][0].mark).toBe('flagged');
    expect(v.rounds.find((r) => r.id === 'round-2')!.marks[appId][0].mark).toBe('verified');
  });

  it('新建轮次后自动切换，且可撤销', () => {
    const store = new WorkbenchStore(new MemoryStorage());
    expect(store.getView().rounds).toHaveLength(2);
    store.addRound();
    expect(store.getView().rounds).toHaveLength(3);
    expect(store.getView().activeRoundId).toBe(store.getView().rounds[2].id);
    store.undo();
    expect(store.getView().rounds).toHaveLength(2);
    expect(store.getView().activeRoundId).toBe('round-1');
  });
});
