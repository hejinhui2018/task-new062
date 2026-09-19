import type {
  Application,
  EligibilityRule,
  ReviewState,
  RuleSet,
  ScoringRule,
} from '../types';
import { evalCondition, type EvalContext, type Trace } from './conditions';
import { findDuplicateMaterials, type DuplicateGroup } from './duplicates';

export interface EvidenceIssue {
  ruleId: string;
  kind: string;
  reason: 'missing' | 'excluded';
}

export interface EligibilityItem {
  rule: EligibilityRule;
  passed: boolean;
  trace: Trace;
  missingEvidence: string[];
  evidenceWaived: boolean;
}

export interface ScoringItem {
  rule: ScoringRule;
  triggered: boolean;
  trace: Trace;
  missingEvidence: string[];
  evidenceWaived: boolean;
  /** 实际计入的分数（未触发或证据缺失时为 0）。 */
  awarded: number;
}

export interface CategoryTotal {
  awarded: number;
  cap: number | undefined;
  capped: number;
}

export interface ScoreReport {
  applicationId: string;
  eligible: boolean;
  eligibility: EligibilityItem[];
  items: ScoringItem[];
  categories: Record<string, CategoryTotal>;
  total: number;
  maxTotal: number;
  missingEvidence: EvidenceIssue[];
  duplicates: DuplicateGroup[];
  /** 被标记为“存疑”但仍被触发规则引用的材料 id。 */
  questionedInUse: string[];
}

function buildContext(app: Application, review: ReviewState | undefined): {
  ctx: EvalContext;
  excludedIds: Set<string>;
} {
  const excludedIds = new Set<string>();
  if (review) {
    for (const [materialId, status] of Object.entries(review.marks)) {
      if (status === 'excluded') excludedIds.add(materialId);
    }
  }
  const materialKinds = new Set(
    app.materials.filter((m) => !excludedIds.has(m.id)).map((m) => m.kind),
  );
  const fields: Record<string, Application['fields'][number]['value']> = {};
  for (const f of app.fields) fields[f.key] = f.value;
  return { ctx: { fields, materialKinds }, excludedIds };
}

function missingKinds(
  required: string[] | undefined,
  ctx: EvalContext,
  waived: boolean,
): string[] {
  if (waived || !required) return [];
  return required.filter((kind) => !ctx.materialKinds.has(kind));
}

/**
 * 评估一份申请：资格 + 分项得分 + 缺失证据 + 重复材料。
 * 纯函数，同样输入必然得到同样报告。
 */
export function evaluateApplication(
  app: Application,
  ruleSet: RuleSet,
  review?: ReviewState,
): ScoreReport {
  const { ctx, excludedIds } = buildContext(app, review);
  const waived = new Set(review?.waivedRules ?? []);

  // 资格
  const eligibility: EligibilityItem[] = ruleSet.eligibility.map((rule) => {
    const trace = evalCondition(rule.condition, ctx);
    const missing = missingKinds(rule.requiresEvidence, ctx, waived.has(rule.id));
    return {
      rule,
      trace,
      missingEvidence: missing,
      evidenceWaived: waived.has(rule.id) && (rule.requiresEvidence?.length ?? 0) > 0,
      passed: trace.passed && missing.length === 0,
    };
  });
  const eligible = eligibility.every((item) => item.passed);

  // 分项评分。缺失证据只在条件已触发时上报——即“申请人声称满足，却拿不出证明”；
  // 条件未触发的规则不要求证据，避免误报。
  const items: ScoringItem[] = ruleSet.scoring.map((rule) => {
    const trace = evalCondition(rule.condition, ctx);
    const triggered = trace.passed;
    const missing = triggered
      ? missingKinds(rule.requiresEvidence, ctx, waived.has(rule.id))
      : [];
    const awarded = triggered && missing.length === 0 ? rule.points : 0;
    return {
      rule,
      trace,
      triggered,
      missingEvidence: missing,
      evidenceWaived: waived.has(rule.id) && (rule.requiresEvidence?.length ?? 0) > 0,
      awarded,
    };
  });

  // 分项封顶
  const categories: Record<string, CategoryTotal> = {};
  for (const item of items) {
    const cat = item.rule.category;
    const entry = categories[cat] ?? {
      awarded: 0,
      cap: ruleSet.categoryCaps[cat],
      capped: 0,
    };
    entry.awarded += item.awarded;
    categories[cat] = entry;
  }
  let total = 0;
  for (const cat of Object.keys(categories)) {
    const entry = categories[cat];
    entry.capped = entry.cap === undefined ? entry.awarded : Math.min(entry.awarded, entry.cap);
    total += entry.capped;
  }

  // 理论满分
  const maxByCategory = new Map<string, number>();
  for (const rule of ruleSet.scoring) {
    maxByCategory.set(rule.category, (maxByCategory.get(rule.category) ?? 0) + rule.points);
  }
  let maxTotal = 0;
  for (const [cat, sum] of maxByCategory) {
    const cap = ruleSet.categoryCaps[cat];
    maxTotal += cap === undefined ? sum : Math.min(sum, cap);
  }

  // 缺失证据汇总（区分“从未提交”与“被评审排除”）
  const missingEvidence: EvidenceIssue[] = [];
  const collect = (ruleId: string, kinds: string[]) => {
    for (const kind of kinds) {
      const everSubmitted = app.materials.some((m) => m.kind === kind);
      const allExcluded =
        everSubmitted &&
        app.materials
          .filter((m) => m.kind === kind)
          .every((m) => excludedIds.has(m.id));
      missingEvidence.push({
        ruleId,
        kind,
        reason: everSubmitted && allExcluded ? 'excluded' : 'missing',
      });
    }
  };
  for (const item of eligibility) collect(item.rule.id, item.missingEvidence);
  for (const item of items) collect(item.rule.id, item.missingEvidence);

  // 重复材料（在未被排除的材料中检测）
  const effectiveMaterials = app.materials.filter((m) => !excludedIds.has(m.id));
  const duplicates = findDuplicateMaterials(effectiveMaterials);

  // 存疑材料：被触发规则引用、但评审人标了“存疑”
  const questionedIds = new Set(
    Object.entries(review?.marks ?? {})
      .filter(([, status]) => status === 'questioned')
      .map(([id]) => id),
  );
  const kindsInUse = new Set<string>();
  for (const item of items) {
    if (item.triggered) {
      for (const kind of item.rule.requiresEvidence ?? []) kindsInUse.add(kind);
    }
  }
  for (const item of eligibility) {
    for (const kind of item.rule.requiresEvidence ?? []) kindsInUse.add(kind);
  }
  const questionedInUse = app.materials
    .filter((m) => questionedIds.has(m.id) && kindsInUse.has(m.kind))
    .map((m) => m.id);

  return {
    applicationId: app.id,
    eligible,
    eligibility,
    items,
    categories,
    total,
    maxTotal,
    missingEvidence,
    duplicates,
    questionedInUse,
  };
}
