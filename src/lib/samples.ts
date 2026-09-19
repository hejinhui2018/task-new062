import type { Application, RuleSet } from '../types';

export const ROUNDS = ['初审', '复审', '终审'] as const;

/** 默认评审规则：本身无冲突，用于正常评审流程。 */
export const defaultRuleSet: RuleSet = {
  id: 'rs-2026-v1',
  name: '2026 年度奖学金评审规则',
  version: '1.0',
  categoryCaps: { 学业: 50, 实践: 40, 综合: 30 },
  eligibility: [
    {
      id: 'E1',
      description: '学业成绩达标（GPA ≥ 3.0）',
      condition: { op: 'cmp', field: 'academic.gpa', cmp: '>=', value: 3.0 },
    },
    {
      id: 'E2',
      description: '无处分记录',
      condition: { op: 'cmp', field: 'personal.disciplinary', cmp: '==', value: false },
    },
    {
      id: 'E3',
      description: '须提交成绩单',
      condition: { op: 'hasMaterial', kind: 'transcript' },
      requiresEvidence: ['transcript'],
    },
    {
      id: 'E4',
      description: '年龄不超过 28 周岁',
      condition: { op: 'cmp', field: 'personal.age', cmp: '<=', value: 28 },
    },
  ],
  scoring: [
    {
      id: 'S1',
      description: '学业优秀（GPA ≥ 3.7）',
      category: '学业',
      points: 30,
      condition: { op: 'cmp', field: 'academic.gpa', cmp: '>=', value: 3.7 },
    },
    {
      id: 'S2',
      description: '学业良好（3.3 ≤ GPA < 3.7）',
      category: '学业',
      points: 15,
      condition: {
        op: 'and',
        conditions: [
          { op: 'cmp', field: 'academic.gpa', cmp: '>=', value: 3.3 },
          { op: 'cmp', field: 'academic.gpa', cmp: '<', value: 3.7 },
        ],
      },
    },
    {
      id: 'S3',
      description: '志愿服务满 40 小时（须证明）',
      category: '实践',
      points: 20,
      condition: { op: 'cmp', field: 'practice.volunteer_hours', cmp: '>=', value: 40 },
      requiresEvidence: ['volunteer_proof'],
    },
    {
      id: 'S4',
      description: '科研或竞赛获奖（须证明）',
      category: '实践',
      points: 20,
      condition: { op: 'cmp', field: 'practice.has_award', cmp: '==', value: true },
      requiresEvidence: ['award_proof'],
    },
    {
      id: 'S5',
      description: '专家推荐信',
      category: '综合',
      points: 10,
      condition: { op: 'hasMaterial', kind: 'recommendation' },
      requiresEvidence: ['recommendation'],
    },
    {
      id: 'S6',
      description: '家庭经济困难认定（须证明）',
      category: '综合',
      points: 10,
      condition: { op: 'cmp', field: 'financial.need_based', cmp: '==', value: true },
      requiresEvidence: ['financial_aid_cert'],
    },
  ],
};

/**
 * 有缺陷的规则示例：用于演示规则冲突检测。
 * 包含重复 id、单规则自相矛盾、资格规则互相矛盾、未知字段、封顶溢出。
 */
export const flawedRuleSet: RuleSet = {
  id: 'rs-flawed-demo',
  name: '有缺陷的规则示例（演示冲突检测）',
  version: '0.1',
  categoryCaps: { 学业: 10 },
  eligibility: [
    {
      id: 'E1',
      description: 'GPA 不低于 3.5',
      condition: { op: 'cmp', field: 'academic.gpa', cmp: '>=', value: 3.5 },
    },
    {
      id: 'E2',
      description: 'GPA 低于 3.0',
      condition: { op: 'cmp', field: 'academic.gpa', cmp: '<', value: 3.0 },
    },
  ],
  scoring: [
    {
      id: 'S1',
      description: '学业加分 A',
      category: '学业',
      points: 25,
      condition: { op: 'cmp', field: 'academic.gpa', cmp: '>=', value: 3.0 },
    },
    {
      id: 'S1',
      description: '学业加分 B（id 与上一条重复）',
      category: '学业',
      points: 20,
      condition: { op: 'cmp', field: 'academic.gpa', cmp: '>=', value: 2.5 },
    },
    {
      id: 'S3',
      description: '永远触不到的加分（自相矛盾）',
      category: '学业',
      points: 5,
      condition: {
        op: 'and',
        conditions: [
          { op: 'cmp', field: 'academic.gpa', cmp: '>=', value: 3.5 },
          { op: 'cmp', field: 'academic.gpa', cmp: '<', value: 3.0 },
        ],
      },
    },
    {
      id: 'S4',
      description: '引用了不存在的托福字段',
      category: '学业',
      points: 5,
      condition: { op: 'cmp', field: 'academic.toefl', cmp: '>=', value: 90 },
    },
  ],
};

/**
 * 三份有意缺陷的内置申请：
 *  A-001 缺失证据（声称志愿服务却无证明、缺推荐信）
 *  A-002 重复材料（成绩单、推荐信各交了两份一模一样的）
 *  A-003 边界值 + 缺失字段 + PII 混入材料正文
 */
export const sampleApplications: Application[] = [
  {
    id: 'A-001',
    fields: [
      { key: 'applicant.name', label: '姓名', value: '王思远', pii: true },
      { key: 'applicant.student_id', label: '学号', value: '2023010101', pii: true },
      { key: 'contact.phone', label: '联系电话', value: '13800001234', pii: true },
      { key: 'academic.gpa', label: 'GPA', value: 3.8 },
      { key: 'practice.volunteer_hours', label: '志愿服务时长', value: 80 },
      { key: 'practice.has_award', label: '是否有获奖', value: true },
      { key: 'personal.disciplinary', label: '是否有处分', value: false },
      { key: 'personal.age', label: '年龄', value: 21 },
      { key: 'financial.need_based', label: '是否经济困难认定', value: false },
    ],
    materials: [
      {
        id: 'A001-M1',
        kind: 'transcript',
        title: '成绩单',
        content: '王思远 同学成绩单：GPA 3.8，专业排名前 5%。',
        submittedAt: '2026-03-01',
      },
      {
        id: 'A001-M2',
        kind: 'award_proof',
        title: '竞赛获奖证明',
        content: '兹证明王思远获得全国大学生数学建模竞赛二等奖。',
        submittedAt: '2026-03-01',
      },
    ],
  },
  {
    id: 'A-002',
    fields: [
      { key: 'applicant.name', label: '姓名', value: '李慕雪', pii: true },
      { key: 'applicant.student_id', label: '学号', value: '2022020202', pii: true },
      { key: 'contact.phone', label: '联系电话', value: '13700005678', pii: true },
      { key: 'academic.gpa', label: 'GPA', value: 3.0 },
      { key: 'practice.volunteer_hours', label: '志愿服务时长', value: 45 },
      { key: 'practice.has_award', label: '是否有获奖', value: false },
      { key: 'personal.disciplinary', label: '是否有处分', value: false },
      { key: 'personal.age', label: '年龄', value: 23 },
      { key: 'financial.need_based', label: '是否经济困难认定', value: true },
    ],
    materials: [
      {
        id: 'A002-M1',
        kind: 'transcript',
        title: '成绩单',
        content: '李慕雪 同学成绩单：GPA 3.0。',
        submittedAt: '2026-03-02',
      },
      {
        id: 'A002-M2',
        kind: 'transcript',
        title: '成绩单（补交）',
        content: '李慕雪 同学成绩单：GPA 3.0。',
        submittedAt: '2026-03-05',
      },
      {
        id: 'A002-M3',
        kind: 'recommendation',
        title: '专家推荐信',
        content: '推荐信：李慕雪同学学习刻苦，品行端正，特此推荐。',
        submittedAt: '2026-03-02',
      },
      {
        id: 'A002-M4',
        kind: 'recommendation',
        title: '专家推荐信（扫描件）',
        content: '推荐信：李慕雪同学学习刻苦，品行端正，特此推荐。',
        submittedAt: '2026-03-04',
      },
      {
        id: 'A002-M5',
        kind: 'volunteer_proof',
        title: '志愿服务证明',
        content: '兹证明李慕雪累计志愿服务 45 小时。',
        submittedAt: '2026-03-02',
      },
      {
        id: 'A002-M6',
        kind: 'financial_aid_cert',
        title: '家庭经济困难认定表',
        content: '经审核，李慕雪同学认定为家庭经济困难。',
        submittedAt: '2026-03-02',
      },
    ],
  },
  {
    id: 'A-003',
    fields: [
      { key: 'applicant.name', label: '姓名', value: '陈启铭', pii: true },
      { key: 'applicant.student_id', label: '学号', value: '2021030303', pii: true },
      { key: 'contact.phone', label: '联系电话', value: '13900005678', pii: true },
      { key: 'academic.gpa', label: 'GPA', value: 3.3 },
      { key: 'practice.volunteer_hours', label: '志愿服务时长', value: 40 },
      { key: 'practice.has_award', label: '是否有获奖', value: false },
      // 注意：缺少 personal.disciplinary 字段 —— 资格规则 E2 无法核验
      { key: 'personal.age', label: '年龄', value: 28 },
      { key: 'financial.need_based', label: '是否经济困难认定', value: false },
    ],
    materials: [
      {
        id: 'A003-M1',
        kind: 'transcript',
        title: '成绩单',
        content: '陈启铭 同学成绩单：GPA 3.3。如有疑问请联系 13900005678。',
        submittedAt: '2026-03-03',
      },
      {
        id: 'A003-M2',
        kind: 'volunteer_proof',
        title: '志愿服务证明',
        content: '兹证明陈启铭累计志愿服务 40 小时。',
        submittedAt: '2026-03-03',
      },
    ],
  },
];
