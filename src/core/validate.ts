import type { Application, ApplicationField, ConditionOp, EvidenceItem, Ruleset } from './types';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const OPS: ConditionOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'exists', 'notExists'];

function fail<T>(error: string): Result<T> {
  return { ok: false, error };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFieldValue(v: unknown): boolean {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v);
}

function parseField(v: unknown, where: string): Result<ApplicationField> {
  if (!isRecord(v)) return fail(`${where}：字段必须是对象`);
  if (typeof v.key !== 'string' || !v.key) return fail(`${where}：缺少 key`);
  if (typeof v.label !== 'string') return fail(`${where}（${v.key}）：缺少 label`);
  if (!isFieldValue(v.value)) return fail(`${where}（${v.key}）：value 必须是字符串/数值/布尔/null`);
  return {
    ok: true,
    value: {
      key: v.key,
      label: v.label,
      value: v.value as ApplicationField['value'],
      ...(v.pii === true ? { pii: true } : {}),
    },
  };
}

function parseEvidence(v: unknown, where: string): Result<EvidenceItem> {
  if (!isRecord(v)) return fail(`${where}：材料必须是对象`);
  for (const k of ['id', 'type', 'title', 'content'] as const) {
    if (typeof v[k] !== 'string' || !v[k]) return fail(`${where}：缺少 ${k}`);
  }
  return {
    ok: true,
    value: { id: v.id as string, type: v.type as string, title: v.title as string, content: v.content as string },
  };
}

/** 解析并校验导入的申请材料 JSON（单个对象或数组） */
export function parseApplicationsJson(text: string): Result<Application[]> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return fail(`JSON 解析失败：${(e as Error).message}`);
  }
  const list = Array.isArray(data) ? data : [data];
  if (list.length === 0) return fail('未包含任何申请');

  const apps: Application[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < list.length; i++) {
    const where = `第 ${i + 1} 份申请`;
    const item = list[i];
    if (!isRecord(item)) return fail(`${where}：必须是对象`);
    if (typeof item.id !== 'string' || !item.id) return fail(`${where}：缺少 id`);
    if (ids.has(item.id)) return fail(`${where}：id「${item.id}」重复`);
    ids.add(item.id);
    if (!Array.isArray(item.fields)) return fail(`${where}：fields 必须是数组`);
    if (!Array.isArray(item.evidence)) return fail(`${where}：evidence 必须是数组`);

    const fields: ApplicationField[] = [];
    for (let j = 0; j < item.fields.length; j++) {
      const r = parseField(item.fields[j], `${where} 字段 #${j + 1}`);
      if (!r.ok) return r;
      fields.push(r.value);
    }
    const evidence: EvidenceItem[] = [];
    const evIds = new Set<string>();
    for (let j = 0; j < item.evidence.length; j++) {
      const r = parseEvidence(item.evidence[j], `${where} 材料 #${j + 1}`);
      if (!r.ok) return r;
      if (evIds.has(r.value.id)) return fail(`${where}：材料 id「${r.value.id}」重复`);
      evIds.add(r.value.id);
      evidence.push(r.value);
    }
    apps.push({
      id: item.id,
      submittedAt: typeof item.submittedAt === 'string' ? item.submittedAt : '',
      fields,
      evidence,
    });
  }
  return { ok: true, value: apps };
}

function parseCondition(v: unknown, where: string): Result<{ field: string; op: ConditionOp; value?: unknown }> {
  if (!isRecord(v)) return fail(`${where}：condition 必须是对象`);
  if (typeof v.field !== 'string' || !v.field) return fail(`${where}：condition 缺少 field`);
  if (typeof v.op !== 'string' || !OPS.includes(v.op as ConditionOp)) {
    return fail(`${where}：condition.op 必须是 ${OPS.join(' / ')}`);
  }
  return { ok: true, value: { field: v.field, op: v.op as ConditionOp, value: v.value } };
}

/** 解析并校验导入的规则包 JSON */
export function parseRulesetJson(text: string): Result<Ruleset> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return fail(`JSON 解析失败：${(e as Error).message}`);
  }
  if (!isRecord(data)) return fail('规则包必须是对象');
  if (typeof data.id !== 'string' || !data.id) return fail('规则包缺少 id');
  if (typeof data.name !== 'string' || !data.name) return fail('规则包缺少 name');
  if (!Array.isArray(data.piiFields) || !data.piiFields.every((x) => typeof x === 'string')) {
    return fail('piiFields 必须是字符串数组');
  }
  if (!Array.isArray(data.eligibility)) return fail('eligibility 必须是数组');
  if (!Array.isArray(data.scoring)) return fail('scoring 必须是数组');
  if (!Array.isArray(data.caps)) return fail('caps 必须是数组');

  const eligibility: Ruleset['eligibility'] = [];
  for (let i = 0; i < data.eligibility.length; i++) {
    const where = `资格规则 #${i + 1}`;
    const r = data.eligibility[i];
    if (!isRecord(r)) return fail(`${where}：必须是对象`);
    if (typeof r.id !== 'string' || !r.id) return fail(`${where}：缺少 id`);
    if (typeof r.description !== 'string') return fail(`${where}（${r.id}）：缺少 description`);
    const cond = parseCondition(r.condition, `${where}（${r.id}）`);
    if (!cond.ok) return cond;
    eligibility.push({
      id: r.id,
      description: r.description,
      condition: cond.value as Ruleset['eligibility'][number]['condition'],
      ...(typeof r.requiredEvidence === 'string' ? { requiredEvidence: r.requiredEvidence } : {}),
    });
  }

  const scoring: Ruleset['scoring'] = [];
  for (let i = 0; i < data.scoring.length; i++) {
    const where = `评分规则 #${i + 1}`;
    const r = data.scoring[i];
    if (!isRecord(r)) return fail(`${where}：必须是对象`);
    if (typeof r.id !== 'string' || !r.id) return fail(`${where}：缺少 id`);
    if (typeof r.category !== 'string' || !r.category) return fail(`${where}（${r.id}）：缺少 category`);
    if (typeof r.description !== 'string') return fail(`${where}（${r.id}）：缺少 description`);
    if (typeof r.points !== 'number' || Number.isNaN(r.points)) return fail(`${where}（${r.id}）：points 必须是数值`);
    const cond = parseCondition(r.condition, `${where}（${r.id}）`);
    if (!cond.ok) return cond;
    scoring.push({
      id: r.id,
      category: r.category,
      description: r.description,
      points: r.points,
      condition: cond.value as Ruleset['scoring'][number]['condition'],
      ...(typeof r.requiredEvidence === 'string' ? { requiredEvidence: r.requiredEvidence } : {}),
    });
  }

  const caps: Ruleset['caps'] = [];
  for (let i = 0; i < data.caps.length; i++) {
    const where = `类别上限 #${i + 1}`;
    const c = data.caps[i];
    if (!isRecord(c)) return fail(`${where}：必须是对象`);
    if (typeof c.category !== 'string' || !c.category) return fail(`${where}：缺少 category`);
    if (typeof c.max !== 'number' || Number.isNaN(c.max)) return fail(`${where}（${c.category}）：max 必须是数值`);
    caps.push({ category: c.category, max: c.max });
  }

  return {
    ok: true,
    value: {
      id: data.id,
      name: data.name,
      version: typeof data.version === 'number' ? data.version : 1,
      piiFields: data.piiFields as string[],
      eligibility,
      scoring,
      caps,
    },
  };
}
