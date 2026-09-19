import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { anonymizeApplication } from './core/anonymize';
import { evaluate } from './core/evaluate';
import type { AnonymizedApplication, EvaluationResult } from './core/types';
import { ApplicantList } from './components/ApplicantList';
import { HeaderBar } from './components/HeaderBar';
import { ImportDialog } from './components/ImportDialog';
import { ReviewWorkspace } from './components/ReviewWorkspace';
import { RulesetPanel } from './components/RulesetPanel';
import { WorkbenchStore } from './state/store';

export interface ApplicantView {
  pkg: AnonymizedApplication;
  result: EvaluationResult;
}

export default function App() {
  const [store] = useState(() => new WorkbenchStore());
  const view = useSyncExternalStore(store.subscribe, store.getView);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  const round = view.rounds.find((r) => r.id === view.activeRoundId) ?? view.rounds[0];

  // 每位申请人：匿名化评审包 + 规则评估（含评审标记的影响）
  const applicants = useMemo(() => {
    const map = new Map<string, ApplicantView>();
    if (!round) return map;
    for (const app of view.applications) {
      const pkg = anonymizeApplication(app, view.ruleset.piiFields, round.salt);
      const marks = round.marks[app.id] ?? [];
      const flagged = new Set(marks.filter((m) => m.mark === 'flagged').map((m) => m.evidenceId));
      map.set(app.id, { pkg, result: evaluate(pkg, view.ruleset, { flaggedEvidenceIds: flagged }) });
    }
    return map;
  }, [view.applications, view.ruleset, round]);

  const selectedId =
    view.selectedApplicantId && applicants.has(view.selectedApplicantId)
      ? view.selectedApplicantId
      : (view.applications[0]?.id ?? null);
  const selected = selectedId ? applicants.get(selectedId) ?? null : null;
  const selectedMarks = selectedId && round ? (round.marks[selectedId] ?? []) : [];

  return (
    <div className="app">
      <HeaderBar store={store} view={view} applicants={applicants} onOpenImport={() => setImportOpen(true)} />
      <div className="body">
        <aside className="sidebar">
          <ApplicantList
            applications={view.applications}
            applicants={applicants}
            selectedId={selectedId}
            onSelect={(id) => store.selectApplicant(id)}
          />
          <RulesetPanel ruleset={view.ruleset} />
        </aside>
        <main className="main">
          {selected && selectedId && round ? (
            <ReviewWorkspace
              key={`${selectedId}@${round.id}`}
              store={store}
              applicantId={selectedId}
              roundName={round.name}
              view={selected}
              marks={selectedMarks}
            />
          ) : (
            <div className="empty-state">
              <p>暂无申请材料。</p>
              <button className="btn primary" onClick={() => setImportOpen(true)}>
                导入申请材料
              </button>
            </div>
          )}
        </main>
      </div>
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} store={store} />
    </div>
  );
}
