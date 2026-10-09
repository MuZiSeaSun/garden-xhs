import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import { parseGlb, decodePngRgba } from '../../scripts/bake-props';

// ---- 合成 GLB fixture（真实 kit 布局：单 node/单 mesh/单 primitive/mode 4）----
function concatU8(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function buildGlb(o: {
  positions: number[]; uvs: number[]; indices: number[];
  indexType?: 5121 | 5123 | 5125; nodeScale?: number[];
}): Uint8Array {
  const indexType = o.indexType ?? 5123;
  const pos = new Float32Array(o.positions);
  const uv = new Float32Array(o.uvs);
  const idx = indexType === 5121 ? new Uint8Array(o.indices)
    : indexType === 5123 ? new Uint16Array(o.indices)
    : new Uint32Array(o.indices);
  const bin = concatU8([new Uint8Array(pos.buffer), new Uint8Array(uv.buffer), new Uint8Array(idx.buffer)]);
  const json = {
    scene: 0, scenes: [{ nodes: [0] }],
    nodes: [o.nodeScale ? { mesh: 0, scale: o.nodeScale } : { mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, mode: 4 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3' },
      { bufferView: 1, componentType: 5126, count: uv.length / 2, type: 'VEC2' },
      { bufferView: 2, componentType: indexType, count: idx.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: pos.byteLength },
      { buffer: 0, byteOffset: pos.byteLength, byteLength: uv.byteLength },
      { buffer: 0, byteOffset: pos.byteLength + uv.byteLength, byteLength: idx.byteLength },
    ],
    buffers: [{ byteLength: bin.byteLength }],
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  const bo = 20 + jsonBytes.length;
  dv.setUint32(bo, bin.length, true); dv.setUint32(bo + 4, 0x004e4942, true);
  out.set(bin, bo + 8);
  return out;
}

const TRI = {
  positions: [0, 0, 0, 1, 0, 0, 0, 0, 1],
  uvs: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
  indices: [0, 1, 2],
};

// ---- 合成 PNG fixture（解码器不校验 CRC，填 0）----
function buildPng(w: number, h: number, rows: Uint8Array[], colorType = 6): Uint8Array {
  const raw = concatU8(rows);
  const idat = deflateSync(raw);
  const ihdr = new Uint8Array(13);
  const dvh = new DataView(ihdr.buffer);
  dvh.setUint32(0, w); dvh.setUint32(4, h);
  ihdr[8] = 8; ihdr[9] = colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    return out;
  };
  return concatU8([
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', new Uint8Array(idat)), chunk('IEND', new Uint8Array(0)),
  ]);
}

describe('parseGlb', () => {
  it('parses UNSIGNED_SHORT indices', () => {
    const m = parseGlb(buildGlb(TRI));
    expect(Array.from(m.positions)).toEqual(TRI.positions);
    expect(Array.from(m.uvs)).toEqual(Array.from(new Float32Array(TRI.uvs)));
    expect(Array.from(m.indices)).toEqual([0, 1, 2]);
  });
  it('parses UNSIGNED_BYTE indices (real kit layout for small models)', () => {
    expect(Array.from(parseGlb(buildGlb({ ...TRI, indexType: 5121 })).indices)).toEqual([0, 1, 2]);
  });
  it('parses UNSIGNED_INT indices', () => {
    expect(Array.from(parseGlb(buildGlb({ ...TRI, indexType: 5125 })).indices)).toEqual([0, 1, 2]);
  });
  it('rejects non-GLB bytes', () => {
    expect(() => parseGlb(new Uint8Array(64))).toThrow(/GLB/i);
  });
  it('rejects node TRS transforms', () => {
    expect(() => parseGlb(buildGlb({ ...TRI, nodeScale: [2, 2, 2] }))).toThrow(/TRS/i);
  });
});

describe('decodePngRgba', () => {
  it('decodes a filter-0 RGBA PNG', () => {
    const data = Uint8Array.from([10, 0, 0, 255, 20, 40, 60, 255]);
    const img = decodePngRgba(buildPng(2, 1, [Uint8Array.from([0, ...data])]));
    expect([img.width, img.height]).toEqual([2, 1]);
    expect(Array.from(img.rgba)).toEqual(Array.from(data));
  });
  it('decodes filter-1 (Sub) rows', () => {
    const orig = [10, 20, 30, 255, 50, 20, 30, 255];
    const sub = orig.map((v, i) => (i % 4 === 0 ? v : (v - orig[i - 1] + 256) % 256));
    const img = decodePngRgba(buildPng(2, 1, [Uint8Array.from([1, ...sub])]));
    expect(Array.from(img.rgba)).toEqual(orig);
  });
  it('rejects non-RGBA PNGs', () => {
    expect(() => decodePngRgba(buildPng(2, 1, [Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7])], 2))).toThrow(/unsupported PNG/i);
  });
});
