'use strict';

/**
 * 基准判据测试：赤道+中央经线基准、比例因子、子午线收敛角、
 * 以及与独立子午线弧长级数的交叉验证、外部已知参考值。
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { forward } = require('../src/lib/forward');
const { meridianArc } = require('../src/lib/meridian');
const { toRadians } = require('../src/lib/angles');
const { K0, FALSE_EASTING } = require('../src/lib/ellipsoid');

test('赤道与中央经线交点：E=500000, N=0, k=0.9996, gamma=0', () => {
  for (const cm of [-177, -3, 3, 117, 177]) {
    const r = forward(0, cm);
    assert.ok(Math.abs(r.easting - FALSE_EASTING) < 1e-9, `E 应为 500000，实际 ${r.easting}`);
    assert.ok(Math.abs(r.northing) < 1e-9, `N 应为 0，实际 ${r.northing}`);
    assert.ok(Math.abs(r.scale - K0) < 1e-9, `k 应为 0.9996，实际 ${r.scale}`);
    assert.ok(Math.abs(r.convergence) < 1e-9, `gamma 应为 0，实际 ${r.convergence}`);
  }
});

test('中央经线上任意纬度：比例因子恒为 0.9996、收敛角恒为 0', () => {
  for (let lat = -80; lat <= 84; lat += 4.7) {
    const r = forward(lat, 117);
    assert.ok(Math.abs(r.scale - K0) < 1e-9, `lat=${lat} k=${r.scale}`);
    assert.ok(Math.abs(r.convergence) < 1e-9, `lat=${lat} gamma=${r.convergence}`);
  }
});

test('点比例因子随偏离中央经线距离增大而升高', () => {
  for (const lat of [0, 20, 40, 60, 80]) {
    const k0 = forward(lat, 117).scale;
    const k1 = forward(lat, 118).scale;
    const k2 = forward(lat, 119).scale;
    const k3 = forward(lat, 120).scale;
    assert.ok(Math.abs(k0 - K0) < 1e-9, `lat=${lat} 中央经线 k=${k0}`);
    assert.ok(k1 > k0 && k2 > k1 && k3 > k2, `lat=${lat}: ${k0} ${k1} ${k2} ${k3} 应单调递增`);
  }
});

test('子午线收敛角符号：北半球中央经线以东为正、以西为负，南半球相反', () => {
  assert.ok(forward(40, 118).convergence > 0);
  assert.ok(forward(40, 116).convergence < 0);
  assert.ok(forward(-40, 118).convergence < 0);
  assert.ok(forward(-40, 116).convergence > 0);
  // 与近似公式 atan(tan(Δλ)·sinφ) 同号同量级
  const approx = Math.atan(Math.tan(toRadians(2)) * Math.sin(toRadians(40))) * 180 / Math.PI;
  const exact = forward(40, 119).convergence;
  assert.ok(Math.abs(exact - approx) < 0.01, `exact=${exact} approx=${approx}`);
});

test('中央经线北坐标与独立子午线弧长级数互洽：N = K0·M(φ)', () => {
  // meridianArc 使用 USGS e² 级数，与 Krüger α 级数相互独立，交叉锁定展开式
  let maxErr = 0;
  for (let lat = -80; lat <= 84; lat += 1.3) {
    const r = forward(lat, 117);
    const expected =
      lat >= 0 ? K0 * meridianArc(toRadians(lat)) : 1e7 + K0 * meridianArc(toRadians(lat));
    maxErr = Math.max(maxErr, Math.abs(r.northing - expected));
  }
  assert.ok(maxErr < 1e-3, `两套独立级数偏差 ${maxErr} m`);
});

test('外部已知参考值：原点 (0,0) -> UTM 31N (166021.4430805, 0)', () => {
  // PROJ/CS2CS 公认的 WGS84 UTM 31 带原点东坐标
  const r = forward(0, 0);
  assert.equal(r.zone, 31);
  assert.ok(Math.abs(r.easting - 166021.4430805) < 1e-3, `E=${r.easting}`);
  assert.ok(Math.abs(r.northing) < 1e-6, `N=${r.northing}`);
});

test('外部已知参考值：比例因子在赤道带缘约 1.00098', () => {
  const r = forward(0, 120); // 距 117° 中央经线 3°
  assert.ok(r.scale > 1.0009 && r.scale < 1.0011, `k=${r.scale}`);
});
