/**
 * 稳定的字符串散列（FNV-1a，32 位）。
 * 不依赖任何运行时 API，浏览器与 Node 结果一致，用于匿名化名与内容指纹。
 */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
