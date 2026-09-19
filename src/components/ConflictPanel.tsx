import type { RuleConflict } from '../lib/rules';

const TYPE_LABELS: Record<RuleConflict['type'], string> = {
  'duplicate-id': '规则 id 重复',
  unsatisfiable: '规则永不满足',
  'eligibility-contradiction': '资格规则互斥',
  'unknown-field': '未知字段',
  'cap-exceeded': '超过分项封顶',
};

/** 右栏：当前规则集的静态冲突检测结果。 */
export function ConflictPanel({ conflicts }: { conflicts: RuleConflict[] }) {
  return (
    <div className="conflict-panel">
      <h2>规则体检（{conflicts.length}）</h2>
      {conflicts.length === 0 ? (
        <p className="ok-text">未发现规则冲突。</p>
      ) : (
        <ul className="conflict-list">
          {conflicts.map((c, i) => (
            <li key={`${c.type}-${i}`} className="conflict-item">
              <span className="badge bad">{TYPE_LABELS[c.type]}</span>
              <p>{c.message}</p>
              <p className="muted">涉及规则：{c.ruleIds.join('、')}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
