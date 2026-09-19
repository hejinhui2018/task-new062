import type {
  Condition,
  ConditionOp,
  ConditionTrace,
  FieldValue,
  RuleConflict,
  Ruleset,
} from './types';

/** 求值单个条件；字段缺失时除 notExists 外一律不通过，并在 note 中说明 */
export function evalCondition(
  cond: Condition,
  fields: ReadonlyMap<string, FieldValue>,
): ConditionTrace {
  const base = { field: cond.field, op: cond.op, expected: cond.value, actual: fields.get(cond.field) };
  if (!fields.has(cond.field)) {
    return {
      ...base,
      passed: cond.op === 'notExists',
      note: cond.op === 'notExists' ? undefined : '字段缺失',
    };
  }
  const actual = fields.get(cond.field) as FieldValue;
  switch (cond.op) {
    case 'exists':
      return { ...base, passed: true };
    case 'notExists':
      return { ...base, passed: false, note: '字段不应存在' };
    case 'eq':
      return { ...base, passed: actual === cond.value };
    case 'neq':
      return { ...base, passed: actual !== cond.value };
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if (typeof actual !== 'number' || typeof cond.value !== 'number') {
        return { ...base, passed: false, note: '类型不匹配（需要数值）' };
      }
      const passed =
        cond.op === 'gt'
          ? actual > cond.value
          : cond.op === 'gte'
            ? actual >= cond.value
            : cond.op === 'lt'
              ? actual < cond.value
              : actual <= cond.value;
      return { ...base, passed };
    }
    case 'in': {
      const list = Array.isArray(cond.value) ? cond.value : [];
      return { ...base, passed: list.includes(actual) };
    }
    case 'contains': {
      if (typeof actual === 'string' && typeof cond.value === 'string') {
        return { ...base, passed: actual.includes(cond.value) };
      }
      return { ...base, passed: false, note: '类型不匹配（需要文本）' };
    }
    default:
      return { ...base, passed: false, note: `未知操作符 ${String(cond.op)}` };
  }
}

const OP_TEXT: Record<ConditionOp, string> = {
  eq: '=',
  neq: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  in: '属于',
  contains: '包含',
  exists: '存在',
  notExists: '不存在',
};

export function formatValue(v: FieldValue | FieldValue[] | undefined): string {
  if (v === undefined) return '缺失';
  if (v === null) return '空';
  if (v === true) return '是';
  if (v === false) return '否';
  if (Array.isArray(v)) return `[${v.map(formatValue).join(', ')}]`;
  return String(v);
}

/** 把条件轨迹翻译成可读的判定依据 */
export function describeCondition(t: ConditionTrace): string {
  const actual = formatValue(t.actual);
  if (t.op === 'exists' || t.op === 'notExists') {
    return `要求字段「${t.field}」${OP_TEXT[t.op]}，实际：${actual}`;
  }
  return `要求 ${t.field} ${OP_TEXT[t.op]} ${formatValue(t.expected)}，实际为 ${actual}`;
}

/**
 * 规则包静态检查：
 *  - 规则 ID 重复
 *  - 同一字段的资格数值门槛互相矛盾（上界 < 下界，或相等但含严格不等）
 *  - 负分规则 / 负上限
 *  - 上限指向不存在的评分类别
 */
export function detectConflicts(ruleset: Ruleset): RuleConflict[] {
  const conflicts: RuleConflict[] = [];

  const idCount = new Map<string, number>();
  for (const r of [...ruleset.eligibility, ...ruleset.scoring]) {
    idCount.set(r.id, (idCount.get(r.id) ?? 0) + 1);
  }
  for (const [id, n] of idCount) {
    if (n > 1) {
      conflicts.push({ severity: 'error', message: `规则 ID「${id}」重复出现 ${n} 次`, ruleIds: [id] });
    }
  }

  interface Bound {
    value: number;
    strict: boolean;
    ruleId: string;
  }
  const lowers = new Map<string, Bound[]>();
  const uppers = new Map<string, Bound[]>();
  for (const r of ruleset.eligibility) {
    const c = r.condition;
    if (typeof c.value !== 'number') continue;
    if (c.op === 'gt' || c.op === 'gte') {
      const list = lowers.get(c.field) ?? [];
      list.push({ value: c.value, strict: c.op === 'gt', ruleId: r.id });
      lowers.set(c.field, list);
    }
    if (c.op === 'lt' || c.op === 'lte') {
      const list = uppers.get(c.field) ?? [];
      list.push({ value: c.value, strict: c.op === 'lt', ruleId: r.id });
      uppers.set(c.field, list);
    }
  }
  for (const [field, lows] of lowers) {
    const ups = uppers.get(field);
    if (!ups) continue;
    const maxLower = lows.reduce((a, b) => (b.value > a.value ? b : a));
    const minUpper = ups.reduce((a, b) => (b.value < a.value ? b : a));
    const contradictory =
      maxLower.value > minUpper.value ||
      (maxLower.value === minUpper.value && (maxLower.strict || minUpper.strict));
    if (contradictory) {
      conflicts.push({
        severity: 'error',
        message: `字段「${field}」的资格门槛互相矛盾：需 ≥ ${maxLower.value}（${maxLower.ruleId}）且 ≤ ${minUpper.value}（${minUpper.ruleId}），没有申请人能同时满足`,
        ruleIds: [maxLower.ruleId, minUpper.ruleId],
      });
    }
  }

  for (const r of ruleset.scoring) {
    if (r.points < 0) {
      conflicts.push({ severity: 'error', message: `评分规则「${r.id}」分数为负（${r.points}）`, ruleIds: [r.id] });
    }
  }
  for (const c of ruleset.caps) {
    if (c.max < 0) {
      conflicts.push({ severity: 'error', message: `类别「${c.category}」的上限为负（${c.max}）`, ruleIds: [] });
    }
  }
  const categories = new Set(ruleset.scoring.map((r) => r.category));
  for (const c of ruleset.caps) {
    if (!categories.has(c.category)) {
      conflicts.push({
        severity: 'warning',
        message: `类别上限「${c.category}」没有任何对应的评分规则`,
        ruleIds: [],
      });
    }
  }
  return conflicts;
}
