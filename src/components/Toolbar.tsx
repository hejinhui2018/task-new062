import { useRef, useState, type ChangeEvent, type Dispatch } from 'react';
import type { Application, RuleSet } from '../types';
import { flawedRuleSet } from '../lib/samples';
import type { Action, WorkbenchState } from '../state/store';

interface Props {
  state: WorkbenchState;
  dispatch: Dispatch<Action>;
}

/** 宽松校验导入的 JSON 形状，返回错误消息或 null。 */
function validateImport(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return 'JSON 顶层必须是对象';
  const d = data as Record<string, unknown>;
  if (d.applications !== undefined && !Array.isArray(d.applications)) {
    return 'applications 必须是数组';
  }
  if (d.ruleSet !== undefined) {
    const rs = d.ruleSet as Partial<RuleSet>;
    if (!Array.isArray(rs?.eligibility) || !Array.isArray(rs?.scoring)) {
      return 'ruleSet 必须包含 eligibility 与 scoring 数组';
    }
  }
  if (d.applications === undefined && d.ruleSet === undefined) {
    return 'JSON 中未找到 applications 或 ruleSet';
  }
  return null;
}

export function Toolbar({ state, dispatch }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [snapshotName, setSnapshotName] = useState('');
  const [showSnapshots, setShowSnapshots] = useState(false);

  const onImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as {
        applications?: Application[];
        ruleSet?: RuleSet;
      };
      const error = validateImport(data);
      if (error) {
        setImportError(error);
        return;
      }
      setImportError(null);
      if (data.applications) dispatch({ type: 'importApplications', applications: data.applications });
      if (data.ruleSet) dispatch({ type: 'importRuleSet', ruleSet: data.ruleSet });
    } catch {
      setImportError('文件不是合法的 JSON');
    }
  };

  const onExport = () => {
    const payload = {
      applications: state.doc.applications,
      ruleSet: state.doc.ruleSet,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'grantkit-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const takeSnapshot = () => {
    const name = snapshotName.trim() || `快照 ${state.snapshots.length + 1}`;
    dispatch({
      type: 'takeSnapshot',
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
    });
    setSnapshotName('');
  };

  return (
    <div className="toolbar">
      <div className="round-switcher" role="tablist" aria-label="评审轮次">
        {state.doc.rounds.map((round) => (
          <button
            key={round}
            role="tab"
            aria-selected={state.doc.activeRound === round}
            className={state.doc.activeRound === round ? 'round active' : 'round'}
            onClick={() => dispatch({ type: 'setRound', round })}
          >
            {round}
          </button>
        ))}
      </div>

      <div className="toolbar-group">
        <button
          className="btn"
          disabled={state.past.length === 0}
          onClick={() => dispatch({ type: 'undo' })}
          title="撤销上一步操作"
        >
          ↩ 撤销
        </button>
        <button
          className="btn"
          disabled={state.future.length === 0}
          onClick={() => dispatch({ type: 'redo' })}
          title="重做"
        >
          ↪ 重做
        </button>
      </div>

      <div className="toolbar-group">
        <button className="btn" onClick={() => fileInput.current?.click()}>
          导入 JSON
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={onImportFile}
        />
        <button className="btn" onClick={onExport}>
          导出
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'loadSamples' })}>
          载入内置样例
        </button>
        <button
          className="btn"
          title="载入一份故意有冲突的规则，用于演示冲突检测"
          onClick={() => dispatch({ type: 'importRuleSet', ruleSet: flawedRuleSet })}
        >
          演示冲突规则
        </button>
      </div>

      <div className="toolbar-group snapshot-group">
        <button className="btn" onClick={() => setShowSnapshots((v) => !v)}>
          版本快照 ({state.snapshots.length})
        </button>
        {showSnapshots && (
          <div className="snapshot-popover">
            <div className="snapshot-new">
              <input
                value={snapshotName}
                placeholder="快照名称"
                onChange={(e) => setSnapshotName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && takeSnapshot()}
              />
              <button className="btn primary" onClick={takeSnapshot}>
                保存快照
              </button>
            </div>
            {state.snapshots.length === 0 && <p className="muted">还没有快照。</p>}
            <ul className="snapshot-list">
              {state.snapshots.map((s) => (
                <li key={s.id}>
                  <div className="snapshot-meta">
                    <strong>{s.name}</strong>
                    <span className="muted">{new Date(s.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="snapshot-actions">
                    <button
                      className="btn small"
                      onClick={() => dispatch({ type: 'restoreSnapshot', snapshotId: s.id })}
                    >
                      恢复
                    </button>
                    <button
                      className="btn small danger"
                      onClick={() => dispatch({ type: 'deleteSnapshot', snapshotId: s.id })}
                    >
                      删除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <button
        className="btn danger"
        title="清空全部数据并恢复内置样例"
        onClick={() => {
          if (window.confirm('确定要重置工作台吗？全部评审记录与快照都会被清空。')) {
            dispatch({ type: 'reset' });
          }
        }}
      >
        重置
      </button>

      {importError && <div className="import-error">导入失败：{importError}</div>}
    </div>
  );
}
