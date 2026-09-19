import type { Material } from '../types';
import { fnv1a } from './hash';

/** 规范化材料内容：压缩空白、统一小写，使“内容相同、排版不同”也能识别为重复。 */
export function normalizeContent(content: string): string {
  return content.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function contentHash(content: string): string {
  return fnv1a(normalizeContent(content));
}

export interface DuplicateGroup {
  hash: string;
  materialIds: string[];
  titles: string[];
  kinds: string[];
}

/** 按规范化内容分组，返回所有重复组（组内材料数 > 1）。 */
export function findDuplicateMaterials(materials: readonly Material[]): DuplicateGroup[] {
  const groups = new Map<string, Material[]>();
  for (const m of materials) {
    const h = contentHash(m.content);
    const list = groups.get(h) ?? [];
    list.push(m);
    groups.set(h, list);
  }
  const duplicates: DuplicateGroup[] = [];
  for (const [hash, list] of groups) {
    if (list.length > 1) {
      duplicates.push({
        hash,
        materialIds: list.map((m) => m.id),
        titles: list.map((m) => m.title),
        kinds: [...new Set(list.map((m) => m.kind))],
      });
    }
  }
  return duplicates;
}
