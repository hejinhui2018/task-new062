import type { Dispatch } from 'react';
import type { Application, MarkStatus, ReviewState } from '../types';
import type { AnonymizedPackage } from '../lib/anonymize';
import type { DuplicateGroup } from '../lib/duplicates';
import type { Action } from '../state/store';

interface Props {
  application: Application;
  anonymized: AnonymizedPackage;
  duplicates: DuplicateGroup[];
  review: ReviewState;
  dispatch: Dispatch<Action>;
}

const MARK_OPTIONS: { value: MarkStatus; label: string }[] = [
  { value: 'unmarked', label: '未标记' },
  { value: 'verified', label: '认可' },
  { value: 'questioned', label: '存疑' },
  { value: 'excluded', label: '排除' },
];

/** 中间栏：匿名评审包——脱敏字段表 + 脱敏材料正文 + 证据标记。 */
export function ReviewPackageView({
  application,
  anonymized,
  duplicates,
  review,
  dispatch,
}: Props) {
  const duplicateIds = new Set(duplicates.flatMap((g) => g.materialIds));

  return (
    <div className="review-package">
      <div className="panel-header">
        <h2>匿名评审包 · {anonymized.applicantRef}</h2>
        <span className="muted" title="评审包内容指纹，与字段顺序无关">
          指纹 {anonymized.digest}
        </span>
      </div>
      <p className="muted">
        已匿名化字段 {anonymized.piiFieldCount} 个，材料正文中替换 PII {anonymized.replacements} 处。
      </p>

      <h3>字段（已脱敏）</h3>
      <table className="field-table">
        <thead>
          <tr>
            <th>字段</th>
            <th>名称</th>
            <th>值</th>
          </tr>
        </thead>
        <tbody>
          {anonymized.fields.map((f) => (
            <tr key={f.key} className={f.pii ? 'pii-row' : undefined}>
              <td>
                <code>{f.key}</code>
              </td>
              <td>{f.label}</td>
              <td>{String(f.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>材料（{anonymized.materials.length}）</h3>
      {duplicates.length > 0 && (
        <div className="alert warn">
          检测到 {duplicates.length} 组重复材料：
          {duplicates.map((g) => g.titles.join(' ↔ ')).join('；')}
        </div>
      )}
      <div className="material-list">
        {anonymized.materials.map((m) => {
          const status: MarkStatus = review.marks[m.id] ?? 'unmarked';
          const isDuplicate = duplicateIds.has(m.id);
          return (
            <div key={m.id} className={`material-card mark-${status}`}>
              <div className="material-head">
                <span className="material-kind">{m.kind}</span>
                <strong>{m.title}</strong>
                {isDuplicate && <span className="badge warn">重复</span>}
                <span className="spacer" />
                <label className="mark-select">
                  证据标记：
                  <select
                    value={status}
                    onChange={(e) =>
                      dispatch({
                        type: 'markMaterial',
                        applicationId: application.id,
                        materialId: m.id,
                        status: e.target.value as MarkStatus,
                      })
                    }
                  >
                    {MARK_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="material-content">{m.content}</p>
              {status === 'excluded' && (
                <p className="muted">此材料已被排除，不参与证据核验与评分。</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
