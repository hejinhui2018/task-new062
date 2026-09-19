import type { ApplicantView } from '../App';
import { describeCondition, formatValue } from '../core/rules';
import type { ReviewMark } from '../core/types';
import type { WorkbenchStore } from '../state/store';

interface Props {
  store: WorkbenchStore;
  applicantId: string;
  roundName: string;
  view: ApplicantView;
  marks: ReviewMark[];
}

export function ReviewWorkspace({ store, applicantId, roundName, view, marks }: Props) {
  const { pkg, result } = view;
  const markMap = new Map(marks.map((m) => [m.evidenceId, m.mark]));
  const hasIssues =
    result.missingEvidence.length > 0 || result.duplicates.length > 0 || result.conflicts.length > 0;

  return (
    <div className="workspace">
      <section className="card summary-card">
        <div className="summary-head">
          <div>
            <div className="summary-alias">{pkg.alias}</div>
            <div className="summary-sub">
              {roundName} · 提交于 {pkg.submittedAt || '未知'} · 本轮匿名编号仅此轮有效 · 已脱敏 {pkg.redactions} 处
            </div>
          </div>
          <div className="summary-score">
            <span className={`badge big ${result.eligible ? 'ok' : 'bad'}`}>
              {result.eligible ? '符合资格' : '不符合资格'}
            </span>
            <span className="total-score">
              {result.total}
              <span className="total-max">/{result.maxTotal}</span>
            </span>
          </div>
        </div>
        <div className="category-chips">
          {result.categories.map((c) => (
            <span key={c.category} className={`chip ${c.capApplied ? 'capped' : ''}`}>
              {c.category} {c.capped}
              {c.cap !== null ? `/${c.cap}` : ''}
              {c.capApplied && <em>（原始 {c.raw}，已封顶）</em>}
            </span>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>资格核验</h2>
        <table className="trace-table">
          <thead>
            <tr>
              <th>规则</th>
              <th>判定</th>
              <th>依据</th>
            </tr>
          </thead>
          <tbody>
            {result.eligibility.map((e) => (
              <tr key={e.ruleId} className={e.passed ? '' : 'row-bad'}>
                <td>
                  <span className="rule-id">{e.ruleId}</span> {e.description}
                </td>
                <td>{e.passed ? <span className="mark ok">✓</span> : <span className="mark bad">✗</span>}</td>
                <td>
                  {describeCondition(e.trace)}
                  {e.trace.note && <span className="note">（{e.trace.note}）</span>}
                  {e.missingEvidence && (
                    <span className="note bad-text">；缺少证据材料「{e.requiredEvidence}」</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>评分明细</h2>
        <table className="trace-table">
          <thead>
            <tr>
              <th>评分项</th>
              <th>类别</th>
              <th>判定</th>
              <th>得分</th>
              <th>依据</th>
            </tr>
          </thead>
          <tbody>
            {result.scoring.map((s) => (
              <tr key={s.ruleId} className={s.blockedReason ? 'row-warn' : ''}>
                <td>
                  <span className="rule-id">{s.ruleId}</span> {s.description}
                </td>
                <td>{s.category}</td>
                <td>
                  {s.blockedReason ? (
                    <span className="badge warn">已拦截</span>
                  ) : s.triggered ? (
                    <span className="badge ok">触发</span>
                  ) : (
                    <span className="badge muted">未触发</span>
                  )}
                </td>
                <td className="points">
                  {s.pointsAwarded}
                  <span className="points-max">/{s.pointsPossible}</span>
                </td>
                <td>
                  {s.blockedReason ?? (
                    <>
                      {describeCondition(s.trace)}
                      {s.trace.note && <span className="note">（{s.trace.note}）</span>}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {hasIssues && (
        <section className="card issues-card">
          <h2>问题与风险</h2>
          {result.missingEvidence.length > 0 && (
            <div className="issue-block">
              <div className="issue-title">缺失证据</div>
              <div className="chip-row">
                {result.missingEvidence.map((t) => (
                  <span key={t} className="chip bad">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
          {result.duplicates.length > 0 && (
            <div className="issue-block">
              <div className="issue-title">重复材料（内容一致）</div>
              {result.duplicates.map((d) => (
                <div key={d.contentHash} className="issue-line">
                  {d.evidenceIds.join(' ↔ ')}（{d.types.join(' / ')}）
                </div>
              ))}
            </div>
          )}
          {result.conflicts.length > 0 && (
            <div className="issue-block">
              <div className="issue-title">规则冲突</div>
              {result.conflicts.map((c, i) => (
                <div key={i} className={`conflict-item ${c.severity}`}>
                  {c.severity === 'error' ? '错误' : '警告'}：{c.message}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="card">
        <h2>匿名材料（{pkg.evidence.length} 份）</h2>
        <div className="field-grid">
          {pkg.fields.map((f) => (
            <div key={f.key} className="field-item">
              <span className="field-label">{f.label}</span>
              <span className="field-value">{formatValue(f.value)}</span>
            </div>
          ))}
        </div>
        <div className="evidence-list">
          {pkg.evidence.map((e) => {
            const mark = markMap.get(e.id);
            return (
              <div key={e.id} className={`evidence-card ${mark === 'flagged' ? 'flagged' : ''}`}>
                <div className="evidence-head">
                  <span className="chip">{e.type}</span>
                  <span className="evidence-title">{e.title}</span>
                  <span className="evidence-hash">#{e.contentHash.slice(0, 8)}</span>
                  {mark && (
                    <span className={`badge ${mark === 'verified' ? 'ok' : 'warn'}`}>
                      {mark === 'verified' ? '已核实' : '存疑 · 不计入评分'}
                    </span>
                  )}
                </div>
                <p className="evidence-content">{e.content}</p>
                <div className="evidence-actions">
                  <button
                    className={`btn small ${mark === 'verified' ? 'primary' : ''}`}
                    onClick={() => store.setMark(applicantId, e.id, 'verified')}
                  >
                    标记有效
                  </button>
                  <button
                    className={`btn small ${mark === 'flagged' ? 'danger' : ''}`}
                    onClick={() => store.setMark(applicantId, e.id, 'flagged')}
                  >
                    标记存疑
                  </button>
                  {mark && (
                    <button className="btn small" onClick={() => store.clearMark(applicantId, e.id)}>
                      清除标记
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
