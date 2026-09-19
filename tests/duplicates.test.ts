import { describe, expect, it } from 'vitest';
import { anonymizeApplication } from '../src/core/anonymize';
import { evaluate } from '../src/core/evaluate';
import { sampleApplications, sampleRuleset } from '../src/core/samples';
import type { Application } from '../src/core/types';

function evalOf(app: Application) {
  const ruleset = sampleRuleset();
  return evaluate(anonymizeApplication(app, ruleset.piiFields, 'R1'), ruleset);
}

describe('重复材料检测', () => {
  it('检出内容完全一致的重复提交（示例申请 B 的成绩单）', () => {
    const b = sampleApplications()[1];
    const result = evalOf(b);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].evidenceIds).toEqual(['B-EV-1', 'B-EV-2']);
    expect(result.duplicates[0].types).toEqual(['transcript']);
  });

  it('空白与大小写差异不影响重复判定', () => {
    const app: Application = {
      id: 'DUP-1',
      submittedAt: '',
      fields: [{ key: 'gpa', label: 'GPA', value: 3.5 }],
      evidence: [
        { id: 'E1', type: 'transcript', title: '版本一', content: '  兹证明 GPA 为 3.5。\n' },
        { id: 'E2', type: 'transcript', title: '版本二', content: '兹证明 gpa 为 3.5。' },
      ],
    };
    const result = evalOf(app);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].evidenceIds).toEqual(['E1', 'E2']);
  });

  it('内容不同的材料不误报（示例申请 A、C）', () => {
    const apps = sampleApplications();
    expect(evalOf(apps[0]).duplicates).toHaveLength(0);
    expect(evalOf(apps[2]).duplicates).toHaveLength(0);
  });

  it('三份相同材料归入同一组', () => {
    const app: Application = {
      id: 'DUP-2',
      submittedAt: '',
      fields: [],
      evidence: [
        { id: 'E1', type: 'transcript', title: '一', content: '同一份证明' },
        { id: 'E2', type: 'transcript', title: '二', content: '同一份证明' },
        { id: 'E3', type: 'transcript', title: '三', content: '同一份证明' },
        { id: 'E4', type: 'transcript', title: '四', content: '另一份证明' },
      ],
    };
    const result = evalOf(app);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].evidenceIds).toEqual(['E1', 'E2', 'E3']);
  });
});
