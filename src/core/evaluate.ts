import { detectConflicts, evalCondition } from './rules';
import type {
  AnonymizedApplication,
  CategoryScore,
  DuplicateGroup,
  EligibilityResult,
  EvaluationResult,
  Ruleset,
  ScoringTrace,
} from './types';

export interface EvaluateOptions {
  /** 被评审人标记为「存疑」的证据 id，这些证据不计入证据池 */
  flaggedEvidenceIds?: ReadonlySet<string>;
}

/**
 * 对匿名评审包执行规则评估。
 * 输出包含完整轨迹：每条规则是否触发、实际值、得分、被拦截原因，
 * 以及缺失证据、重复材料、规则冲突，保证结果可解释。
 */
export function evaluate(
  pkg: AnonymizedApplication,
  ruleset: Ruleset,
  opts: EvaluateOptions = {},
): EvaluationResult {
  const fieldMap = new Map(pkg.fields.map((f) => [f.key, f.value]));
  const flagged = opts.flaggedEvidenceIds ?? new Set<string>();
  const pool = pkg.evidence.filter((e) => !flagged.has(e.id));
  const poolTypes = new Set(pool.map((e) => e.type));

  const eligibility: EligibilityResult[] = ruleset.eligibility.map((rule) => {
    const trace = evalCondition(rule.condition, fieldMap);
    const missingEvidence = !!rule.requiredEvidence && !poolTypes.has(rule.requiredEvidence);
    return {
      ruleId: rule.id,
      description: rule.description,
      passed: trace.passed && !missingEvidence,
      trace,
      requiredEvidence: rule.requiredEvidence,
      missingEvidence,
    };
  });

  const scoring: ScoringTrace[] = ruleset.scoring.map((rule) => {
    const trace = evalCondition(rule.condition, fieldMap);
    const triggered = trace.passed;
    const evidenceMissing = !!rule.requiredEvidence && !poolTypes.has(rule.requiredEvidence);
    let pointsAwarded = 0;
    let blockedReason: string | undefined;
    if (triggered) {
      if (evidenceMissing) {
        blockedReason = `已触发但缺少证据材料「${rule.requiredEvidence}」，不计分`;
      } else {
        pointsAwarded = rule.points;
      }
    }
    return {
      ruleId: rule.id,
      category: rule.category,
      description: rule.description,
      triggered,
      pointsPossible: rule.points,
      pointsAwarded,
      trace,
      requiredEvidence: rule.requiredEvidence,
      blockedReason,
    };
  });

  const rawByCategory = new Map<string, number>();
  for (const s of scoring) {
    rawByCategory.set(s.category, (rawByCategory.get(s.category) ?? 0) + s.pointsAwarded);
  }
  const capMap = new Map(ruleset.caps.map((c) => [c.category, c.max]));
  const categories: CategoryScore[] = [...rawByCategory.entries()].map(([category, raw]) => {
    const cap = capMap.get(category) ?? null;
    const capped = cap === null ? raw : Math.min(raw, cap);
    return { category, raw, capped, cap, capApplied: cap !== null && raw > cap };
  });
  for (const c of ruleset.caps) {
    if (!rawByCategory.has(c.category)) {
      categories.push({ category: c.category, raw: 0, capped: 0, cap: c.max, capApplied: false });
    }
  }

  const total = categories.reduce((sum, c) => sum + c.capped, 0);

  const maxByCategory = new Map<string, number>();
  for (const r of ruleset.scoring) {
    maxByCategory.set(r.category, (maxByCategory.get(r.category) ?? 0) + Math.max(0, r.points));
  }
  let maxTotal = 0;
  for (const [category, sum] of maxByCategory) {
    const cap = capMap.get(category);
    maxTotal += cap === undefined ? sum : Math.min(sum, cap);
  }

  const byHash = new Map<string, { ids: string[]; types: string[] }>();
  for (const e of pkg.evidence) {
    const group = byHash.get(e.contentHash) ?? { ids: [], types: [] };
    group.ids.push(e.id);
    if (!group.types.includes(e.type)) group.types.push(e.type);
    byHash.set(e.contentHash, group);
  }
  const duplicates: DuplicateGroup[] = [...byHash.entries()]
    .filter(([, g]) => g.ids.length > 1)
    .map(([hash, g]) => ({ contentHash: hash, evidenceIds: g.ids, types: g.types }));

  const missingEvidence = [
    ...new Set(
      [
        ...eligibility.filter((e) => e.missingEvidence).map((e) => e.requiredEvidence),
        ...scoring.filter((s) => s.blockedReason).map((s) => s.requiredEvidence),
      ].filter((t): t is string => !!t),
    ),
  ];

  return {
    alias: pkg.alias,
    eligible: eligibility.every((e) => e.passed),
    eligibility,
    scoring,
    categories,
    total,
    maxTotal,
    missingEvidence,
    duplicates,
    conflicts: detectConflicts(ruleset),
  };
}
