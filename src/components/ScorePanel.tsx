import type { Dispatch } from 'react';
import type { ScoreReport } from '../lib/scoring';
import type { Trace } from '../lib/conditions';
import type { ReviewState } from '../types';
import type { Action } from '../state/store';

interface Props {
  report: ScoreReport;
  review: ReviewState;
  applicationId: string;
  dispatch: Dispatch<Action>;
}

/** 递归渲染求值轨迹，让每一分都有据可查。 */
function TraceView({ trace }: { trace: Trace }) {
  return (
    <ul className="trace">
      <li className={trace.passed ? 'trace-pass' : 'trace-fail'}>
        {trace.passed ? '✓' : '✗'} {trace.summary}
        {trace.children.length > 0 &&
          trace.children.map((child, i) => <TraceView key={i} trace={child} />)}
      </li>
    </ul>
  );
}

/** 右下栏：资格结论 + 分项得分 + 触发解释 + 缺失证据。 */
export function ScorePanel({ report, review, applicationId, dispatch }: Props) {
  return (
    <div className="score-panel">
      <div className="panel-header">
        <h2>评分结果</h2>
        <span className={report.eligible ? 'badge ok large' : 'badge bad large'}>
          {report.eligible ? '资格通过' : '资格未通过'}
        </span>
        <span className="total-score">
          总分 {report.total} / {report.maxTotal}
        </span>
      </div>

      <h3>资格审核</h3>
      <ul className="rule-list">
        {report.eligibility.map((item) => (
          <li key={item.rule.id} className={item.passed ? 'rule pass' : 'rule fail'}>
            <div className="rule-head">
              <span className="rule-icon">{item.passed ? '✓' : '✗'}</span>
              <strong>
                {item.rule.id} · {item.rule.description}
              </strong>
              {(item.rule.requiresEvidence?.length ?? 0) > 0 && (
                <button
                  className={item.evidenceWaived ? 'btn small waived' : 'btn small'}
                  title="豁免/恢复该规则的证据要求"
                  onClick={() =>
                    dispatch({ type: 'toggleWaive', applicationId, ruleId: item.rule.id })
                  }
                >
                  {item.evidenceWaived ? '已豁免证据' : '豁免证据'}
                </button>
              )}
            </div>
            <TraceView trace={item.trace} />
            {item.missingEvidence.length > 0 && (
              <p className="evidence-missing">
                缺失证据：{item.missingEvidence.join('、')}
              </p>
            )}
          </li>
        ))}
      </ul>

      <h3>分项得分</h3>
      <table className="category-table">
        <thead>
          <tr>
            <th>分项</th>
            <th>得分</th>
            <th>封顶</th>
            <th>计入</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(report.categories).map(([cat, t]) => (
            <tr key={cat}>
              <td>{cat}</td>
              <td>{t.awarded}</td>
              <td>{t.cap ?? '—'}</td>
              <td>
                <strong>{t.capped}</strong>
                {t.cap !== undefined && t.awarded > t.cap && (
                  <span className="muted">（已按封顶计）</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>评分项触发情况</h3>
      <ul className="rule-list">
        {report.items.map((item) => (
          <li
            key={item.rule.id}
            className={item.awarded > 0 ? 'rule pass' : item.triggered ? 'rule warn-rule' : 'rule'}
          >
            <div className="rule-head">
              <span className="rule-icon">
                {item.awarded > 0 ? '✓' : item.triggered ? '⚠' : '·'}
              </span>
              <strong>
                {item.rule.id} · {item.rule.description}
              </strong>
              <span className="muted">
                [{item.rule.category}] {item.awarded} / {item.rule.points} 分
              </span>
              {(item.rule.requiresEvidence?.length ?? 0) > 0 && (
                <button
                  className={item.evidenceWaived ? 'btn small waived' : 'btn small'}
                  title="豁免/恢复该规则的证据要求"
                  onClick={() =>
                    dispatch({ type: 'toggleWaive', applicationId, ruleId: item.rule.id })
                  }
                >
                  {item.evidenceWaived ? '已豁免证据' : '豁免证据'}
                </button>
              )}
            </div>
            <TraceView trace={item.trace} />
            {item.triggered && item.missingEvidence.length > 0 && (
              <p className="evidence-missing">
                条件已触发，但缺失证据 {item.missingEvidence.join('、')}，本项不计分。
              </p>
            )}
          </li>
        ))}
      </ul>

      {report.missingEvidence.length > 0 && (
        <>
          <h3>缺失证据汇总</h3>
          <ul className="evidence-list">
            {report.missingEvidence.map((issue, i) => (
              <li key={`${issue.ruleId}-${issue.kind}-${i}`}>
                规则 {issue.ruleId} 需要 <code>{issue.kind}</code>，
                {issue.reason === 'excluded' ? '材料存在但已被评审排除' : '申请中未提交该材料'}
              </li>
            ))}
          </ul>
        </>
      )}

      {report.questionedInUse.length > 0 && (
        <div className="alert warn">
          以下被标记“存疑”的材料仍被触发的规则引用：{report.questionedInUse.join('、')}
        </div>
      )}

      <h3>评审备注</h3>
      <textarea
        className="comment-box"
        placeholder="记录评审意见（自动保存，不进入撤销历史）"
        value={review.comment}
        onChange={(e) =>
          dispatch({ type: 'setComment', applicationId, comment: e.target.value })
        }
      />
    </div>
  );
}
