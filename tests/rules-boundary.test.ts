import { describe, expect, it } from 'vitest';
import { anonymizeApplication } from '../src/core/anonymize';
import { evaluate } from '../src/core/evaluate';
import { detectConflicts } from '../src/core/rules';
import { conflictedRuleset, sampleApplications, sampleRuleset } from '../src/core/samples';
import type { Application, EvidenceItem, FieldValue } from '../src/core/types';

function appWith(fields: Record<string, FieldValue>, evidence: EvidenceItem[] = []): Application {
  return {
    id: 'TEST-1',
    submittedAt: '2026-03-01T00:00:00+08:00',
    fields: Object.entries(fields).map(([key, value]) => ({ key, label: key, value })),
    evidence,
  };
}

const TRANSCRIPT: EvidenceItem = { id: 'T-1', type: 'transcript', title: '成绩单', content: '成绩单内容' };
const INCOME: EvidenceItem = { id: 'I-1', type: 'income_proof', title: '收入证明', content: '收入证明内容' };

function evalOf(app: Application, ruleset = sampleRuleset()) {
  return evaluate(anonymizeApplication(app, ruleset.piiFields, 'R1'), ruleset);
}

describe('规则边界', () => {
  it('GPA 恰好等于资格线 3.2 时通过，低 0.01 则不通过', () => {
    const pass = evalOf(
      appWith({ fullTime: true, gpa: 3.2, householdIncome: 50000 }, [TRANSCRIPT, INCOME]),
    );
    expect(pass.eligibility.find((e) => e.ruleId === 'E2')!.passed).toBe(true);

    const fail = evalOf(
      appWith({ fullTime: true, gpa: 3.19, householdIncome: 50000 }, [TRANSCRIPT, INCOME]),
    );
    expect(fail.eligibility.find((e) => e.ruleId === 'E2')!.passed).toBe(false);
  });

  it('志愿时长恰好 100 小时触发加分，99 小时不触发', () => {
    const at = evalOf(
      appWith({ fullTime: true, gpa: 3.5, volunteerHours: 100, householdIncome: 50000 }, [
        TRANSCRIPT,
        INCOME,
        { id: 'V-1', type: 'volunteer_proof', title: '志愿证明', content: '志愿证明内容' },
      ]),
    );
    const s3 = at.scoring.find((s) => s.ruleId === 'S3')!;
    expect(s3.triggered).toBe(true);
    expect(s3.pointsAwarded).toBe(20);

    const below = evalOf(
      appWith({ fullTime: true, gpa: 3.5, volunteerHours: 99, householdIncome: 50000 }, [
        TRANSCRIPT,
        INCOME,
      ]),
    );
    expect(below.scoring.find((s) => s.ruleId === 'S3')!.triggered).toBe(false);
  });

  it('类别封顶：学业原始 45 分被封顶为 30 分，且轨迹可解释', () => {
    const [a] = sampleApplications();
    const result = evalOf(a);
    const cat = result.categories.find((c) => c.category === '学业')!;
    expect(cat.raw).toBe(45); // S1(30) + S2(15)
    expect(cat.capped).toBe(30);
    expect(cat.capApplied).toBe(true);
    expect(result.total).toBe(65); // 30 + 0(S3 被拦截) + 10 + 25
    expect(result.maxTotal).toBe(90);
  });

  it('字段缺失按不通过处理并给出「字段缺失」说明', () => {
    const c = sampleApplications()[2]; // 无 fullTime 字段
    const result = evalOf(c);
    const e1 = result.eligibility.find((e) => e.ruleId === 'E1')!;
    expect(e1.passed).toBe(false);
    expect(e1.trace.note).toBe('字段缺失');
    expect(result.eligible).toBe(false);
  });

  it('数值条件遇到非数值字段时判定不通过并说明类型不匹配', () => {
    const result = evalOf(
      appWith({ fullTime: true, gpa: '3.9（约）', householdIncome: 50000 }, [TRANSCRIPT, INCOME]),
    );
    const e2 = result.eligibility.find((e) => e.ruleId === 'E2')!;
    expect(e2.passed).toBe(false);
    expect(e2.trace.note).toContain('类型不匹配');
  });

  it('in / contains / exists / notExists 操作符', () => {
    const ruleset = sampleRuleset();
    ruleset.eligibility = [
      { id: 'X1', description: '档次在允许范围', condition: { field: 'level', op: 'in', value: ['A', 'B'] } },
      { id: 'X2', description: '文书提到公益', condition: { field: 'essay', op: 'contains', value: '公益' } },
      { id: 'X3', description: '必须有备注', condition: { field: 'note', op: 'exists' } },
      { id: 'X4', description: '不得有处分记录', condition: { field: 'punishment', op: 'notExists' } },
    ];
    const ok = evalOf(
      appWith({ level: 'B', essay: '热心公益', note: '无' }),
      ruleset,
    );
    expect(ok.eligibility.every((e) => e.passed)).toBe(true);

    const bad = evalOf(
      appWith({ level: 'C', essay: '无相关内容', punishment: '警告一次' }),
      ruleset,
    );
    expect(bad.eligibility.every((e) => !e.passed)).toBe(true);
  });
});

describe('规则冲突检测', () => {
    it('干净的示例规则包没有冲突', () => {
    expect(detectConflicts(sampleRuleset())).toEqual([]);
  });

  it('检出重复规则 ID、矛盾门槛、负分与悬空上限', () => {
    const conflicts = detectConflicts(conflictedRuleset());
    expect(conflicts.some((c) => c.message.includes('重复') && c.ruleIds.includes('S2'))).toBe(true);
    expect(
      conflicts.some((c) => c.message.includes('矛盾') && c.ruleIds.includes('E2') && c.ruleIds.includes('E9')),
    ).toBe(true);
    expect(conflicts.some((c) => c.message.includes('负') && c.ruleIds.includes('S8'))).toBe(true);
    expect(conflicts.some((c) => c.severity === 'warning' && c.message.includes('体育'))).toBe(true);
  });

  it('评估结果中携带冲突列表，供界面展示', () => {
    const ruleset = conflictedRuleset();
    const [a] = sampleApplications();
    const result = evaluate(anonymizeApplication(a, ruleset.piiFields, 'R1'), ruleset);
    expect(result.conflicts.length).toBeGreaterThan(0);
  });
});
