import type { Application } from '../core/types';
import type { ApplicantView } from '../App';

interface Props {
  applications: Application[];
  applicants: Map<string, ApplicantView>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ApplicantList({ applications, applicants, selectedId, onSelect }: Props) {
  return (
    <div className="applicant-list">
      <div className="panel-title">申请人（{applications.length}）</div>
      {applications.map((app) => {
        const av = applicants.get(app.id);
        if (!av) return null;
        const { result } = av;
        const issues = result.missingEvidence.length + result.duplicates.length;
        return (
          <button
            key={app.id}
            className={`applicant-item ${app.id === selectedId ? 'selected' : ''}`}
            onClick={() => onSelect(app.id)}
          >
            <div className="applicant-top">
              <span className="alias">{av.pkg.alias}</span>
              <span className={`badge ${result.eligible ? 'ok' : 'bad'}`}>
                {result.eligible ? '符合资格' : '不符合'}
              </span>
            </div>
            <div className="applicant-meta">
              <span>
                总分 {result.total}/{result.maxTotal}
              </span>
              {issues > 0 && <span className="badge warn">⚠ {issues} 项待处理</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
