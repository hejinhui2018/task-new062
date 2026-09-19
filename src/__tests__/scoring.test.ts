import { describe, expect, it } from 'vitest';
import { evaluateApplication } from '../lib/scoring';
import { defaultRuleSet, sampleApplications } from '../lib/samples';
import type { ReviewState, RuleSet } from '../types';

const [app001, app002, app003] = sampleApplications;

function reviewWith(partial: Partial<ReviewState>): ReviewState {
  return { marks: {}, waivedRules: [], comment: '', ...partial };
}

describe('评分引擎 · 内置缺陷样例', () => {
  it('A-001：资格通过，但志愿服务缺证明 → 触发却不计分', () => {
    const r = evaluateApplication(app001, defaultRuleSet);
    expect(r.eligible).toBe(true);

    const s1 = r.items.find((i) => i.rule.id === 'S1')!;
    expect(s1.awarded).toBe(30); // GPA 3.8 ≥ 3.7

    const s3 = r.items.find((i) => i.rule.id === 'S3')!;
    expect(s3.triggered).toBe(true); // 80 小时 ≥ 40
    expect(s3.awarded).toBe(0); // 但缺 volunteer_proof
    expect(r.missingEvidence).toContainEqual({
      ruleId: 'S3',
      kind: 'volunteer_proof',
      reason: 'missing',
    });

    expect(r.total).toBe(50); // 30(学业) + 20(获奖)
  });

  it('A-001：豁免证据要求后该项计分', () => {
    const r = evaluateApplication(
      app001,
      defaultRuleSet,
      reviewWith({ waivedRules: ['S3'] }),
    );
    expect(r.items.find((i) => i.rule.id === 'S3')!.awarded).toBe(20);
    expect(r.total).toBe(70);
    expect(r.missingEvidence).toEqual([]);
  });

  it('A-002：检出两组重复材料，其余正常计分', () => {
    const r = evaluateApplication(app002, defaultRuleSet);
    expect(r.eligible).toBe(true);
    expect(r.duplicates).toHaveLength(2);
    const dupIds = r.duplicates.flatMap((g) => g.materialIds);
    expect(dupIds).toContain('A002-M1');
    expect(dupIds).toContain('A002-M2');
    expect(dupIds).toContain('A002-M3');
    expect(dupIds).toContain('A002-M4');
    expect(r.total).toBe(40); // 志愿 20 + 推荐信 10 + 困难认定 10
  });

  it('A-003：缺少处分字段 → 资格不通过并解释字段缺失；边界值命中分项', () => {
    const r = evaluateApplication(app003, defaultRuleSet);
    expect(r.eligible).toBe(false);

    const e2 = r.eligibility.find((e) => e.rule.id === 'E2')!;
    expect(e2.passed).toBe(false);
    expect(e2.trace.summary).toContain('缺失');

    // 边界：GPA 恰好 3.3 → 命中 S2（3.3 ≤ GPA < 3.7），不命中 S1
    expect(r.items.find((i) => i.rule.id === 'S2')!.awarded).toBe(15);
    expect(r.items.find((i) => i.rule.id === 'S1')!.triggered).toBe(false);

    // 边界：志愿恰好 40 小时 → 命中 S3
    expect(r.items.find((i) => i.rule.id === 'S3')!.awarded).toBe(20);

    // 边界：年龄恰好 28 → E4（≤ 28）通过
    expect(r.eligibility.find((e) => e.rule.id === 'E4')!.passed).toBe(true);
  });

  it('排除材料后，对应证据视为缺失（reason=excluded）', () => {
    const r = evaluateApplication(
      app002,
      defaultRuleSet,
      reviewWith({ marks: { 'A002-M5': 'excluded' } }),
    );
    const s3 = r.items.find((i) => i.rule.id === 'S3')!;
    expect(s3.triggered).toBe(true);
    expect(s3.awarded).toBe(0);
    expect(r.missingEvidence).toContainEqual({
      ruleId: 'S3',
      kind: 'volunteer_proof',
      reason: 'excluded',
    });
  });

  it('存疑材料仍计分，但列入 questionedInUse 提醒', () => {
    const r = evaluateApplication(
      app002,
      defaultRuleSet,
      reviewWith({ marks: { 'A002-M5': 'questioned' } }),
    );
    expect(r.items.find((i) => i.rule.id === 'S3')!.awarded).toBe(20);
    expect(r.questionedInUse).toContain('A002-M5');
  });

  it('未触发的规则不要求证据（避免误报）', () => {
    // A-001 未申请困难认定（need_based=false），不应报缺 financial_aid_cert
    const r = evaluateApplication(app001, defaultRuleSet);
    expect(r.missingEvidence.find((e) => e.kind === 'financial_aid_cert')).toBeUndefined();
  });
});

describe('评分引擎 · 分项封顶', () => {
  it('超过封顶按封顶计入', () => {
    const rules: RuleSet = {
      id: 't',
      name: 't',
      version: '1',
      categoryCaps: { 学业: 10 },
      eligibility: [],
      scoring: [
        {
          id: 'X1',
          description: '',
          category: '学业',
          points: 8,
          condition: { op: 'cmp', field: 'g', cmp: '>=', value: 1 },
        },
        {
          id: 'X2',
          description: '',
          category: '学业',
          points: 8,
          condition: { op: 'cmp', field: 'g', cmp: '>=', value: 1 },
        },
      ],
    };
    const app = { id: 'T', fields: [{ key: 'g', label: 'g', value: 5 }], materials: [] };
    const r = evaluateApplication(app, rules);
    expect(r.categories['学业'].awarded).toBe(16);
    expect(r.categories['学业'].capped).toBe(10);
    expect(r.total).toBe(10);
    expect(r.maxTotal).toBe(10);
  });
});
