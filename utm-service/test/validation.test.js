'use strict';

/**
 * 输入校验测试：各类非法输入都必须得到带类型区分的结构化错误，
 * 而不是硬算出垃圾结果或抛未捕获异常。
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../src/app');

const app = buildApp();

async function postForward(body) {
  const res = await app.inject({ method: 'POST', url: '/api/v1/utm/forward', payload: body });
  return { status: res.statusCode, body: res.json() };
}
async function postInverse(body) {
  const res = await app.inject({ method: 'POST', url: '/api/v1/utm/inverse', payload: body });
  return { status: res.statusCode, body: res.json() };
}

test('纬度超出投影适用范围 -> LATITUDE_OUT_OF_RANGE', async () => {
  for (const lat of [84.0001, 85, 90, -80.0001, -81, -90]) {
    const { status, body } = await postForward({ lat, lon: 116 });
    assert.equal(status, 400, `lat=${lat}`);
    assert.equal(body.error.code, 'LATITUDE_OUT_OF_RANGE');
    assert.ok(Array.isArray(body.error.details));
  }
});

test('纬度边界 84 / -80 本身合法', async () => {
  for (const lat of [84, -80]) {
    const { status } = await postForward({ lat, lon: 116 });
    assert.equal(status, 200, `lat=${lat}`);
  }
});

test('经度越界 -> LONGITUDE_OUT_OF_RANGE', async () => {
  for (const lon of [180.0001, 181, -180.0001, -181, 360]) {
    const { status, body } = await postForward({ lat: 40, lon });
    assert.equal(status, 400, `lon=${lon}`);
    assert.equal(body.error.code, 'LONGITUDE_OUT_OF_RANGE');
  }
});

test('经度边界 ±180 合法', async () => {
  for (const lon of [180, -180]) {
    const { status } = await postForward({ lat: 40, lon });
    assert.equal(status, 200, `lon=${lon}`);
  }
});

test('非数值输入 -> INVALID_TYPE（拒绝字符串/NaN 隐患）', async () => {
  for (const lat of ['40', 'abc', NaN, null, {}, []]) {
    const { status, body } = await postForward({ lat, lon: 116 });
    assert.equal(status, 400, `lat=${JSON.stringify(lat)}`);
    assert.ok(['INVALID_TYPE', 'MISSING_FIELD'].includes(body.error.code));
  }
});

test('缺字段 -> MISSING_FIELD', async () => {
  const r1 = await postForward({ lon: 116 });
  assert.equal(r1.status, 400);
  assert.equal(r1.body.error.code, 'MISSING_FIELD');
  const r2 = await postInverse({ zone: 50, easting: 500000 });
  assert.equal(r2.status, 400);
  assert.equal(r2.body.error.code, 'MISSING_FIELD');
});

test('非法带号 -> INVALID_ZONE', async () => {
  for (const zone of [0, 61, -1, 2.5, '50']) {
    const r1 = await postForward({ lat: 40, lon: 116, zone });
    assert.equal(r1.status, 400, `forward zone=${JSON.stringify(zone)}`);
    assert.equal(r1.body.error.code, 'INVALID_ZONE');
    const r2 = await postInverse({ zone, easting: 500000, northing: 4400000 });
    assert.equal(r2.status, 400, `inverse zone=${JSON.stringify(zone)}`);
    assert.equal(r2.body.error.code, 'INVALID_ZONE');
  }
});

test('平面坐标明显越界 -> EASTING/NORTHING_OUT_OF_RANGE', async () => {
  const bad = [
    [{ zone: 50, easting: 99999, northing: 4400000 }, 'EASTING_OUT_OF_RANGE'],
    [{ zone: 50, easting: 900001, northing: 4400000 }, 'EASTING_OUT_OF_RANGE'],
    [{ zone: 50, easting: -500000, northing: 4400000 }, 'EASTING_OUT_OF_RANGE'],
    [{ zone: 50, easting: 500000, northing: -1 }, 'NORTHING_OUT_OF_RANGE'],
    [{ zone: 50, easting: 500000, northing: 10000001 }, 'NORTHING_OUT_OF_RANGE'],
  ];
  for (const [payload, code] of bad) {
    const { status, body } = await postInverse(payload);
    assert.equal(status, 400, JSON.stringify(payload));
    assert.equal(body.error.code, code);
  }
});

test('非法半球标识 -> INVALID_HEMISPHERE', async () => {
  const { status, body } = await postInverse({
    zone: 50, easting: 500000, northing: 4400000, hemisphere: 'X',
  });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'INVALID_HEMISPHERE');
});

test('平面坐标映不回 UTM 覆盖域 -> COORDINATES_OUT_OF_RANGE', async () => {
  // 北半球 1e7 北坐标对应纬度 ~90°，超出 84°N 适用范围
  const { status, body } = await postInverse({ zone: 50, easting: 500000, northing: 10000000 });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'COORDINATES_OUT_OF_RANGE');
});

test('多个字段同时非法 -> 400 且 details 列出全部问题', async () => {
  const { status, body } = await postForward({ lat: 90, lon: 200, zone: 99 });
  assert.equal(status, 400);
  assert.ok(body.error.details.length >= 3, JSON.stringify(body.error));
  const codes = body.error.details.map((d) => d.code);
  assert.ok(codes.includes('LATITUDE_OUT_OF_RANGE'));
  assert.ok(codes.includes('LONGITUDE_OUT_OF_RANGE'));
  assert.ok(codes.includes('INVALID_ZONE'));
});

test('分带查询的非法经度 -> 400', async () => {
  for (const lon of ['181', 'abc', '']) {
    const res = await app.inject({ method: 'GET', url: `/api/v1/utm/zone?lon=${lon}` });
    assert.equal(res.statusCode, 400, `lon=${lon}`);
    assert.ok(res.json().error.code);
  }
  const missing = await app.inject({ method: 'GET', url: '/api/v1/utm/zone' });
  assert.equal(missing.statusCode, 400);
  assert.equal(missing.json().error.code, 'MISSING_FIELD');
});

test('畸形 JSON 请求体 -> 400 BAD_REQUEST 而非 500', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/utm/forward',
    headers: { 'content-type': 'application/json' },
    payload: '{not json',
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error.code, 'BAD_REQUEST');
});
