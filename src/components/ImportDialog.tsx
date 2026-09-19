import { useState } from 'react';
import { conflictedRuleset } from '../core/samples';
import { parseApplicationsJson, parseRulesetJson } from '../core/validate';
import type { WorkbenchStore } from '../state/store';

interface Props {
  open: boolean;
  onClose: () => void;
  store: WorkbenchStore;
}

type Tab = 'apps' | 'ruleset';

const APPS_HINT = `[
  {
    "id": "APP-001",
    "submittedAt": "2026-03-01T10:00:00+08:00",
    "fields": [
      { "key": "name", "label": "姓名", "value": "张三", "pii": true },
      { "key": "gpa", "label": "GPA", "value": 3.6 }
    ],
    "evidence": [
      { "id": "EV-1", "type": "transcript", "title": "成绩单", "content": "……" }
    ]
  }
]`;

const RULESET_HINT = `{
  "id": "my-rules",
  "name": "评审规则",
  "version": 1,
  "piiFields": ["name", "phone"],
  "eligibility": [
    { "id": "E1", "description": "GPA ≥ 3.0",
      "condition": { "field": "gpa", "op": "gte", "value": 3.0 },
      "requiredEvidence": "transcript" }
  ],
  "scoring": [
    { "id": "S1", "category": "学业", "description": "GPA ≥ 3.5",
      "condition": { "field": "gpa", "op": "gte", "value": 3.5 },
      "points": 20 }
  ],
  "caps": [{ "category": "学业", "max": 30 }]
}`;

export function ImportDialog({ open, onClose, store }: Props) {
  const [tab, setTab] = useState<Tab>('apps');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const doImport = () => {
    if (tab === 'apps') {
      const r = parseApplicationsJson(text);
      if (!r.ok) return setError(r.error);
      store.importApplications(r.value);
    } else {
      const r = parseRulesetJson(text);
      if (!r.ok) return setError(r.error);
      store.importRuleset(r.value);
    }
    setText('');
    setError(null);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>导入数据</h2>
          <button className="btn small" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="modal-tabs">
          <button className={tab === 'apps' ? 'active' : ''} onClick={() => setTab('apps')}>
            申请材料 JSON
          </button>
          <button className={tab === 'ruleset' ? 'active' : ''} onClick={() => setTab('ruleset')}>
            评分规则 JSON
          </button>
        </div>
        <textarea
          className="import-textarea"
          placeholder={tab === 'apps' ? '粘贴申请材料 JSON（单个对象或数组）' : '粘贴规则包 JSON'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
        {error && <div className="import-error">{error}</div>}
        <details className="format-hint">
          <summary>格式说明</summary>
          <pre>{tab === 'apps' ? APPS_HINT : RULESET_HINT}</pre>
          <p>
            条件操作符：eq / neq / gt / gte / lt / lte / in / contains / exists / notExists。
            piiFields 与字段 pii 标记共同决定匿名化范围，均不依赖字段顺序。
          </p>
        </details>
        <div className="modal-actions">
          <button className="btn primary" onClick={doImport} disabled={!text.trim()}>
            校验并导入
          </button>
          <button
            className="btn"
            onClick={() => {
              store.loadSamples();
              onClose();
            }}
          >
            载入三份内置示例
          </button>
          <button
            className="btn"
            onClick={() => {
              store.importRuleset(conflictedRuleset());
              onClose();
            }}
          >
            载入含冲突的规则示例
          </button>
        </div>
      </div>
    </div>
  );
}
