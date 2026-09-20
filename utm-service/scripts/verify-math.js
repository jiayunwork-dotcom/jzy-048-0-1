'use strict';

/**
 * 开发期数学验证脚本（非交付测试，正式测试在 test/ 下）。
 * 用相互独立的方法交叉验证级数实现：
 *  1. 已知参考值（PROJ/UTM 经典值）
 *  2. 数值微分独立验证解析的 k / gamma 公式
 *  3. 往返闭合网格扫描
 *  4. 子午线弧长独立级数交叉验证
 */
const { forward } = require('../src/lib/forward');
const { inverse } = require('../src/lib/inverse');
const { meridianArc } = require('../src/lib/meridian');
const { K0 } = require('../src/lib/ellipsoid');
const { toRadians } = require('../src/lib/angles');

let failures = 0;
function check(name, cond, detail = '') {
  const ok = !!cond;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  | ' + detail : ''}`);
  if (!ok) failures++;
}

// ---- 1. 经典参考值：原点 (0,0) -> UTM 31N: E=166021.4430805, N=0 ----------
{
  const r = forward(0, 0);
  check('ref (0,0) zone=31', r.zone === 31, `zone=${r.zone}`);
  check('ref (0,0) E=166021.4430805', Math.abs(r.easting - 166021.4430805) < 1e-3, `E=${r.easting}`);
  check('ref (0,0) N=0', Math.abs(r.northing) < 1e-6, `N=${r.northing}`);
  console.log(`      k(0,0)=${r.scale}, gamma(0,0)=${r.convergence}`);
}

// ---- 2. 赤道+中央经线基准 -------------------------------------------------
for (const lon0 of [-177, -3, 117, 177]) {
  const r = forward(0, lon0);
  check(`CM equator lon=${lon0}: E=500000`, Math.abs(r.easting - 500000) < 1e-9, `E=${r.easting}`);
  check(`CM equator lon=${lon0}: N=0`, Math.abs(r.northing) < 1e-9, `N=${r.northing}`);
}
for (const lat of [-80, -45, 0, 30, 60, 84]) {
  const r = forward(lat, 117);
  check(`CM lat=${lat}: k=0.9996`, Math.abs(r.scale - K0) < 1e-9, `k=${r.scale}`);
  check(`CM lat=${lat}: gamma=0`, Math.abs(r.convergence) < 1e-9, `g=${r.convergence}`);
}

// ---- 3. 数值微分独立验证 k 与 gamma ---------------------------------------
// 数值微分求的是"真北相对网格北的方位角"，与 GeographicLib/Karney 约定的
// gamma（网格北相对真北的顺时针方位角，中央经线以东为正）符号相反、绝对值相等。
// 注意避开赤道：假北偏移在赤道处不连续，数值微分不能跨赤道取点。
{
  let maxKerr = 0;
  let maxGerr = 0;
  for (const lat of [-79.5, -40, -0.5, 0.5, 20, 45, 70, 83.5]) {
    for (const dLon of [0.5, 1.5, 2.9]) {
      const lon = 117 + dLon;
      const h = 1e-6; // 纬度微步长(度)
      const p0 = forward(lat - h, lon);
      const p1 = forward(lat + h, lon);
      // 子午线方向角（从网格北起算，向东为正 => gamma 数值值）
      const gammaNum = (Math.atan2(p1.easting - p0.easting, p1.northing - p0.northing) * 180) / Math.PI;
      const g = forward(lat, lon);
      maxGerr = Math.max(maxGerr, Math.abs(gammaNum + g.convergence));
      // k: 沿子午线 ds_ground = R_merid * dphi，用子午线弧长差做地面距离
      const dsGround = meridianArc(toRadians(lat + h)) - meridianArc(toRadians(lat - h));
      const dsMap = Math.hypot(p1.easting - p0.easting, p1.northing - p0.northing);
      const kNum = dsMap / Math.abs(dsGround);
      maxKerr = Math.max(maxKerr, Math.abs(kNum - g.scale));
    }
  }
  check('gamma analytic vs numeric < 1e-5 deg', maxGerr < 1e-5, `max=${maxGerr}`);
  check('k analytic vs numeric < 1e-6', maxKerr < 1e-6, `max=${maxKerr}`);
}

// ---- 4. 往返闭合网格扫描 ---------------------------------------------------
{
  let maxErr = 0;
  let worst = null;
  for (let lat = -80; lat <= 84; lat += 3.7) {
    for (let lon = -180; lon <= 180; lon += 4.3) {
      const f = forward(lat, lon);
      const b = inverse(f.zone, f.easting, f.northing, f.hemisphere);
      const err = Math.max(Math.abs(b.lat - lat), Math.abs(b.lon - lon));
      if (err > maxErr) {
        maxErr = err;
        worst = { lat, lon };
      }
    }
  }
  check('roundtrip grid max err < 1e-9 deg', maxErr < 1e-9, `max=${maxErr} at ${JSON.stringify(worst)}`);
}

// 强制跨带往返
{
  const f = forward(40, 116, 51); // 强制 51 带
  const b = inverse(51, f.easting, f.northing, 'N');
  const err = Math.max(Math.abs(b.lat - 40), Math.abs(b.lon - 116));
  check('forced-zone roundtrip < 1e-9 deg', err < 1e-9, `err=${err}`);
  check('forcedZone flag set', f.forcedZone === true && f.zone === 51 && f.autoZone === 50);
}

// ---- 5. 子午线弧长交叉验证：中央经线上 N = K0 * M(phi) ---------------------
{
  let maxErr = 0;
  for (let lat = -80; lat <= 84; lat += 2.9) {
    const r = forward(lat, 117);
    const expect = lat >= 0 ? K0 * meridianArc(toRadians(lat)) : 1e7 + K0 * meridianArc(toRadians(lat));
    maxErr = Math.max(maxErr, Math.abs(r.northing - expect));
  }
  check('CM northing == K0*meridianArc, < 1e-3 m', maxErr < 1e-3, `max=${maxErr}`);
}

// ---- 6. 南北半球配对 --------------------------------------------------------
{
  let maxErr = 0;
  for (const lat of [1, 23.5, 45, 79.9]) {
    for (const lon of [114.5, 117, 119.4]) {
      const n = forward(lat, lon);
      const s = forward(-lat, lon);
      maxErr = Math.max(maxErr, Math.abs(n.northing + s.northing - 1e7));
      check(`pair E equal lat=${lat} lon=${lon}`, n.easting === s.easting, `dE=${Math.abs(n.easting - s.easting)}`);
    }
  }
  check('N_north + N_south == 1e7 (< 1e-6 m)', maxErr < 1e-6, `max=${maxErr}`);
}

// ---- 7. 比例因子随东偏增大 ---------------------------------------------------
{
  const k1 = forward(40, 118).scale;
  const k2 = forward(40, 119).scale;
  const k3 = forward(40, 120).scale;
  check('k increases eastward', k1 > K0 && k1 < k2 && k2 < k3, `${k1} ${k2} ${k3}`);
}

// ---- 8. 示范点 --------------------------------------------------------------
{
  const r = forward(39.9042, 116.4074);
  console.log(`      Beijing: zone=${r.zone} E=${r.easting.toFixed(4)} N=${r.northing.toFixed(4)} k=${r.scale} g=${r.convergence}`);
  check('Beijing zone 50', r.zone === 50);
  check('Beijing E in [400000, 600000]', r.easting >= 400000 && r.easting <= 600000, `E=${r.easting}`);
}

// ---- 9. 南半球往返（带 hemisphere） -----------------------------------------
{
  const f = forward(-33.8688, 151.2093); // Sydney
  const b = inverse(f.zone, f.easting, f.northing, f.hemisphere);
  const err = Math.max(Math.abs(b.lat + 33.8688), Math.abs(b.lon - 151.2093));
  check('Sydney roundtrip < 1e-9', err < 1e-9, `err=${err}, N=${f.northing.toFixed(3)}`);
}

console.log(failures ? `\n${failures} FAILURES` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
