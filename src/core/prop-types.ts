export interface PropModelData {
  readonly name: string;
  readonly icon: string;
  readonly positions: Float32Array; // 3/顶点，已按 scale 表归一化、底面落在格底
  readonly normals: Float32Array;   // 3/顶点
  readonly colors: Float32Array;    // 3/顶点（colormap 采样，sRGB）
  readonly indices: Uint16Array;    // 单模型索引（恒 < 65k 顶点）
  readonly footprint: number;       // 占地格数（整数，≥1）
  readonly height: number;          // 占高格数（整数，≥1）
}

export interface PropInstance {
  readonly id: number;           // PropWorld 内部自增分配
  readonly modelId: number;     // 模型表索引
  readonly x: number;           // 基础格坐标（占用列自此格向上）
  readonly y: number;
  readonly z: number;
  readonly rot: 0 | 1 | 2 | 3;  // 首版固定 0，字段保留
}
