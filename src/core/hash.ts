/**
 * 稳定的字符串哈希（FNV-1a 变体，双通道混合）。
 * 只依赖输入字符串本身，与运行环境、字段顺序无关。
 */
export function stableHash(input: string): string {
  let h1 = 0x811c9dc5 >>> 0;
  let h2 = 0xdeadbeef >>> 0;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = (Math.imul(h2 ^ c, 0x85ebca6b) + (h1 & 0xff)) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/** 规范化文本：折叠空白、统一小写，用于重复材料检测 */
export function normalizeContent(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** 材料内容哈希：对规范化后的原文计算，空白/大小写差异不影响结果 */
export function contentHash(text: string): string {
  return stableHash(normalizeContent(text));
}
