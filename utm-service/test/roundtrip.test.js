'use strict';

/**
 * 核心自洽性测试：往返闭合。
 * 任取合法经纬度 -> 正算 -> 反算，还原值必须与原值一致到投影精度以内。
 * 正反两支级数若有任一系数错误，往返必然漂移，本测试即守这条底线。
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { forward } = require('../src/lib/forward');
const { inverse } = require('../src/lib/inverse');

const ROUNDTRIP_TOL_DEG = 1e-9; // ≈ 0.1 mm，Krüger 6 阶实际可达纳米级

test('往返闭合：全球网格扫描（含南北半球、全部带）', () => {
  let maxErr = 0;
  let checked = 0;
  for (let lat = -80; lat <= 84; lat += 1.9) {
    for (let lon = -180; lon <= 180; lon += 2.7) {
      const f = forward(lat, lon);
      const b = inverse(f.zone, f.easting, f.northing, f.hemisphere);
      const err = Math.max(Math.abs(b.lat - lat), Math.abs(b.lon - lon));
      if (err > maxErr) maxErr = err;
      checked++;
    }
  }
  assert.ok(checked > 5000, `应覆盖足够网格点，实际 ${checked}`);
  assert.ok(maxErr < ROUNDTRIP_TOL_DEG, `往返最大偏差 ${maxErr}° 超出 ${ROUNDTRIP_TOL_DEG}°`);
});

test('往返闭合：UTM 适用边界（84N / 80S / 日界线）', () => {
  const edgePoints = [
    [84, 0], [84, -179.9], [84, 179.9], [-80, 0], [-80, -180], [-80, 180],
    [0, -180], [0, 180], [83.9999, 3], [-79.9999, -3],
  ];
  for (const [lat, lon] of edgePoints) {
    const f = forward(lat, lon);
    const b = inverse(f.zone, f.easting, f.northing, f.hemisphere);
    assert.ok(Math.abs(b.lat - lat) < ROUNDTRIP_TOL_DEG, `lat 漂移 @(${lat},${lon})`);
    assert.ok(Math.abs(b.lon - lon) < ROUNDTRIP_TOL_DEG, `lon 漂移 @(${lat},${lon})`);
  }
});

test('往返闭合：强制跨带指定依然闭合', () => {
  // 调用方强制指定相邻带，正算用该带、反算也用该带，仍须闭合
  const lat = 40;
  const lon = 116;
  const f = forward(lat, lon, 51); // 自动分带为 50，强制 51
  assert.equal(f.zone, 51);
  assert.equal(f.autoZone, 50);
  assert.equal(f.forcedZone, true);
  const b = inverse(51, f.easting, f.northing, 'N');
  assert.ok(Math.abs(b.lat - lat) < ROUNDTRIP_TOL_DEG);
  assert.ok(Math.abs(b.lon - lon) < ROUNDTRIP_TOL_DEG);
});

test('往返闭合：随机点模糊测试', () => {
  // 固定种子的简易 PRNG，保证可复现
  let seed = 20260920;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 2000; i++) {
    const lat = -80 + rand() * 164;
    const lon = -180 + rand() * 360;
    const f = forward(lat, lon);
    const b = inverse(f.zone, f.easting, f.northing, f.hemisphere);
    assert.ok(
      Math.abs(b.lat - lat) < ROUNDTRIP_TOL_DEG && Math.abs(b.lon - lon) < ROUNDTRIP_TOL_DEG,
      `第 ${i} 点 (${lat}, ${lon}) 往返漂移`
    );
  }
});
