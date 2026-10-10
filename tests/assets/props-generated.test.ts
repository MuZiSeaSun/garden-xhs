import { describe, it, expect } from 'vitest';
import { statSync } from 'node:fs';
import { PROP_MODELS } from '../../src/assets/props.generated';

describe('props.generated', () => {
  it('has the imported models with names and data-uri icons', () => {
    expect(PROP_MODELS.map((m) => m.name)).toEqual([
      '箭', '箭矢', '木桶', '炸弹', '宝箱', '木箱', '花朵', '高花', '草丛',
      '树篱', '树篱角', '蘑菇', '盆栽', '石头', '石块', '小树', '松树', '小松树',
    ]);
    for (const m of PROP_MODELS) {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.icon.startsWith('data:image/png;base64,')).toBe(true);
    }
  });

  it('geometry is self-consistent with unit normals', () => {
    for (const m of PROP_MODELS) {
      const n = m.positions.length / 3;
      expect(m.positions.length % 9).toBe(0);            // 每面 3 顶点
      expect(m.normals.length).toBe(m.positions.length);
      expect(m.colors.length).toBe(m.positions.length);
      expect(m.alpha.length).toBe(m.positions.length / 3);
      for (let i = 0; i < m.alpha.length; i++) {
        expect(m.alpha[i]).toBeGreaterThanOrEqual(0);
        expect(m.alpha[i]).toBeLessThanOrEqual(1);
      }
      expect(m.indices.length).toBe(n);                   // 拆解后索引 = 顺序
      expect(n).toBeLessThan(65536);
      for (let i = 0; i < m.indices.length; i++) expect(m.indices[i]).toBe(i);
      for (let i = 0; i < n; i++) {                       // 法线归一
        const l = Math.hypot(m.normals[i * 3], m.normals[i * 3 + 1], m.normals[i * 3 + 2]);
        expect(Math.abs(l - 1)).toBeLessThan(1e-3);
      }
    }
  });

  it('declared footprint/height cover the actual vertex extents', () => {
    for (const m of PROP_MODELS) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < m.positions.length; i += 3) {
        minX = Math.min(minX, m.positions[i]); maxX = Math.max(maxX, m.positions[i]);
        minY = Math.min(minY, m.positions[i + 1]); maxY = Math.max(maxY, m.positions[i + 1]);
        minZ = Math.min(minZ, m.positions[i + 2]); maxZ = Math.max(maxZ, m.positions[i + 2]);
      }
      expect(maxX - minX).toBeLessThanOrEqual(m.footprint + 1e-6);
      expect(maxZ - minZ).toBeLessThanOrEqual(m.footprint + 1e-6);
      expect(maxY - minY).toBeLessThanOrEqual(m.height + 1e-6);
      expect(minY).toBeGreaterThanOrEqual(-1e-6);
      expect(m.footprint).toBeLessThanOrEqual(3);
      expect(m.height).toBeLessThanOrEqual(6);
    }
  });

  it('stays inside the size budget', () => {
    expect(statSync('src/assets/props.generated.ts').size).toBeLessThan(600 * 1024);
  });
});
