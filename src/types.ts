/** 全域类型定义：申请材料、规则、评审状态。 */

export type FieldValue = string | number | boolean;

/** 申请表中的一个字段。pii=true 表示属于个人身份信息，匿名化时会被替换。 */
export interface ApplicationField {
  key: string;
  label: string;
  value: FieldValue;
  pii?: boolean;
}

/** 一份上传的证明材料。 */
export interface Material {
  id: string;
  /** 材料类别，如 transcript / volunteer_proof / recommendation，供规则引用。 */
  kind: string;
  title: string;
  content: string;
  submittedAt: string;
}

export interface Application {
  id: string;
  fields: ApplicationField[];
  materials: Material[];
}

export type CmpOp = '>' | '>=' | '<' | '<=' | '==' | '!=';

/** 规则条件 DSL：可嵌套的与/或/非 + 字段比较 + 材料存在性。 */
export type Condition =
  | { op: 'cmp'; field: string; cmp: CmpOp; value: FieldValue }
  | { op: 'contains'; field: string; value: string }
  | { op: 'exists'; field: string }
  | { op: 'hasMaterial'; kind: string }
  | { op: 'and'; conditions: Condition[] }
  | { op: 'or'; conditions: Condition[] }
  | { op: 'not'; condition: Condition };

/** 资格规则：条件满足且所需证据齐全才算通过。 */
export interface EligibilityRule {
  id: string;
  description: string;
  condition: Condition;
  /** 必须提交的材料类别，缺失则该条资格不通过。 */
  requiresEvidence?: string[];
}

/** 分项评分规则：触发即得分，但证据缺失时不得分。 */
export interface ScoringRule {
  id: string;
  description: string;
  /** 分项类别，如 学业 / 实践 / 综合。 */
  category: string;
  points: number;
  condition: Condition;
  requiresEvidence?: string[];
}

export interface RuleSet {
  id: string;
  name: string;
  version: string;
  /** 各分项类别的封顶分。 */
  categoryCaps: Record<string, number>;
  eligibility: EligibilityRule[];
  scoring: ScoringRule[];
}

export type MarkStatus = 'unmarked' | 'verified' | 'questioned' | 'excluded';

/** 某位评审人在某轮次对某份申请的评审状态。 */
export interface ReviewState {
  /** materialId -> 标记 */
  marks: Record<string, MarkStatus>;
  /** 被豁免证据要求的规则 id。 */
  waivedRules: string[];
  comment: string;
}

/** 工作台“文档”：可撤销/重做、可快照、可持久化的部分。 */
export interface DocState {
  applications: Application[];
  ruleSet: RuleSet;
  rounds: string[];
  activeRound: string;
  selectedApplicationId: string | null;
  /** 键为 `${round}::${applicationId}`。 */
  reviews: Record<string, ReviewState>;
}

export interface Snapshot {
  id: string;
  name: string;
  createdAt: string;
  doc: DocState;
}
