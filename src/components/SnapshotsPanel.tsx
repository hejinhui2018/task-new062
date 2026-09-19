import { useState } from 'react';
import type { WorkbenchStore, WorkbenchView } from '../state/store';

interface Props {
  store: WorkbenchStore;
  view: WorkbenchView;
  onClose: () => void;
}

export function SnapshotsPanel({ store, view, onClose }: Props) {
  const [name, setName] = useState('');

  return (
    <div className="snapshots-panel">
      <div className="snapshots-head">
        <span>版本快照</span>
        <button className="btn small" onClick={onClose}>
          关闭
        </button>
      </div>
      <div className="snapshots-new">
        <input
          value={name}
          placeholder="快照名称（可选）"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              store.saveSnapshot(name);
              setName('');
            }
          }}
        />
        <button
          className="btn small primary"
          onClick={() => {
            store.saveSnapshot(name);
            setName('');
          }}
        >
          保存
        </button>
      </div>
      {view.snapshots.length === 0 && <div className="snapshots-empty">暂无快照。保存后可随时恢复到该版本。</div>}
      <ul className="snapshots-list">
        {[...view.snapshots].reverse().map((s) => (
          <li key={s.id}>
            <div className="snapshot-info">
              <span className="snapshot-name">{s.name}</span>
              <span className="snapshot-time">{new Date(s.createdAt).toLocaleString()}</span>
            </div>
            <div className="snapshot-actions">
              <button className="btn small" onClick={() => store.restoreSnapshot(s.id)}>
                恢复
              </button>
              <button className="btn small danger" onClick={() => store.deleteSnapshot(s.id)}>
                删除
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
