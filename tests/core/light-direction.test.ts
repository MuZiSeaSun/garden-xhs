import { describe, it, expect } from 'vitest';
import { diskToLightDir, lightDirToDisk, LIGHT_ELEVATION_MAX } from '../../src/core/light-direction';

const THETA = Math.PI / 4;

describe('diskToLightDir', () => {
  it('maps the center to light from straight above', () => {
    expect(diskToLightDir(0, 0, THETA)).toEqual([0, 1, 0]);
  });

  it('maps the right edge to screen-right and nearly horizontal', () => {
    const dir = diskToLightDir(1, 0, THETA);
    const horiz = Math.hypot(dir[0], dir[2]);
    expect(dir[1]).toBeCloseTo(Math.cos(LIGHT_ELEVATION_MAX), 5);
    expect(horiz).toBeCloseTo(Math.sin(LIGHT_ELEVATION_MAX), 5);
    expect(dir[0] / horiz).toBeCloseTo(Math.sin(THETA), 5);
    expect(dir[2] / horiz).toBeCloseTo(-Math.cos(THETA), 5);
  });

  it('maps the top of the disk toward the far side of the view', () => {
    const dir = diskToLightDir(0, -1, THETA);
    const horiz = Math.hypot(dir[0], dir[2]);
    expect(dir[0] / horiz).toBeCloseTo(-Math.cos(THETA), 5);
    expect(dir[2] / horiz).toBeCloseTo(-Math.sin(THETA), 5);
  });

  it('clamps a point outside the disk onto the same rim direction', () => {
    const rim = diskToLightDir(1, 0, THETA);
    const outside = diskToLightDir(4, 0, THETA);
    expect(outside[0]).toBeCloseTo(rim[0], 5);
    expect(outside[1]).toBeCloseTo(rim[1], 5);
    expect(outside[2]).toBeCloseTo(rim[2], 5);
  });

  it('moves the disk point when the view yaws and the world light stays put', () => {
    const dir = diskToLightDir(1, 0, THETA);
    const here = lightDirToDisk(dir, THETA);
    expect(here.nx).toBeCloseTo(1, 5);
    expect(here.ny).toBeCloseTo(0, 5);
    const turned = lightDirToDisk(dir, THETA + Math.PI / 2);
    expect(turned.nx).toBeCloseTo(0, 5);
    expect(turned.ny).toBeCloseTo(-1, 5);
  });
});
