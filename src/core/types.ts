// ---------- 申请材料 ----------

export type FieldValue = string | number | boolean | null;

export interface ApplicationField {
  key: string;
  label: string;
  value: FieldValue;
  /** 数据源自带的 PII 标记；与规则包 piiFields 取并集，二者都不依赖字段顺序 */
  pii?: boolean;
}

export interface EvidenceItem {
  id: string;
  type: string;
  title: string;
  content: string;
}

export interface Application {
  id: string;
  submittedAt: string;
  fields: ApplicationField[];
  evidence: EvidenceItem[];
}

// ---------- 规则包 ----------

export type ConditionOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'contains'
  | 'exists'
  | 'notExists';

export interface Condition {
  field: string;
  op: ConditionOp;
  value?: FieldValue | FieldValue[];
}

export interface EligibilityRule {
  id: string;
  description: string;
  condition: Condition;
  /** 该资格成立所必需的材料类型 */
  requiredEvidence?: string;
}

export interface ScoringRule {
  id: string;
  category: string;
  description: string;
  condition: Condition;
  points: number;
  /** 触发后必须出具的材料类型，缺失则拦截该得分 */
  requiredEvidence?: string;
}

export interface CategoryCap {
  category: string;
  max: number;
}

export interface Ruleset {
  id: string;
  name: string;
  version: number;
  piiFields: string[];
  eligibility: EligibilityRule[];
  scoring: ScoringRule[];
  caps: CategoryCap[];
}

// ---------- 匿名评审包 ----------

export interface AnonField {
  key: string;
  label: string;
  value: FieldValue;
}

export interface AnonEvidence {
  id: string;
  type: string;
  title: string;
  content: string;
  /** 原始内容的规范化哈希，用于重复材料检测（不泄露原文） */
  contentHash: string;
}

export interface AnonymizedApplication {
  alias: string;
  /** 仅工作台内部关联用，导出评审包时剔除 */
  sourceId: string;
  submittedAt: string;
  fields: AnonField[];
  evidence: AnonEvidence[];
  /** 本次脱敏替换次数，便于审计 */
  redactions: number;
}

// ---------- 评估结果（可解释） ----------

export interface ConditionTrace {
  field: string;
  op: ConditionOp;
  expected: FieldValue | FieldValue[] | undefined;
  actual: FieldValue | undefined;
  passed: boolean;
  note?: string;
}

export interface EligibilityResult {
  ruleId: string;
  description: string;
  passed: boolean;
  trace: ConditionTrace;
  requiredEvidence?: string;
  missingEvidence: boolean;
}

export interface ScoringTrace {
  ruleId: string;
  category: string;
  description: string;
  triggered: boolean;
  pointsPossible: number;
  pointsAwarded: number;
  trace: ConditionTrace;
  requiredEvidence?: string;
  blockedReason?: string;
}

export interface CategoryScore {
  category: string;
  raw: number;
  capped: number;
  cap: number | null;
  capApplied: boolean;
}

export interface DuplicateGroup {
  contentHash: string;
  evidenceIds: string[];
  types: string[];
}

export interface RuleConflict {
  severity: 'error' | 'warning';
  message: string;
  ruleIds: string[];
}

export interface EvaluationResult {
  alias: string;
  eligible: boolean;
  eligibility: EligibilityResult[];
  scoring: ScoringTrace[];
  categories: CategoryScore[];
  total: number;
  maxTotal: number;
  missingEvidence: string[];
  duplicates: DuplicateGroup[];
  conflicts: RuleConflict[];
}

// ---------- 评审状态 ----------

export type EvidenceMark = 'verified' | 'flagged';

export interface ReviewMark {
  evidenceId: string;
  mark: EvidenceMark;
}

export interface RoundState {
  id: string;
  name: string;
  /** 每轮独立的匿名化盐值：同一申请人在不同轮次的匿名编号不同 */
  salt: string;
  /** applicantId -> 该轮评审标记 */
  marks: Record<string, ReviewMark[]>;
}

/** 可撤销、可快照、可持久化的会话状态 */
export interface SessionState {
  applications: Application[];
  ruleset: Ruleset;
  rounds: RoundState[];
  activeRoundId: string;
}

export interface Snapshot {
  id: string;
  name: string;
  createdAt: string;
  state: SessionState;
}
