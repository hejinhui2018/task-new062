import type { Application, FieldValue } from '../types';
import { fnv1a } from './hash';

export interface AnonymizedField {
  key: string;
  label: string;
  value: FieldValue;
  pii: boolean;
}

export interface AnonymizedMaterial {
  id: string;
  kind: string;
  title: string;
  content: string;
}

export interface AnonymizedPackage {
  /** 申请人化名，如 申请人-3F2A9C。 */
  applicantRef: string;
  /** 输出字段按 key 排序——与导入时的字段顺序无关。 */
  fields: AnonymizedField[];
  /** 输出材料按 id 排序。 */
  materials: AnonymizedMaterial[];
  /** 整个评审包的内容指纹，可用于核对两次生成是否一致。 */
  digest: string;
  piiFieldCount: number;
  /** 材料正文中被替换掉的 PII 出现次数。 */
  replacements: number;
}

const ALIAS_PREFIX = '匿名#';

function aliasFor(value: FieldValue): string {
  return `[${ALIAS_PREFIX}${fnv1a(String(value)).slice(0, 6)}]`;
}

/**
 * 判断一个 PII 值是否值得在正文中替换：
 * 过短的串（单字、布尔值字面量）误伤太大，跳过。
 */
function isReplaceable(value: FieldValue): value is string | number {
  if (typeof value === 'string') return value.trim().length >= 2;
  if (typeof value === 'number') return String(value).length >= 4;
  return false;
}

/**
 * 生成匿名评审包。
 *
 * 顺序无关性保证：
 *  - 化名种子来自「按 key 排序后的 PII 键值对」，与字段在数组中的顺序无关；
 *  - 输出字段按 key 排序、材料按 id 排序；
 *  - 替换表按「长度降序 + 字典序」排序，替换顺序确定。
 * 因此同一份申请无论如何打乱字段/材料顺序，生成的评审包逐字节一致。
 */
export function anonymizeApplication(app: Application): AnonymizedPackage {
  const piiFields = app.fields.filter((f) => f.pii);

  // 1. 申请人化名：内容寻址，而非位置寻址
  const seed = [...piiFields]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((f) => `${f.key}=${String(f.value)}`)
    .join('|');
  const applicantRef = `申请人-${fnv1a(seed).slice(0, 6).toUpperCase()}`;

  // 2. PII 原文 -> 化名 的替换表（同一原文值在任何位置都得到同一化名）
  const rawValues = new Map<string, string>(); // 原文 -> 化名
  for (const f of piiFields) {
    if (isReplaceable(f.value)) {
      rawValues.set(String(f.value), aliasFor(f.value));
    }
  }
  const replacementTable = [...rawValues.entries()].sort(
    (a, b) => b[0].length - a[0].length || (a[0] < b[0] ? -1 : 1),
  );

  let replacements = 0;
  const scrub = (text: string): string => {
    let out = text;
    for (const [raw, alias] of replacementTable) {
      if (out.includes(raw)) {
        const occurrences = out.split(raw).length - 1;
        replacements += occurrences;
        out = out.split(raw).join(alias);
      }
    }
    return out;
  };

  // 3. 字段：PII 字段整体替换为化名；普通文本字段也过一遍替换表（正文里可能混有姓名电话）
  const fields: AnonymizedField[] = app.fields
    .map((f) => {
      if (f.pii) {
        return { key: f.key, label: f.label, value: aliasFor(f.value), pii: true };
      }
      const value = typeof f.value === 'string' ? scrub(f.value) : f.value;
      return { key: f.key, label: f.label, value, pii: false };
    })
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  // 4. 材料：标题与正文都脱敏
  const materials: AnonymizedMaterial[] = app.materials
    .map((m) => ({
      id: m.id,
      kind: m.kind,
      title: scrub(m.title),
      content: scrub(m.content),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const digest = fnv1a(JSON.stringify({ applicantRef, fields, materials }));

  return {
    applicantRef,
    fields,
    materials,
    digest,
    piiFieldCount: piiFields.length,
    replacements,
  };
}
