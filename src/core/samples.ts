import type { Application, RoundState, Ruleset } from './types';

/**
 * 内置评审规则包（干净版本）。
 * 满分 90：学业 30 + 公益服务 25 + 申请材料 10 + 经济状况 25。
 */
export function sampleRuleset(): Ruleset {
  return {
    id: 'scholarship-2026-spring',
    name: '2026 春季助学金评审规则',
    version: 3,
    piiFields: ['name', 'idNumber', 'phone', 'email', 'address'],
    eligibility: [
      {
        id: 'E1',
        description: '全日制在读学生',
        condition: { field: 'fullTime', op: 'eq', value: true },
      },
      {
        id: 'E2',
        description: 'GPA 不低于 3.2，且须提交成绩单',
        condition: { field: 'gpa', op: 'gte', value: 3.2 },
        requiredEvidence: 'transcript',
      },
      {
        id: 'E3',
        description: '家庭年收入不超过 80000 元，且须提交收入证明',
        condition: { field: 'householdIncome', op: 'lte', value: 80000 },
        requiredEvidence: 'income_proof',
      },
    ],
    scoring: [
      {
        id: 'S1',
        category: '学业',
        description: 'GPA ≥ 3.8（学业优秀）',
        condition: { field: 'gpa', op: 'gte', value: 3.8 },
        points: 30,
      },
      {
        id: 'S2',
        category: '学业',
        description: 'GPA ≥ 3.5（学业良好）',
        condition: { field: 'gpa', op: 'gte', value: 3.5 },
        points: 15,
      },
      {
        id: 'S3',
        category: '公益服务',
        description: '志愿服务满 100 小时（须附志愿证明）',
        condition: { field: 'volunteerHours', op: 'gte', value: 100 },
        points: 20,
        requiredEvidence: 'volunteer_proof',
      },
      {
        id: 'S4',
        category: '公益服务',
        description: '担任学生组织负责人（须附推荐信）',
        condition: { field: 'leadershipRole', op: 'eq', value: true },
        points: 10,
        requiredEvidence: 'recommendation',
      },
      {
        id: 'S5',
        category: '申请材料',
        description: '按时提交完整申请文书',
        condition: { field: 'essaySubmitted', op: 'eq', value: true },
        points: 10,
      },
      {
        id: 'S6',
        category: '经济状况',
        description: '家庭年收入 ≤ 50000 元（困难加分，须附收入证明）',
        condition: { field: 'householdIncome', op: 'lte', value: 50000 },
        points: 25,
        requiredEvidence: 'income_proof',
      },
    ],
    caps: [
      { category: '学业', max: 30 },
      { category: '公益服务', max: 25 },
      { category: '申请材料', max: 10 },
      { category: '经济状况', max: 25 },
    ],
  };
}

/**
 * 三份有意缺陷的示例申请：
 *  - APP-2026-001：文书与证据中混入姓名/邮箱/手机号/身份证号（检验脱敏），
 *    声称志愿服务 120 小时却未附志愿证明（缺失证据，S3 被拦截），学业分触发封顶。
 *  - APP-2026-002：GPA 恰好压在 3.2 门槛、志愿时长恰好 100 小时（规则边界），
 *    成绩单重复提交（重复材料），家庭年收入 96000 超出资格线（资格不符）。
 *  - APP-2026-003：缺少 fullTime 字段（字段缺失 → E1 不通过并给出说明），
 *    推荐信中留有推荐人手机号（模式脱敏）。
 */
export function sampleApplications(): Application[] {
  return [
    {
      id: 'APP-2026-001',
      submittedAt: '2026-03-02T09:14:00+08:00',
      fields: [
        { key: 'name', label: '姓名', value: '林晓', pii: true },
        { key: 'idNumber', label: '身份证号', value: '110101200401023316', pii: true },
        { key: 'email', label: '邮箱', value: 'linxiao@example.edu.cn', pii: true },
        { key: 'phone', label: '手机号', value: '13812345678', pii: true },
        { key: 'fullTime', label: '全日制在读', value: true },
        { key: 'gpa', label: 'GPA', value: 3.9 },
        { key: 'volunteerHours', label: '志愿服务时长(小时)', value: 120 },
        { key: 'leadershipRole', label: '学生组织负责人', value: false },
        { key: 'essaySubmitted', label: '已提交申请文书', value: true },
        { key: 'householdIncome', label: '家庭年收入(元)', value: 45000 },
        {
          key: 'essay',
          label: '申请文书',
          value:
            '我是林晓，来自西部小城的普通家庭。三年来我坚持每周末到社区图书馆做义工，累计服务 120 小时，' +
            '深知教育对改变命运的意义。如需核实情况，请联系我：linxiao@example.edu.cn，电话 13812345678，' +
            '身份证号 110101200401023316 备查。',
        },
      ],
      evidence: [
        {
          id: 'A-EV-1',
          type: 'transcript',
          title: '本科成绩单',
          content: '林晓同学本科前三学年加权平均绩点 3.9/4.0，专业排名 2/87。',
        },
        {
          id: 'A-EV-2',
          type: 'income_proof',
          title: '家庭收入证明',
          content: '兹证明林晓家庭上年度总收入为人民币 45000 元。',
        },
        // 注意：缺少 volunteer_proof —— 缺失证据
      ],
    },
    {
      id: 'APP-2026-002',
      submittedAt: '2026-03-03T14:40:00+08:00',
      fields: [
        { key: 'name', label: '姓名', value: '陈国强', pii: true },
        { key: 'idNumber', label: '身份证号', value: '310101200305214421', pii: true },
        { key: 'email', label: '邮箱', value: 'chen.gq@example.com', pii: true },
        { key: 'phone', label: '手机号', value: '13987654321', pii: true },
        { key: 'address', label: '家庭住址', value: '上海市黄浦区复兴中路 12 号', pii: true },
        { key: 'fullTime', label: '全日制在读', value: true },
        { key: 'gpa', label: 'GPA', value: 3.2 },
        { key: 'volunteerHours', label: '志愿服务时长(小时)', value: 100 },
        { key: 'leadershipRole', label: '学生组织负责人', value: false },
        { key: 'essaySubmitted', label: '已提交申请文书', value: true },
        { key: 'householdIncome', label: '家庭年收入(元)', value: 96000 },
        {
          key: 'essay',
          label: '申请文书',
          value: '我来自上海，父母均为退休职工。大学期间我坚持参加社区志愿服务，累计 100 小时。',
        },
      ],
      evidence: [
        {
          id: 'B-EV-1',
          type: 'transcript',
          title: '成绩单（扫描件）',
          content: '陈国强同学 2025-2026 学年成绩单：平均绩点 3.2。',
        },
        {
          id: 'B-EV-2',
          type: 'transcript',
          title: '成绩单（补交）',
          content: '陈国强同学 2025-2026 学年成绩单：平均绩点 3.2。',
        },
        {
          id: 'B-EV-3',
          type: 'volunteer_proof',
          title: '志愿服务证明',
          content: '兹证明陈国强同学本年度累计志愿服务 100 小时。',
        },
        {
          id: 'B-EV-4',
          type: 'income_proof',
          title: '家庭收入证明',
          content: '兹证明陈国强家庭年收入 96000 元。',
        },
      ],
    },
    {
      id: 'APP-2026-003',
      submittedAt: '2026-03-04T20:02:00+08:00',
      fields: [
        { key: 'name', label: '姓名', value: '周敏', pii: true },
        { key: 'idNumber', label: '身份证号', value: '44010120040214452X', pii: true },
        { key: 'email', label: '邮箱', value: 'zhoumin@example.org', pii: true },
        { key: 'phone', label: '手机号', value: '13711112222', pii: true },
        // 注意：缺少 fullTime 字段 —— 资格规则将按「字段缺失」处理
        { key: 'gpa', label: 'GPA', value: 3.6 },
        { key: 'volunteerHours', label: '志愿服务时长(小时)', value: 80 },
        { key: 'leadershipRole', label: '学生组织负责人', value: true },
        { key: 'essaySubmitted', label: '已提交申请文书', value: true },
        { key: 'householdIncome', label: '家庭年收入(元)', value: 60000 },
        {
          key: 'essay',
          label: '申请文书',
          value: '我担任校志愿者协会会长，组织过 12 场社区服务活动，希望继续完成学业。',
        },
      ],
      evidence: [
        {
          id: 'C-EV-1',
          type: 'transcript',
          title: '本科成绩单',
          content: '周敏同学本科成绩单：平均绩点 3.6。',
        },
        {
          id: 'C-EV-2',
          type: 'recommendation',
          title: '推荐信',
          content: '推荐周敏同学：担任校志愿者协会会长，组织活动 12 场。—— 推荐人 王老师，联系电话 13900001111',
        },
        {
          id: 'C-EV-3',
          type: 'income_proof',
          title: '家庭收入证明',
          content: '兹证明周敏家庭年收入 60000 元。',
        },
      ],
    },
  ];
}

/** 含冲突的规则包示例：重复规则 ID、矛盾的 GPA 门槛、负分规则、悬空类别上限 */
export function conflictedRuleset(): Ruleset {
  const base = sampleRuleset();
  return {
    ...base,
    id: 'scholarship-2026-spring-conflicted',
    name: '2026 春季助学金评审规则（含冲突示例）',
    eligibility: [
      ...base.eligibility,
      {
        id: 'E9',
        description: '特殊通道：GPA 低于 3.0 也可申请',
        condition: { field: 'gpa', op: 'lt', value: 3.0 },
      },
    ],
    scoring: [
      ...base.scoring,
      {
        id: 'S2',
        category: '学业',
        description: '重复 ID 示例规则',
        condition: { field: 'gpa', op: 'gte', value: 3.0 },
        points: 5,
      },
      {
        id: 'S8',
        category: '学业',
        description: '负分示例规则',
        condition: { field: 'gpa', op: 'lt', value: 2.0 },
        points: -10,
      },
    ],
    caps: [...base.caps, { category: '体育', max: 10 }],
  };
}

export function defaultRounds(): RoundState[] {
  return [
    { id: 'round-1', name: '第一轮 · 初审', salt: 'grantkit-round-1', marks: {} },
    { id: 'round-2', name: '第二轮 · 复审', salt: 'grantkit-round-2', marks: {} },
  ];
}
