import type { CmpOp, Condition, FieldValue } from '../types';

/** 条件求值上下文：字段值 + 当前有效的材料类别集合。 */
export interface EvalContext {
  fields: Record<string, FieldValue | undefined>;
  materialKinds: ReadonlySet<string>;
}

/** 求值轨迹：每个节点都带一句人话解释，供“可解释评分”展示。 */
export interface Trace {
  passed: boolean;
  summary: string;
  children: Trace[];
}

function fmt(value: FieldValue): string {
  if (typeof value === 'string') return `「${value}」`;
  if (typeof value === 'boolean') return value ? '是' : '否';
  return String(value);
}

type CmpResult = boolean | 'incomparable';

function compare(cmp: CmpOp, actual: FieldValue, expected: FieldValue): CmpResult {
  if (typeof actual === 'number' && typeof expected === 'number') {
    switch (cmp) {
      case '>': return actual > expected;
      case '>=': return actual >= expected;
      case '<': return actual < expected;
      case '<=': return actual <= expected;
      case '==': return actual === expected;
      case '!=': return actual !== expected;
    }
  }
  if (typeof actual === typeof expected) {
    // 字符串 / 布尔只支持相等性比较
    if (cmp === '==') return actual === expected;
    if (cmp === '!=') return actual !== expected;
    return 'incomparable';
  }
  return 'incomparable';
}

/** 递归求值条件，返回是否通过及完整解释轨迹。 */
export function evalCondition(cond: Condition, ctx: EvalContext): Trace {
  switch (cond.op) {
    case 'cmp': {
      const actual = ctx.fields[cond.field];
      if (actual === undefined) {
        return {
          passed: false,
          summary: `字段 ${cond.field} 缺失，无法判断是否 ${cond.cmp} ${fmt(cond.value)}`,
          children: [],
        };
      }
      const result = compare(cond.cmp, actual, cond.value);
      if (result === 'incomparable') {
        return {
          passed: false,
          summary: `字段 ${cond.field} 类型不匹配（实际值 ${fmt(actual)}，要求 ${cond.cmp} ${fmt(cond.value)}）`,
          children: [],
        };
      }
      return {
        passed: result,
        summary: `${cond.field} = ${fmt(actual)}，${result ? '满足' : '不满足'} ${cond.cmp} ${fmt(cond.value)}`,
        children: [],
      };
    }
    case 'contains': {
      const actual = ctx.fields[cond.field];
      if (typeof actual !== 'string') {
        return {
          passed: false,
          summary: `字段 ${cond.field} 缺失或非文本，无法检索「${cond.value}」`,
          children: [],
        };
      }
      const passed = actual.includes(cond.value);
      return {
        passed,
        summary: `${cond.field} ${passed ? '包含' : '不包含'}「${cond.value}」`,
        children: [],
      };
    }
    case 'exists': {
      const passed = ctx.fields[cond.field] !== undefined;
      return {
        passed,
        summary: `字段 ${cond.field} ${passed ? '存在' : '缺失'}`,
        children: [],
      };
    }
    case 'hasMaterial': {
      const passed = ctx.materialKinds.has(cond.kind);
      return {
        passed,
        summary: `材料 ${cond.kind} ${passed ? '已提供' : '未提供'}`,
        children: [],
      };
    }
    case 'and': {
      const children = cond.conditions.map((c) => evalCondition(c, ctx));
      const passed = children.every((c) => c.passed);
      return {
        passed,
        summary: passed ? '全部子条件均满足' : '存在不满足的子条件',
        children,
      };
    }
    case 'or': {
      const children = cond.conditions.map((c) => evalCondition(c, ctx));
      const passed = children.some((c) => c.passed);
      return {
        passed,
        summary: passed ? '至少一个子条件满足' : '所有子条件均不满足',
        children,
      };
    }
    case 'not': {
      const child = evalCondition(cond.condition, ctx);
      return {
        passed: !child.passed,
        summary: child.passed ? '取反：原条件满足，故不满足' : '取反：原条件不满足，故满足',
        children: [child],
      };
    }
  }
}

/** 收集条件中引用到的全部字段名（用于未知字段检查）。 */
export function collectFieldRefs(cond: Condition, into: Set<string> = new Set()): Set<string> {
  switch (cond.op) {
    case 'cmp':
    case 'contains':
    case 'exists':
      into.add(cond.field);
      break;
    case 'and':
    case 'or':
      for (const c of cond.conditions) collectFieldRefs(c, into);
      break;
    case 'not':
      collectFieldRefs(cond.condition, into);
      break;
    case 'hasMaterial':
      break;
  }
  return into;
}
