'use strict';

/**
 * 分带规则与"差一个带"识别测试。
 * 若分带公式差一个带，东坐标会整体偏离约一个带宽（赤道处约 66.8 万米量级、
 * 中纬度也有数十万米），与级数误差的纳米量级完全不可混淆，对照测试必须能抓住。
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { zoneNumber, centralMeridian, isValidZone } = require('../src/lib/zone');
const { forward } = require('../src/lib/forward');
const { inverse } = require('../src/lib/inverse');

test('分带公式：n = floor((lon+180)/6)+1', () => {
  const cases = [
    [-180, 1], [-177, 1], [-176.999, 1], [-174, 2],
    [-6, 30], [0, 31], [3, 31], [5.999, 31], [6, 32],
    [114, 50], [116.4074, 50], [119.999, 50], [120, 51],
    [179.999, 60], [180, 60],
  ];
  for (const [lon, zone] of cases) {
    assert.equal(zoneNumber(lon), zone, `lon=${lon}`);
  }
});

test('中央经线：λ0 = 3 + 6·(n−1) − 180', () => {
  const cases = [
    [1, -177], [30, -3], [31, 3], [32, 9], [50, 117], [60, 177],
  ];
  for (const [zone, cm] of cases) {
    assert.equal(centralMeridian(zone), cm, `zone=${zone}`);
  }
});

test('带号合法性判定', () => {
  for (const z of [1, 30, 60]) assert.ok(isValidZone(z));
  for (const z of [0, 61, -1, 1.5, NaN, '50', null]) assert.ok(!isValidZone(z));
});

test('差带识别：强制相邻带导致东坐标偏离约一个带宽', () => {
  const lat = 40;
  const lon = 116; // 自动分带 50
  const auto = forward(lat, lon);
  const shifted = forward(lat, lon, 51); // 模拟"差一个带"的错误分带
  const dE = Math.abs(shifted.easting - auto.easting);
  // 40°N 处一个带宽约 6°·cos40°·111km ≈ 511 km，任何级数错误都不可能造成这种量级
  assert.ok(dE > 300000, `差带东坐标偏差 ${dE} m，应 > 300 km`);
  assert.ok(dE < 700000, `差带东坐标偏差 ${dE} m，应 < 700 km`);
});

test('差带识别：用错误的带号反算，经度偏约 6°', () => {
  const lat = 40;
  const lon = 116;
  const f = forward(lat, lon); // zone 50
  const wrong = inverse(51, f.easting, f.northing, 'N'); // 错用 51 带反算
  const dLon = Math.abs(wrong.lon - lon);
  assert.ok(dLon > 5 && dLon < 7, `错带反算经度偏差 ${dLon}°，应约 6°`);
});

test('差带识别：东坐标对照 —— 同一点相邻两带的东坐标互补于带宽', () => {
  // 同一点在 n 带与 n+1 带的东坐标之和 ≈ 两带各自假东 + 带宽偏移，
  // 其差值必须落在"一个带宽"窗口内，用以揪出分带公式的 off-by-one
  const lon = 0; // 自动 31 带（CM=3°E）
  const z31 = forward(0, lon);
  const z32 = forward(0, lon, 32);
  const dE = Math.abs(z32.easting - z31.easting);
  // 赤道处一个带宽 = 6° 对应约 667.9 km（含 k0 与级数项）
  assert.ok(dE > 600000 && dE < 750000, `赤道差带 ${dE} m`);
});

test('强制指定带号：响应明确标注 forcedZone 且不被静默改带', () => {
  const r = forward(39.9042, 116.4074, 49); // 自动为 50
  assert.equal(r.zone, 49, '应以调用方指定带号为准');
  assert.equal(r.autoZone, 50);
  assert.equal(r.forcedZone, true, '必须标注为强制指定');
  assert.equal(r.centralMeridian, 111);
  // 未指定或指定一致时不标注
  assert.equal(forward(39.9042, 116.4074).forcedZone, false);
  assert.equal(forward(39.9042, 116.4074, 50).forcedZone, false);
});
