import { useMemo } from 'react';
import type { Application, ReviewState, RuleSet } from '../types';
import { anonymizeApplication } from '../lib/anonymize';
import { evaluateApplication } from '../lib/scoring';
import { emptyReview, reviewKey } from '../state/store';

interface Props {
  applications: Application[];
  ruleSet: RuleSet;
  reviews: Record<string, ReviewState>;
  activeRound: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** 左侧申请列表：只显示匿名代号与评审状态，不显示任何 PII。 */
export function ApplicationList({
  applications,
  ruleSet,
  reviews,
  activeRound,
  selectedId,
  onSelect,
}: Props) {
  const rows = useMemo(
    () =>
      applications.map((app) => {
        const anon = anonymizeApplication(app);
        const review = reviews[reviewKey(activeRound, app.id)] ?? emptyReview();
        const report = evaluateApplication(app, ruleSet, review);
        return { app, anon, report };
      }),
    [applications, ruleSet, reviews, activeRound],
  );

  return (
    <div className="application-list">
      <h2>申请列表（{applications.length}）</h2>
      <ul>
        {rows.map(({ app, anon, report }) => (
          <li key={app.id}>
            <button
              className={app.id === selectedId ? 'application-item selected' : 'application-item'}
              onClick={() => onSelect(app.id)}
            >
              <span className="alias">{anon.applicantRef}</span>
              <span className="badges">
                <span className={report.eligible ? 'badge ok' : 'badge bad'}>
                  {report.eligible ? '资格通过' : '资格未过'}
                </span>
                {report.missingEvidence.length > 0 && (
                  <span className="badge warn">缺证据 {report.missingEvidence.length}</span>
                )}
                {report.duplicates.length > 0 && (
                  <span className="badge warn">重复材料 {report.duplicates.length}</span>
                )}
              </span>
              <span className="score-line">
                得分 {report.total} / {report.maxTotal}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
