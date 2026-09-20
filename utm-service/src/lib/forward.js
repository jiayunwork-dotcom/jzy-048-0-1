'use strict';

const {
  a,
  e,
  e2,
  A,
  ALPHA,
  SERIES_ORDER,
  K0,
  FALSE_EASTING,
  FALSE_NORTHING,
} = require('./ellipsoid');
const { toRadians, toDegrees } = require('./angles');
const { zoneNumber, centralMeridian } = require('./zone');

/** 把角度(度)规整到 (-180, 180]，用于跨带/日界线场景下的经差计算。 */
function normalizeDeltaLon(deg) {
  let d = deg % 360;
  if (d <= -180) d += 360;
  else if (d > 180) d -= 360;
  return d;
}

/**
 * 横轴墨卡托正算（Krüger n 级数，6 阶）：大地经纬度 -> UTM 平面坐标。
 *
 * 同时给出该点的比例因子 k 与子午线收敛角 gamma：
 *   k 由级数导数严格推得（非数值微分）：
 *     k = k0·(A/a)·|dw/dw'|·sqrt(1−e²sin²φ) / (cosφ·sqrt(τ'²+cos²λ))
 *   gamma = gamma' + atan2(q, p)，其中 gamma' 为等角球面部分，
 *     (p, q) 为级数映射导数的实部/虚部组合。
 * 收敛角符号约定（GeographicLib/Karney 约定）：gamma 为网格北（坐标纵线北）
 * 相对真北的顺时针夹角，北半球中央经线以东为正，
 * 与 gamma ≈ atan(tan(λ−λ0)·sinφ) 的符号一致。
 *
 * @param {number} latDeg 大地纬度（度），[-80, 84]
 * @param {number} lonDeg 大地经度（度），[-180, 180]
 * @param {number|null} forcedZone 调用方强制指定的带号（null 表示自动分带）
 */
function forward(latDeg, lonDeg, forcedZone = null) {
  const autoZone = zoneNumber(lonDeg);
  const zone = forcedZone == null ? autoZone : forcedZone;

  // 度 -> 弧度：全模块唯一的单位转换点（见 angles.js 约定）
  const phi = toRadians(latDeg);
  const lam = toRadians(normalizeDeltaLon(lonDeg - centralMeridian(zone)));

  // ---- 等角纬度变换 -------------------------------------------------------
  const tau = Math.tan(phi);
  const sec = Math.hypot(1, tau); // = 1/cosφ，数值稳定
  const sig = Math.sinh(e * Math.atanh((e * tau) / sec));
  const taup = Math.hypot(1, sig) * tau - sig * sec; // = tan(等角纬度)

  // ---- 等角球面横轴墨卡托 --------------------------------------------------
  const slam = Math.sin(lam);
  const clam = Math.cos(lam);
  const xip = Math.atan2(taup, clam); // xi'
  const etap = Math.asinh(slam / Math.hypot(taup, clam)); // eta'
  const gammap = Math.atan2(slam * taup, clam * Math.hypot(1, taup));

  // ---- Krüger 级数改正及其导数 --------------------------------------------
  let xi = xip;
  let eta = etap;
  let p = 1; // Re(dw/dw')
  let q = 0; // -Im(dw/dw')
  for (let j = 1; j <= SERIES_ORDER; j++) {
    const c = Math.cos(2 * j * xip);
    const s = Math.sin(2 * j * xip);
    const ch = Math.cosh(2 * j * etap);
    const sh = Math.sinh(2 * j * etap);
    xi += ALPHA[j] * s * ch;
    eta += ALPHA[j] * c * sh;
    p += 2 * j * ALPHA[j] * c * ch;
    q += 2 * j * ALPHA[j] * s * sh;
  }

  // ---- 比例因子与假东/假北 -------------------------------------------------
  const easting = FALSE_EASTING + K0 * A * eta;
  const northFromEquator = K0 * A * xi;
  const northern = latDeg >= 0;
  const northing = northern
    ? northFromEquator
    : FALSE_NORTHING + northFromEquator;

  // ---- 点比例因子与子午线收敛角 --------------------------------------------
  const sinPhi = Math.sin(phi);
  const scale =
    ((K0 * (A / a)) / (Math.cos(phi) * Math.hypot(taup, clam))) *
    Math.hypot(p, q) *
    Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const convergenceDeg = toDegrees(gammap + Math.atan2(q, p));

  return {
    zone,
    autoZone,
    forcedZone: forcedZone != null && forcedZone !== autoZone,
    centralMeridian: centralMeridian(zone),
    easting,
    northing,
    scale,
    convergence: convergenceDeg,
    hemisphere: northern ? 'N' : 'S',
  };
}

module.exports = { forward };
