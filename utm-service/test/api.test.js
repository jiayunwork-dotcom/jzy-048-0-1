'use strict';

/**
 * HTTP 端到端测试：三个换算接口 + 示范点 + 健康检查 + 并发无串扰。
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildApp, SAMPLE_POINT } = require('../src/app');
const { forward } = require('../src/lib/forward');
const { inverse } = require('../src/lib/inverse');

const app = buildApp();

test('GET /health', async () => {
  const res = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: 'ok' });
});

test('POST /api/v1/utm/forward 返回完整字段', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/utm/forward',
    payload: { lat: 39.9042, lon: 116.4074 },
  });
  assert.equal(res.statusCode, 200);
  const b = res.json();
  assert.equal(b.zone, 50);
  assert.equal(b.centralMeridian, 117);
  assert.equal(b.forcedZone, false);
  assert.equal(b.hemisphere, 'N');
  assert.ok(b.easting > 400000 && b.easting < 600000);
  assert.ok(b.northing > 4_000_000 && b.northing < 5_000_000);
  assert.ok(Math.abs(b.scale - 0.9996) < 0.002);
  assert.ok(typeof b.convergence === 'number');
});

test('POST /api/v1/utm/forward 强制指定带号时响应明确标注', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/utm/forward',
    payload: { lat: 39.9042, lon: 116.4074, zone: 49 },
  });
  assert.equal(res.statusCode, 200);
  const b = res.json();
  assert.equal(b.zone, 49);
  assert.equal(b.autoZone, 50);
  assert.equal(b.forcedZone, true, '跨带强制指定必须在响应中标注');
});

test('POST /api/v1/utm/inverse 与正算互逆', async () => {
  const fwd = forward(39.9042, 116.4074);
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/utm/inverse',
    payload: {
      zone: fwd.zone,
      easting: fwd.easting,
      northing: fwd.northing,
      hemisphere: fwd.hemisphere,
    },
  });
  assert.equal(res.statusCode, 200);
  const b = res.json();
  assert.ok(Math.abs(b.lat - 39.9042) < 1e-9);
  assert.ok(Math.abs(b.lon - 116.4074) < 1e-9);
});

test('GET /api/v1/utm/zone 分带查询', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/v1/utm/zone?lon=116.4074' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { lon: 116.4074, zone: 50, centralMeridian: 117 });
});

test('GET /api/v1/utm/sample 预置示范点可验证级数正确性', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/v1/utm/sample' });
  assert.equal(res.statusCode, 200);
  const b = res.json();
  assert.equal(b.input.lat, SAMPLE_POINT.lat);
  assert.equal(b.forward.zone, 50, '示范点应落在 50N 带');
  assert.equal(b.forward.hemisphere, 'N');
  assert.ok(
    b.forward.easting >= 400000 && b.forward.easting <= 600000,
    `示范点东坐标 ${b.forward.easting} 应在 40万~60万米之间`
  );
  assert.ok(b.roundtrip.absErrorLatDeg < 1e-9);
  assert.ok(b.roundtrip.absErrorLonDeg < 1e-9);
});

test('并发请求相互独立、结果互不串扰（无状态）', async () => {
  // 构造一批互不相同的请求，并发打满，再逐一与串行计算结果对照
  const jobs = [];
  for (let i = 0; i < 120; i++) {
    const lat = -79 + ((i * 37) % 162);
    const lon = -179 + ((i * 53) % 358);
    jobs.push({ lat, lon });
  }
  const responses = await Promise.all(
    jobs.map((j) =>
      app.inject({ method: 'POST', url: '/api/v1/utm/forward', payload: j }).then((r) => r.json())
    )
  );
  responses.forEach((body, i) => {
    const expect = forward(jobs[i].lat, jobs[i].lon);
    assert.equal(body.zone, expect.zone, `#${i} zone 串扰`);
    assert.equal(body.easting, expect.easting, `#${i} easting 串扰`);
    assert.equal(body.northing, expect.northing, `#${i} northing 串扰`);
    assert.equal(body.scale, expect.scale, `#${i} scale 串扰`);
  });
});

test('正反算接口链路：HTTP 正算 -> HTTP 反算闭合', async () => {
  const points = [
    [39.9042, 116.4074],
    [-33.8688, 151.2093],
    [51.5074, -0.1278],
    [0, 0],
    [83.9, -45],
  ];
  for (const [lat, lon] of points) {
    const f = await app.inject({
      method: 'POST',
      url: '/api/v1/utm/forward',
      payload: { lat, lon },
    }).then((r) => r.json());
    const b = await app.inject({
      method: 'POST',
      url: '/api/v1/utm/inverse',
      payload: {
        zone: f.zone,
        easting: f.easting,
        northing: f.northing,
        hemisphere: f.hemisphere,
      },
    }).then((r) => r.json());
    assert.ok(Math.abs(b.lat - lat) < 1e-9, `(${lat},${lon}) lat 漂移`);
    assert.ok(Math.abs(b.lon - lon) < 1e-9, `(${lat},${lon}) lon 漂移`);
  }
});

test('库层反算与 HTTP 反算一致', async () => {
  const f = forward(-33.8688, 151.2093);
  const libResult = inverse(f.zone, f.easting, f.northing, 'S');
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/utm/inverse',
    payload: { zone: f.zone, easting: f.easting, northing: f.northing, hemisphere: 'S' },
  });
  const httpResult = res.json();
  assert.equal(httpResult.lat, libResult.lat);
  assert.equal(httpResult.lon, libResult.lon);
});
