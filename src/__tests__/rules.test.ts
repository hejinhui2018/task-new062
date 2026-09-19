import { describe, expect, it } from 'vitest';
import { validateRuleSet } from '../lib/rules';
import { defaultRuleSet, flawedRuleSet, sampleApplications } from '../lib/samples';

const knownFields = [
  ...new Set(sampleApplications.flatMap((a) => a.fields.map((f) => f.key))),
];

describe('规则体检 · 冲突检测', () => {
  it('默认规则集对内置申请无冲突', () => {
    expect(validateRuleSet(defaultRuleSet, knownFields)).toEqual([]);
  });

  it('检出重复规则 id', () => {
    const conflicts = validateRuleSet(flawedRuleSet, knownFields);
    const dup = conflicts.find((c) => c.type === 'duplicate-id');
    expect(dup).toBeDefined();
    expect(dup!.ruleIds).toContain('S1');
  });

  it('检出单条规则内部自相矛盾（区间为空）', () => {
    const conflicts = validateRuleSet(flawedRuleSet, knownFields);
    const unsat = conflicts.find((c) => c.type === 'unsatisfiable');
    expect(unsat).toBeDefined();
    expect(unsat!.ruleIds).toEqual(['S3']);
    expect(unsat!.message).toContain('永远无法触发');
  });

  it('检出资格规则之间互相矛盾（无人能合格）', () => {
    const conflicts = validateRuleSet(flawedRuleSet, knownFields);
    const cross = conflicts.find((c) => c.type === 'eligibility-contradiction');
    expect(cross).toBeDefined();
    expect(cross!.message).toContain('任何申请人都无法合格');
  });

  it('检出未知字段引用', () => {
    const conflicts = validateRuleSet(flawedRuleSet, knownFields);
    const unknown = conflicts.find((c) => c.type === 'unknown-field');
    expect(unknown).toBeDefined();
    expect(unknown!.message).toContain('academic.toefl');
  });

  it('检出分项总分超过封顶', () => {
    const conflicts = validateRuleSet(flawedRuleSet, knownFields);
    const cap = conflicts.find((c) => c.type === 'cap-exceeded');
    expect(cap).toBeDefined();
    expect(cap!.message).toContain('学业');
  });

  it('边界：x >= 3 且 x <= 3 不矛盾（区间退化为单点）', () => {
    const rs = {
      ...defaultRuleSet,
      eligibility: [
        {
          id: 'E1',
          description: '',
          condition: {
            op: 'and' as const,
            conditions: [
              { op: 'cmp' as const, field: 'academic.gpa', cmp: '>=' as const, value: 3 },
              { op: 'cmp' as const, field: 'academic.gpa', cmp: '<=' as const, value: 3 },
            ],
          },
        },
      ],
      scoring: [],
    };
    expect(validateRuleSet(rs, knownFields)).toEqual([]);
  });

  it('边界：x > 3 且 x < 3 矛盾（开区间为空）', () => {
    const rs = {
      ...defaultRuleSet,
      eligibility: [
        {
          id: 'E1',
          description: '',
          condition: {
            op: 'and' as const,
            conditions: [
              { op: 'cmp' as const, field: 'academic.gpa', cmp: '>' as const, value: 3 },
              { op: 'cmp' as const, field: 'academic.gpa', cmp: '<' as const, value: 3 },
            ],
          },
        },
      ],
      scoring: [],
    };
    const conflicts = validateRuleSet(rs, knownFields);
    expect(conflicts.some((c) => c.type === 'unsatisfiable')).toBe(true);
  });

  it('同一字段被赋予两个不同的等值即矛盾', () => {
    const rs = {
      ...defaultRuleSet,
      eligibility: [
        {
          id: 'E1',
          description: '',
          condition: {
            op: 'and' as const,
            conditions: [
              { op: 'cmp' as const, field: 'personal.disciplinary', cmp: '==' as const, value: true },
              { op: 'cmp' as const, field: 'personal.disciplinary', cmp: '==' as const, value: false },
            ],
          },
        },
      ],
      scoring: [],
    };
    const conflicts = validateRuleSet(rs, knownFields);
    expect(conflicts.some((c) => c.type === 'unsatisfiable')).toBe(true);
  });
});
