import { useState } from 'react';
import type { ApplicantView } from '../App';
import type { WorkbenchStore, WorkbenchView } from '../state/store';
import { SnapshotsPanel } from './SnapshotsPanel';

interface Props {
  store: WorkbenchStore;
  view: WorkbenchView;
  applicants: Map<string, ApplicantView>;
  onOpenImport: () => void;
}

function download(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 导出当前轮次的匿名评审包（剔除内部 sourceId，评估结果一并附上） */
function exportReviewPackage(view: WorkbenchView, applicants: Map<string, ApplicantView>): void {
  const round = view.rounds.find((r) => r.id === view.activeRoundId);
  const data = {
    工具: 'GrantKit 盲审材料工作台',
    轮次: round?.name ?? '',
    导出时间: new Date().toISOString(),
    规则包: { id: view.ruleset.id, 名称: view.ruleset.name, 版本: view.ruleset.version },
    评审包: view.applications.map((app) => {
      const av = applicants.get(app.id);
      if (!av) return null;
      return {
        匿名编号: av.pkg.alias,
        提交时间: av.pkg.submittedAt,
        字段: Object.fromEntries(av.pkg.fields.map((f) => [f.label, f.value])),
        证据材料: av.pkg.evidence.map((e) => ({
          编号: e.id,
          类型: e.type,
          标题: e.title,
          内容: e.content,
        })),
        评审标记: round?.marks[app.id] ?? [],
        评估结果: av.result,
      };
    }),
  };
  download(`grantkit-review-${round?.name ?? 'export'}.json`, JSON.stringify(data, null, 2));
}

export function HeaderBar({ store, view, applicants, onOpenImport }: Props) {
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);

  return (
    <header className="header">
      <div className="header-row">
        <div className="brand">
          <span className="brand-name">GrantKit</span>
          <span className="brand-sub">盲审材料工作台</span>
        </div>

        <nav className="round-tabs" aria-label="评审轮次">
          {view.rounds.map((r) => (
            <button
              key={r.id}
              className={`round-tab ${r.id === view.activeRoundId ? 'active' : ''}`}
              onClick={() => store.switchRound(r.id)}
            >
              {r.name}
            </button>
          ))}
          <button className="round-tab add" title="新建评审轮次" onClick={() => store.addRound()}>
            ＋
          </button>
        </nav>

        <div className="header-actions">
          <button className="btn" disabled={!view.canUndo} title="撤销 (Ctrl+Z)" onClick={() => store.undo()}>
            ↩ 撤销
          </button>
          <button
            className="btn"
            disabled={!view.canRedo}
            title="重做 (Ctrl+Shift+Z)"
            onClick={() => store.redo()}
          >
            ↪ 重做
          </button>
          <div className="snapshot-wrap">
            <button className="btn" onClick={() => setSnapshotsOpen((v) => !v)}>
              快照{view.snapshots.length > 0 ? `（${view.snapshots.length}）` : ''}
            </button>
            {snapshotsOpen && <SnapshotsPanel store={store} view={view} onClose={() => setSnapshotsOpen(false)} />}
          </div>
          <button className="btn" onClick={onOpenImport}>
            导入
          </button>
          <button className="btn" onClick={() => exportReviewPackage(view, applicants)}>
            导出评审包
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (window.confirm('重置将清除全部导入数据、标记与快照，恢复内置示例。确定继续？')) {
                store.resetAll();
              }
            }}
          >
            重置
          </button>
        </div>
      </div>
      <div className="header-status">
        <span>规则包：{view.ruleset.name}（v{view.ruleset.version}）</span>
        <span>{view.restoredFromStorage ? '已从本地恢复上次会话' : '已开启本地自动保存'}</span>
      </div>
    </header>
  );
}
