import { contentHash, stableHash } from './hash';
import type { AnonymizedApplication, Application, ApplicationField } from './types';

/**
 * 匿名编号：只由「申请人 ID + 轮次盐值」决定，
 * 与字段顺序、字段内容无关；同一申请人在不同轮次编号不同。
 */
export function applicantAlias(applicationId: string, salt: string): string {
  return 'A-' + stableHash(`${salt}::${applicationId}`).slice(0, 6).toUpperCase();
}

export const REDACTED = '[已隐去]';

/** 常见 PII 文本模式：邮箱 / 手机号 / 身份证号 */
const PII_PATTERNS: RegExp[] = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  /(?<!\d)1[3-9]\d{9}(?!\d)/g,
  /(?<!\d)\d{17}[\dXx](?!\d)/g,
];

/**
 * 文本脱敏：先替换已声明的 PII 字段值（长值优先，长度相同按字典序，
 * 保证与字段出现顺序无关），再替换邮箱/手机号/身份证号等模式。
 */
export function redactText(text: string, piiValues: string[]): { text: string; count: number } {
  let out = text;
  let count = 0;
  const values = [...new Set(piiValues.map((v) => v.trim()).filter((v) => v.length >= 2))].sort(
    (a, b) => b.length - a.length || compareStr(a, b),
  );
  for (const value of values) {
    const parts = out.split(value);
    if (parts.length > 1) {
      count += parts.length - 1;
      out = parts.join(REDACTED);
    }
  }
  for (const re of PII_PATTERNS) {
    out = out.replace(re, () => {
      count += 1;
      return REDACTED;
    });
  }
  return { text: out, count };
}

function compareStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 生成匿名评审包。
 * 顺序无关性保证：
 *  - PII 判定 = 规则包 piiFields ∪ 字段 pii 标记（按 key 匹配，与位置无关）
 *  - 输出字段按 key 排序、证据按 id 排序（规范化输出顺序）
 *  - 匿名编号只依赖申请人 ID 与轮次盐值
 */
export function anonymizeApplication(
  app: Application,
  piiFields: string[],
  salt: string,
): AnonymizedApplication {
  const piiKeys = new Set(piiFields);
  const isPii = (f: ApplicationField) => piiKeys.has(f.key) || f.pii === true;

  const piiValues = app.fields
    .filter((f) => isPii(f) && typeof f.value === 'string')
    .map((f) => f.value as string);

  let redactions = 0;

  const fields = app.fields
    .filter((f) => !isPii(f))
    .map((f) => {
      if (typeof f.value === 'string') {
        const r = redactText(f.value, piiValues);
        redactions += r.count;
        return { key: f.key, label: f.label, value: r.text };
      }
      return { key: f.key, label: f.label, value: f.value };
    })
    .sort((a, b) => compareStr(a.key, b.key));

  const evidence = app.evidence
    .map((e) => {
      const title = redactText(e.title, piiValues);
      const content = redactText(e.content, piiValues);
      redactions += title.count + content.count;
      return {
        id: e.id,
        type: e.type,
        title: title.text,
        content: content.text,
        contentHash: contentHash(e.content),
      };
    })
    .sort((a, b) => compareStr(a.id, b.id));

  return {
    alias: applicantAlias(app.id, salt),
    sourceId: app.id,
    submittedAt: app.submittedAt,
    fields,
    evidence,
    redactions,
  };
}
