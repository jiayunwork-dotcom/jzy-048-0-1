'use strict';

/**
 * 南北半球配对测试：纬度取反的对称点，
 * 北坐标满足 N_south = 10000000 − N_north，东坐标一致。
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { forward } = require('../src/lib/forward');
const { inverse } = require('../src/lib/inverse');
const { FALSE_NORTHING } = require('../src/lib/ellipsoid');

test('对称纬度点北坐标配对：N_south = 1e7 − N_north', () => {
  let maxErr = 0;
  for (const lat of [0.5, 10, 23.5, 45, 66.7, 79.9]) {
    for (let lon = -180; lon <= 180; lon += 17.3) {
      const n = forward(lat, lon);
      const s = forward(-lat, lon);
      assert.equal(n.hemisphere, 'N');
      assert.equal(s.hemisphere, 'S');
      maxErr = Math.max(maxErr, Math.abs(n.northing + s.northing - FALSE_NORTHING));
    }
  }
  assert.ok(maxErr < 1e-6, `配对偏差 ${maxErr} m`);
});

test('对称纬度点东坐标完全相同', () => {
  for (const lat of [1, 33.3, 58, 80]) {
    for (let lon = -179; lon <= 180; lon += 13.1) {
      const n = forward(lat, lon);
      const s = forward(-lat, lon);
      assert.equal(n.easting, s.easting);
    }
  }
});

test('赤道点：北半球基准 0，南半球侧为 1e7 假北', () => {
  const north = forward(0, 117);
  assert.equal(north.northing, 0);
  // 赤道南侧无穷接近处
  const south = forward(-1e-9, 117);
  assert.ok(Math.abs(south.northing - FALSE_NORTHING) < 1e-3);
});

test('南半球点往返闭合（携带 hemisphere）', () => {
  const pts = [
    [-33.8688, 151.2093], // Sydney
    [-1.2921, 36.8219],   // Nairobi
    [-70, -70],
    [-79.99, 0],
  ];
  for (const [lat, lon] of pts) {
    const f = forward(lat, lon);
    assert.equal(f.hemisphere, 'S');
    const b = inverse(f.zone, f.easting, f.northing, f.hemisphere);
    assert.ok(Math.abs(b.lat - lat) < 1e-9, `lat 漂移 @(${lat},${lon})`);
    assert.ok(Math.abs(b.lon - lon) < 1e-9, `lon 漂移 @(${lat},${lon})`);
  }
});

test('南半球北坐标确实加了 1e7 假北（与裸值比较）', () => {
  // 同一南纬点，正算北坐标 = 1e7 + K0·A·ξ（ξ<0），整体在 [0, 1e7] 内
  const f = forward(-45, 117);
  assert.ok(f.northing > 0 && f.northing < FALSE_NORTHING);
  // 与对称北纬点配对
  const n = forward(45, 117);
  assert.ok(Math.abs(f.northing - (FALSE_NORTHING - n.northing)) < 1e-9);
});
