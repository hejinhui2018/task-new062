import { describe, expect, it } from 'vitest';
import { findDuplicateMaterials, normalizeContent } from '../lib/duplicates';
import type { Material } from '../types';

function material(id: string, content: string, kind = 'transcript'): Material {
  return { id, kind, title: id, content, submittedAt: '2026-01-01' };
}

describe('重复材料检测', () => {
  it('内容完全相同的材料被归为一组', () => {
    const groups = findDuplicateMaterials([
      material('m1', '成绩单 GPA 3.0'),
      material('m2', '成绩单 GPA 3.0'),
      material('m3', '另一份不同的材料'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].materialIds).toEqual(['m1', 'm2']);
  });

  it('空白与大小写差异不影响判重（规范化后相同）', () => {
    expect(normalizeContent('  ABC\n  def ')).toBe('abc def');
    const groups = findDuplicateMaterials([
      material('m1', 'Proof  of   Award'),
      material('m2', 'proof of award'),
      material('m3', 'proof   of\naward  '),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].materialIds).toEqual(['m1', 'm2', 'm3']);
  });

  it('内容不同的材料不误报', () => {
    const groups = findDuplicateMaterials([
      material('m1', '材料甲'),
      material('m2', '材料乙'),
    ]);
    expect(groups).toEqual([]);
  });

  it('空列表与单材料列表返回空', () => {
    expect(findDuplicateMaterials([])).toEqual([]);
    expect(findDuplicateMaterials([material('m1', 'x')])).toEqual([]);
  });

  it('同一组重复材料记录涉及的 kind', () => {
    const groups = findDuplicateMaterials([
      material('m1', '相同内容', 'transcript'),
      material('m2', '相同内容', 'transcript_copy'),
    ]);
    expect(groups[0].kinds).toEqual(['transcript', 'transcript_copy']);
  });
});
