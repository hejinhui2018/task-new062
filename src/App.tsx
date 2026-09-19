import { useEffect, useMemo, useReducer } from 'react';
import { anonymizeApplication } from './lib/anonymize';
import { evaluateApplication } from './lib/scoring';
import { validateRuleSet } from './lib/rules';
import { saveState } from './lib/storage';
import {
  emptyReview,
  initWorkbench,
  reducer,
  reviewKey,
  toPersisted,
  type Action,
} from './state/store';
import { Toolbar } from './components/Toolbar';
import { ApplicationList } from './components/ApplicationList';
import { ReviewPackageView } from './components/ReviewPackage';
import { ScorePanel } from './components/ScorePanel';
import { ConflictPanel } from './components/ConflictPanel';

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => initWorkbench());

  // 每次状态变化后持久化（刷新恢复）
  useEffect(() => {
    saveState(toPersisted(state));
  }, [state]);

  const { doc } = state;
  const selected =
    doc.applications.find((a) => a.id === doc.selectedApplicationId) ?? null;

  // 匿名评审包：选中申请变化时重新生成
  const anonymized = useMemo(
    () => (selected ? anonymizeApplication(selected) : null),
    [selected],
  );

  const activeReview = selected
    ? doc.reviews[reviewKey(doc.activeRound, selected.id)] ?? emptyReview()
    : emptyReview();

  const report = useMemo(
    () => (selected ? evaluateApplication(selected, doc.ruleSet, activeReview) : null),
    [selected, doc.ruleSet, activeReview],
  );

  // 规则冲突：基于所有申请中出现过的字段
  const conflicts = useMemo(() => {
    const knownFields = new Set<string>();
    for (const app of doc.applications) {
      for (const f of app.fields) knownFields.add(f.key);
    }
    return validateRuleSet(doc.ruleSet, [...knownFields]);
  }, [doc.applications, doc.ruleSet]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">GK</span>
          <div>
            <h1>GrantKit 盲审材料工作台</h1>
            <p className="subtitle">
              {doc.ruleSet.name} v{doc.ruleSet.version} · 全部数据仅保存在本机浏览器
            </p>
          </div>
        </div>
        <Toolbar state={state} dispatch={dispatch} />
      </header>

      <main className="app-main">
        <aside className="sidebar">
          <ApplicationList
            applications={doc.applications}
            ruleSet={doc.ruleSet}
            reviews={doc.reviews}
            activeRound={doc.activeRound}
            selectedId={doc.selectedApplicationId}
            onSelect={(id) => dispatch({ type: 'select', applicationId: id })}
          />
        </aside>

        <section className="content">
          {selected && anonymized && report ? (
            <>
              <ReviewPackageView
                application={selected}
                anonymized={anonymized}
                duplicates={report.duplicates}
                review={activeReview}
                dispatch={dispatch}
              />
              <ScorePanel
                report={report}
                review={activeReview}
                applicationId={selected.id}
                dispatch={dispatch}
              />
            </>
          ) : (
            <div className="empty-state">
              <p>暂无申请材料。请从右上角导入申请 JSON，或载入内置样例。</p>
            </div>
          )}
        </section>

        <aside className="inspector">
          <ConflictPanel conflicts={conflicts} />
        </aside>
      </main>
    </div>
  );
}

export type { Action };
