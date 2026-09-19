import { describe, expect, it } from 'vitest';
import { evalCondition, type EvalContext } from '../lib/conditions';
import type { FieldValue } from '../types';

function ctx(
  fields: Record<string, FieldValue> = {},
  kinds: string[] = [],
): EvalContext {
  return { fields, materialKinds: new Set(kinds) };
}

describe('条件求值 · 规则边界', () => {
  it('>= 边界值包含本数', () => {
    expect(evalCondition({ op: 'cmp', field: 'gpa', cmp: '>=', value: 3.0 }, ctx({ gpa: 3.0 })).passed).toBe(true);
    expect(evalCondition({ op: 'cmp', field: 'gpa', cmp: '>=', value: 3.0 }, ctx({ gpa: 2.99 })).passed).toBe(false);
  });

  it('> 边界值不包含本数', () => {
    expect(evalCondition({ op: 'cmp', field: 'gpa', cmp: '>', value: 3.0 }, ctx({ gpa: 3.0 })).passed).toBe(false);
    expect(evalCondition({ op: 'cmp', field: 'gpa', cmp: '>', value: 3.0 }, ctx({ gpa: 3.01 })).passed).toBe(true);
  });

  it('<= 与 < 的边界行为', () => {
    expect(evalCondition({ op: 'cmp', field: 'age', cmp: '<=', value: 28 }, ctx({ age: 28 })).passed).toBe(true);
    expect(evalCondition({ op: 'cmp', field: 'age', cmp: '<', value: 28 }, ctx({ age: 28 })).passed).toBe(false);
  });

  it('== / != 支持数值、字符串与布尔', () => {
    expect(evalCondition({ op: 'cmp', field: 'g', cmp: '==', value: 3.3 }, ctx({ g: 3.3 })).passed).toBe(true);
    expect(evalCondition({ op: 'cmp', field: 'd', cmp: '==', value: false }, ctx({ d: false })).passed).toBe(true);
    expect(evalCondition({ op: 'cmp', field: 's', cmp: '!=', value: 'x' }, ctx({ s: 'y' })).passed).toBe(true);
  });

  it('字段缺失时不通过，并在解释中说明缺失', () => {
    const trace = evalCondition({ op: 'cmp', field: 'gpa', cmp: '>=', value: 3.0 }, ctx());
    expect(trace.passed).toBe(false);
    expect(trace.summary).toContain('缺失');
  });

  it('类型不匹配时不通过', () => {
    const trace = evalCondition(
      { op: 'cmp', field: 'gpa', cmp: '>=', value: 3.0 },
      ctx({ gpa: '三點零' }),
    );
    expect(trace.passed).toBe(false);
    expect(trace.summary).toContain('类型不匹配');
  });

  it('字符串字段做大小比较视为类型不匹配', () => {
    const trace = evalCondition(
      { op: 'cmp', field: 'name', cmp: '>', value: 'a' },
      ctx({ name: 'b' }),
    );
    expect(trace.passed).toBe(false);
  });

  it('and / or / not 组合', () => {
    const c = ctx({ gpa: 3.5, age: 20 });
    expect(
      evalCondition(
        {
          op: 'and',
          conditions: [
            { op: 'cmp', field: 'gpa', cmp: '>=', value: 3.0 },
            { op: 'cmp', field: 'age', cmp: '<=', value: 28 },
          ],
        },
        c,
      ).passed,
    ).toBe(true);
    expect(
      evalCondition(
        {
          op: 'or',
          conditions: [
            { op: 'cmp', field: 'gpa', cmp: '>=', value: 3.7 },
            { op: 'cmp', field: 'gpa', cmp: '>=', value: 3.3 },
          ],
        },
        c,
      ).passed,
    ).toBe(true);
    expect(
      evalCondition({ op: 'not', condition: { op: 'cmp', field: 'gpa', cmp: '<', value: 3.0 } }, c).passed,
    ).toBe(true);
  });

  it('and 中任一子条件失败则整体失败，轨迹保留每个子条件', () => {
    const trace = evalCondition(
      {
        op: 'and',
        conditions: [
          { op: 'cmp', field: 'gpa', cmp: '>=', value: 3.0 },
          { op: 'cmp', field: 'gpa', cmp: '<', value: 3.7 },
        ],
      },
      ctx({ gpa: 3.8 }),
    );
    expect(trace.passed).toBe(false);
    expect(trace.children).toHaveLength(2);
    expect(trace.children[0].passed).toBe(true);
    expect(trace.children[1].passed).toBe(false);
  });

  it('contains / exists / hasMaterial', () => {
    const c = ctx({ intro: '我热爱公益事业' }, ['transcript']);
    expect(evalCondition({ op: 'contains', field: 'intro', value: '公益' }, c).passed).toBe(true);
    expect(evalCondition({ op: 'contains', field: 'intro', value: '游戏' }, c).passed).toBe(false);
    expect(evalCondition({ op: 'exists', field: 'intro' }, c).passed).toBe(true);
    expect(evalCondition({ op: 'exists', field: 'missing' }, c).passed).toBe(false);
    expect(evalCondition({ op: 'hasMaterial', kind: 'transcript' }, c).passed).toBe(true);
    expect(evalCondition({ op: 'hasMaterial', kind: 'recommendation' }, c).passed).toBe(false);
  });
});
