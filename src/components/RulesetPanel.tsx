import type { Ruleset } from '../core/types';
import { detectConflicts } from '../core/rules';

export function RulesetPanel({ ruleset }: { ruleset: Ruleset }) {
  const conflicts = detectConflicts(ruleset);
  return (
    <details className="ruleset-panel">
      <summary>
        评审规则（{ruleset.eligibility.length + ruleset.scoring.length} 条）
        {conflicts.length > 0 && <span className="badge bad"> {conflicts.length} 处冲突</span>}
      </summary>
      <div className="ruleset-body">
        <div className="ruleset-group">
          <div className="ruleset-heading">资格条件</div>
          {ruleset.eligibility.map((r) => (
            <div key={r.id} className="ruleset-item">
              <span className="rule-id">{r.id}</span> {r.description}
              {r.requiredEvidence && <span className="rule-ev">需 {r.requiredEvidence}</span>}
            </div>
          ))}
        </div>
        <div className="ruleset-group">
          <div className="ruleset-heading">评分项</div>
          {ruleset.scoring.map((r) => (
            <div key={r.id} className="ruleset-item">
              <span className="rule-id">{r.id}</span> {r.description}
              <span className="rule-points">
                {r.category} +{r.points}
              </span>
            </div>
          ))}
        </div>
        <div className="ruleset-group">
          <div className="ruleset-heading">类别上限</div>
          {ruleset.caps.map((c) => (
            <div key={c.category} className="ruleset-item">
              {c.category} ≤ {c.max}
            </div>
          ))}
        </div>
        {conflicts.length > 0 && (
          <div className="ruleset-group">
            <div className="ruleset-heading">规则冲突</div>
            {conflicts.map((c, i) => (
              <div key={i} className={`conflict-item ${c.severity}`}>
                {c.severity === 'error' ? '错误' : '警告'}：{c.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
