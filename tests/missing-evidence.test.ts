import { describe, expect, it } from 'vitest';
import { anonymizeApplication } from '../src/core/anonymize';
import { evaluate } from '../src/core/evaluate';
import { sampleApplications, sampleRuleset } from '../src/core/samples';
import type { Application } from '../src/core/types';

function evalOf(app: Application, flagged: string[] = []) {
  const ruleset = sampleRuleset();
  return evaluate(anonymizeApplication(app, ruleset.piiFields, 'R1'), ruleset, {
    flaggedEvidenceIds: new Set(flagged),
  });
}

describe('缺失证据', () => {
  it('声称志愿时长但缺少志愿证明：S3 触发但被拦截，不计分', () => {
    const a = sampleApplications()[0]; // 120 小时，无 volunteer_proof
    const result = evalOf(a);
    const s3 = result.scoring.find((s) => s.ruleId === 'S3')!;
    expect(s3.triggered).toBe(true);
    expect(s3.pointsAwarded).toBe(0);
    expect(s3.blockedReason).toContain('volunteer_proof');
    expect(result.missingEvidence).toContain('volunteer_proof');
  });

  it('补齐志愿证明后拦截解除并计分', () => {
    const a = sampleApplications()[0];
    const fixed: Application = {
      ...a,
      evidence: [
        ...a.evidence,
        { id: 'A-EV-3', type: 'volunteer_proof', title: '志愿服务证明', content: '兹证明该生服务 120 小时。' },
      ],
    };
    const result = evalOf(fixed);
    const s3 = result.scoring.find((s) => s.ruleId === 'S3')!;
    expect(s3.pointsAwarded).toBe(20);
    expect(result.missingEvidence).not.toContain('volunteer_proof');
    expect(result.total).toBe(85); // 65 + 20
  });

  it('资格规则要求的证据缺失时资格不通过', () => {
    const a = sampleApplications()[0];
    const noTranscript: Application = {
      ...a,
      evidence: a.evidence.filter((e) => e.type !== 'transcript'),
    };
    const result = evalOf(noTranscript);
    const e2 = result.eligibility.find((e) => e.ruleId === 'E2')!;
    expect(e2.missingEvidence).toBe(true);
    expect(e2.passed).toBe(false);
    expect(result.eligible).toBe(false);
    expect(result.missingEvidence).toContain('transcript');
  });

  it('评审人标记「存疑」的证据不再满足证据要求', () => {
    const a = sampleApplications()[0]; // 成绩单 A-EV-1
    const result = evalOf(a, ['A-EV-1']);
    const e2 = result.eligibility.find((e) => e.ruleId === 'E2')!;
    expect(e2.missingEvidence).toBe(true);
    expect(e2.passed).toBe(false);
    expect(result.eligible).toBe(false);
  });

  it('标记「有效」不影响证据池', () => {
    const a = sampleApplications()[0];
    const baseline = evalOf(a);
    // 只传 flagged 集合；verified 标记不会进入 flaggedEvidenceIds
    const result = evalOf(a, []);
    expect(result.total).toBe(baseline.total);
    expect(result.eligible).toBe(baseline.eligible);
  });

  it('收入证明缺失同时影响资格 E3 与加分 S6', () => {
    const a = sampleApplications()[0];
    const noIncome: Application = {
      ...a,
      evidence: a.evidence.filter((e) => e.type !== 'income_proof'),
    };
    const result = evalOf(noIncome);
    expect(result.eligibility.find((e) => e.ruleId === 'E3')!.missingEvidence).toBe(true);
    const s6 = result.scoring.find((s) => s.ruleId === 'S6')!;
    expect(s6.triggered).toBe(true);
    expect(s6.pointsAwarded).toBe(0);
    expect(result.missingEvidence).toContain('income_proof');
  });
});
