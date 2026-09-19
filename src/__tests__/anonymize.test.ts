import { describe, expect, it } from 'vitest';
import { anonymizeApplication } from '../lib/anonymize';
import { sampleApplications } from '../lib/samples';
import type { Application } from '../types';

const [app001, , app003] = sampleApplications;

/** 确定性打乱：反转 + 间隔重排，不依赖随机数。 */
function shuffleApp(app: Application): Application {
  const fields = [...app.fields].reverse();
  const materials = [...app.materials].reverse();
  // 再间隔交换一次，确保顺序确实不同
  for (let i = 0; i + 1 < fields.length; i += 2) {
    [fields[i], fields[i + 1]] = [fields[i + 1], fields[i]];
  }
  return { ...app, fields, materials };
}

describe('匿名化 · 顺序无关性', () => {
  it('字段与材料顺序打乱后，评审包逐字节一致', () => {
    const a = anonymizeApplication(app001);
    const b = anonymizeApplication(shuffleApp(app001));
    expect(b).toEqual(a);
    expect(b.digest).toBe(a.digest);
    expect(b.applicantRef).toBe(a.applicantRef);
  });

  it('对三份内置申请都满足顺序无关', () => {
    for (const app of sampleApplications) {
      expect(anonymizeApplication(shuffleApp(app))).toEqual(anonymizeApplication(app));
    }
  });

  it('不同申请人得到不同化名', () => {
    const refs = new Set(sampleApplications.map((a) => anonymizeApplication(a).applicantRef));
    expect(refs.size).toBe(sampleApplications.length);
  });
});

describe('匿名化 · PII 清除', () => {
  it('评审包中不出现姓名/学号/电话原文', () => {
    const pkg = anonymizeApplication(app001);
    const json = JSON.stringify(pkg);
    expect(json).not.toContain('王思远');
    expect(json).not.toContain('2023010101');
    expect(json).not.toContain('13800001234');
  });

  it('材料正文里混入的 PII 也被替换（A-003 的成绩单含手机号）', () => {
    const pkg = anonymizeApplication(app003);
    const transcript = pkg.materials.find((m) => m.id === 'A003-M1')!;
    expect(transcript.content).not.toContain('13900005678');
    expect(transcript.content).not.toContain('陈启铭');
    expect(pkg.replacements).toBeGreaterThan(0);
  });

  it('同一 PII 值在字段与材料中得到同一化名', () => {
    const pkg = anonymizeApplication(app001);
    const nameField = pkg.fields.find((f) => f.key === 'applicant.name')!;
    const alias = String(nameField.value);
    expect(alias).toMatch(/^\[匿名#[0-9a-f]{6}\]$/);
    const transcript = pkg.materials.find((m) => m.kind === 'transcript')!;
    expect(transcript.content).toContain(alias);
  });

  it('非 PII 数值字段原样保留（分数不被动匿名）', () => {
    const pkg = anonymizeApplication(app001);
    const gpa = pkg.fields.find((f) => f.key === 'academic.gpa')!;
    expect(gpa.value).toBe(3.8);
    expect(gpa.pii).toBe(false);
  });

  it('输出字段按 key 排序、材料按 id 排序', () => {
    const pkg = anonymizeApplication(app001);
    const keys = pkg.fields.map((f) => f.key);
    expect(keys).toEqual([...keys].sort());
    const ids = pkg.materials.map((m) => m.id);
    expect(ids).toEqual([...ids].sort());
  });
});
