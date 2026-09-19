import { describe, expect, it } from 'vitest';
import { anonymizeApplication, applicantAlias, REDACTED } from '../src/core/anonymize';
import { sampleApplications, sampleRuleset } from '../src/core/samples';
import type { Application } from '../src/core/types';

/** 确定性置换：同一 seed 结果相同，不依赖 Math.random */
function permute<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = (seed * 31 + i * 17) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function shuffled(app: Application, seed: number): Application {
  return {
    ...app,
    fields: permute(app.fields, seed),
    evidence: permute(app.evidence, seed + 1000),
  };
}

describe('匿名化', () => {
  it('移除所有声明的 PII 字段，无论字段在什么位置', () => {
    const [a] = sampleApplications();
    const ruleset = sampleRuleset();
    const pkg = anonymizeApplication(a, ruleset.piiFields, 'R1');
    const keys = pkg.fields.map((f) => f.key);
    for (const piiKey of ruleset.piiFields) {
      expect(keys).not.toContain(piiKey);
    }
    expect(keys).toContain('gpa');
    expect(keys).toContain('essay');
  });

  it('隐去正文与证据中的 PII 值及邮箱/手机号/身份证号模式', () => {
    const [a] = sampleApplications();
    const pkg = anonymizeApplication(a, sampleRuleset().piiFields, 'R1');
    const essay = String(pkg.fields.find((f) => f.key === 'essay')!.value);
    expect(essay).not.toContain('林晓');
    expect(essay).not.toContain('linxiao@example.edu.cn');
    expect(essay).not.toContain('13812345678');
    expect(essay).not.toContain('110101200401023316');
    expect(essay).toContain(REDACTED);

    const transcript = pkg.evidence.find((e) => e.type === 'transcript')!;
    expect(transcript.content).not.toContain('林晓');

    // 整个评审包中不得出现任何 PII 原文
    const whole = JSON.stringify(pkg);
    expect(whole).not.toContain('林晓');
    expect(whole).not.toContain('110101200401023316');
    expect(pkg.redactions).toBeGreaterThan(0);
  });

  it('推荐信中推荐人的手机号也会被模式脱敏', () => {
    const c = sampleApplications()[2];
    const pkg = anonymizeApplication(c, sampleRuleset().piiFields, 'R1');
    const rec = pkg.evidence.find((e) => e.type === 'recommendation')!;
    expect(rec.content).not.toContain('13900001111');
    expect(rec.content).not.toContain('周敏');
  });

  it('字段与证据顺序不影响匿名结果（顺序无关性）', () => {
    const apps = sampleApplications();
    const ruleset = sampleRuleset();
    for (const app of apps) {
      const base = anonymizeApplication(app, ruleset.piiFields, 'R1');
      for (let seed = 1; seed <= 6; seed++) {
        const result = anonymizeApplication(shuffled(app, seed), ruleset.piiFields, 'R1');
        expect(result).toEqual(base);
      }
    }
  });

  it('PII 字段列表的顺序不影响结果', () => {
    const [a] = sampleApplications();
    const ruleset = sampleRuleset();
    const base = anonymizeApplication(a, ruleset.piiFields, 'R1');
    const reversed = anonymizeApplication(a, [...ruleset.piiFields].reverse(), 'R1');
    expect(reversed).toEqual(base);
  });

  it('匿名编号稳定、随轮次盐值变化、随申请人变化', () => {
    expect(applicantAlias('APP-2026-001', 'R1')).toBe(applicantAlias('APP-2026-001', 'R1'));
    expect(applicantAlias('APP-2026-001', 'R1')).not.toBe(applicantAlias('APP-2026-001', 'R2'));
    expect(applicantAlias('APP-2026-001', 'R1')).not.toBe(applicantAlias('APP-2026-002', 'R1'));
  });

  it('字段自带 pii 标记即使不在规则包 piiFields 中也会被移除', () => {
    const [a] = sampleApplications();
    const pkg = anonymizeApplication(a, [], 'R1'); // 空的 piiFields
    const keys = pkg.fields.map((f) => f.key);
    expect(keys).not.toContain('name');
    expect(keys).not.toContain('idNumber');
  });
});
