import type { CmpOp, Condition, RuleSet } from '../types';
import { collectFieldRefs } from './conditions';

export type ConflictType =
  | 'duplicate-id'
  | 'unsatisfiable'
  | 'eligibility-contradiction'
  | 'unknown-field'
  | 'cap-exceeded';

export interface RuleConflict {
  type: ConflictType;
  ruleIds: string[];
  message: string;
}

/* ---------- 数值区间：用于静态发现“永远不可能满足”的条件组合 ---------- */

interface NumInterval {
  low: number;
  lowInclusive: boolean;
  high: number;
  highInclusive: boolean;
}

const FULL_INTERVAL: NumInterval = {
  low: -Infinity,
  lowInclusive: true,
  high: Infinity,
  highInclusive: true,
};

function clampInterval(iv: NumInterval, cmp: CmpOp, value: number): NumInterval {
  switch (cmp) {
    case '>':
      return intersect(iv, { ...FULL_INTERVAL, low: value, lowInclusive: false });
    case '>=':
      return intersect(iv, { ...FULL_INTERVAL, low: value, lowInclusive: true });
    case '<':
      return intersect(iv, { ...FULL_INTERVAL, high: value, highInclusive: false });
    case '<=':
      return intersect(iv, { ...FULL_INTERVAL, high: value, highInclusive: true });
    case '==':
      return intersect(iv, { low: value, lowInclusive: true, high: value, highInclusive: true });
    case '!=':
      return iv; // 单点排除不改变区间非空性（区间是连续的）
  }
}

function intersect(a: NumInterval, b: NumInterval): NumInterval {
  let low: number;
  let lowInclusive: boolean;
  if (a.low > b.low) {
    low = a.low;
    lowInclusive = a.lowInclusive;
  } else if (a.low < b.low) {
    low = b.low;
    lowInclusive = b.lowInclusive;
  } else {
    low = a.low;
    lowInclusive = a.lowInclusive && b.lowInclusive;
  }
  let high: number;
  let highInclusive: boolean;
  if (a.high < b.high) {
    high = a.high;
    highInclusive = a.highInclusive;
  } else if (a.high > b.high) {
    high = b.high;
    highInclusive = b.highInclusive;
  } else {
    high = a.high;
    highInclusive = a.highInclusive && b.highInclusive;
  }
  return { low, lowInclusive, high, highInclusive };
}

function isEmpty(iv: NumInterval): boolean {
  if (iv.low > iv.high) return true;
  if (iv.low === iv.high && (!iv.lowInclusive || !iv.highInclusive)) return true;
  return false;
}

interface FieldConstraints {
  interval: NumInterval;
  /** == 约束收集到的字面值（String 化），两个不同的 == 即矛盾。 */
  eqLiterals: Set<string>;
}

function freshConstraints(): FieldConstraints {
  return { interval: { ...FULL_INTERVAL }, eqLiterals: new Set() };
}

/**
 * 收集条件顶层合取（and 链）中的数值/等值约束。
 * or / not 子树无法静态合并，跳过——这是保守分析，只报确定的冲突。
 */
function collectConstraints(cond: Condition, acc: Map<string, FieldConstraints>): void {
  if (cond.op === 'and') {
    for (const c of cond.conditions) collectConstraints(c, acc);
    return;
  }
  if (cond.op !== 'cmp') return;
  const entry = acc.get(cond.field) ?? freshConstraints();
  if (cond.cmp === '==') entry.eqLiterals.add(String(cond.value));
  if (typeof cond.value === 'number') {
    entry.interval = clampInterval(entry.interval, cond.cmp, cond.value);
  }
  acc.set(cond.field, entry);
}

function constraintsContradict(acc: Map<string, FieldConstraints>): string | null {
  for (const [field, c] of acc) {
    if (isEmpty(c.interval)) {
      return `字段 ${field} 的数值约束互相矛盾（区间为空）`;
    }
    if (c.eqLiterals.size > 1) {
      return `字段 ${field} 被要求同时等于 ${[...c.eqLiterals].join(' 和 ')}`;
    }
    for (const lit of c.eqLiterals) {
      const n = Number(lit);
      if (!Number.isNaN(n) && lit.trim() !== '') {
        const probe = clampInterval(FULL_INTERVAL, '==', n);
        if (isEmpty(intersect(c.interval, probe))) {
          return `字段 ${field} 要求等于 ${lit}，但落在数值约束区间之外`;
        }
      }
    }
  }
  return null;
}

/**
 * 静态校验规则集，返回冲突列表（不依赖任何申请数据）。
 * @param knownFields 全部申请中出现过的字段名，用于未知字段检查。
 */
export function validateRuleSet(ruleSet: RuleSet, knownFields: readonly string[]): RuleConflict[] {
  const conflicts: RuleConflict[] = [];
  const allRules = [
    ...ruleSet.eligibility.map((r) => ({ ...r, kind: '资格' as const })),
    ...ruleSet.scoring.map((r) => ({ ...r, kind: '评分' as const })),
  ];

  // 1. 规则 id 重复
  const byId = new Map<string, string[]>();
  for (const r of allRules) {
    byId.set(r.id, [...(byId.get(r.id) ?? []), `${r.kind}规则`]);
  }
  for (const [id, owners] of byId) {
    if (owners.length > 1) {
      conflicts.push({
        type: 'duplicate-id',
        ruleIds: [id],
        message: `规则 id「${id}」被 ${owners.length} 个${owners[0]}重复定义`,
      });
    }
  }

  // 2. 单条规则内部矛盾（永真为假 → 死规则）
  for (const r of allRules) {
    const acc = new Map<string, FieldConstraints>();
    collectConstraints(r.condition, acc);
    const reason = constraintsContradict(acc);
    if (reason) {
      conflicts.push({
        type: 'unsatisfiable',
        ruleIds: [r.id],
        message: `${r.kind}规则「${r.id}」永远无法触发：${reason}`,
      });
    }
  }

  // 3. 资格规则之间互相矛盾（合并所有资格约束后区间为空 → 无人可能合格）
  const merged = new Map<string, FieldConstraints>();
  for (const r of ruleSet.eligibility) collectConstraints(r.condition, merged);
  const crossReason = constraintsContradict(merged);
  if (crossReason) {
    conflicts.push({
      type: 'eligibility-contradiction',
      ruleIds: ruleSet.eligibility.map((r) => r.id),
      message: `资格规则整体矛盾，任何申请人都无法合格：${crossReason}`,
    });
  }

  // 4. 引用了任何申请中都不存在的字段
  const known = new Set(knownFields);
  for (const r of allRules) {
    for (const field of collectFieldRefs(r.condition)) {
      if (!known.has(field)) {
        conflicts.push({
          type: 'unknown-field',
          ruleIds: [r.id],
          message: `${r.kind}规则「${r.id}」引用了未知字段 ${field}（所有申请中均未出现）`,
        });
      }
    }
  }

  // 5. 分项理论总分超过封顶（提示封顶会生效）
  const sumByCategory = new Map<string, { sum: number; ids: string[] }>();
  for (const r of ruleSet.scoring) {
    const entry = sumByCategory.get(r.category) ?? { sum: 0, ids: [] };
    entry.sum += r.points;
    entry.ids.push(r.id);
    sumByCategory.set(r.category, entry);
  }
  for (const [category, { sum, ids }] of sumByCategory) {
    const cap = ruleSet.categoryCaps[category];
    if (cap !== undefined && sum > cap) {
      conflicts.push({
        type: 'cap-exceeded',
        ruleIds: ids,
        message: `分项「${category}」规则总分 ${sum} 超过封顶 ${cap}，超出部分不会计入`,
      });
    }
  }

  return conflicts;
}
