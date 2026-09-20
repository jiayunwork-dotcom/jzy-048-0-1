'use strict';

const {
  A,
  BETA,
  DELTA,
  SERIES_ORDER,
  K0,
  FALSE_EASTING,
  FALSE_NORTHING,
} = require('./ellipsoid');
const { toRadians, toDegrees } = require('./angles');
const { centralMeridian } = require('./zone');

/** 把经度(度)规整到 [-180, 180]。 */
function normalizeLon(deg) {
  let d = deg % 360;
  if (d < -180) d += 360;
  else if (d > 180) d -= 360;
  return d;
}

/**
 * 横轴墨卡托反算（Krüger n 级数，6 阶）：UTM 平面坐标 -> 大地经纬度。
 *
 * 与 forward.js 严格互逆：同一套级数参数、同一组常数，
 * 往返闭合误差在 UTM 带内为纳米量级。
 *
 * @param {number} zone      带号 1..60
 * @param {number} easting   东坐标（米，含 500000 假东）
 * @param {number} northing  北坐标（米，南半球含 10000000 假北）
 * @param {'N'|'S'} hemisphere 半球；南半球坐标会先做假北还原
 */
function inverse(zone, easting, northing, hemisphere = 'N') {
  const northFromEquator =
    hemisphere === 'S' ? northing - FALSE_NORTHING : northing;

  const xi = northFromEquator / (K0 * A);
  const eta = (easting - FALSE_EASTING) / (K0 * A);

  // ---- Krüger 逆级数 -------------------------------------------------------
  let xip = xi;
  let etap = eta;
  for (let j = 1; j <= SERIES_ORDER; j++) {
    xip -= BETA[j] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    etap -= BETA[j] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }

  // ---- 等角球面横轴墨卡托反算 ----------------------------------------------
  const chi = Math.asin(Math.sin(xip) / Math.cosh(etap)); // 等角纬度
  const lam = Math.atan2(Math.sinh(etap), Math.cos(xip)); // 相对中央经线经差(弧度)

  // ---- 等角纬度 -> 大地纬度（delta 级数） ------------------------------------
  let phi = chi;
  for (let j = 1; j <= SERIES_ORDER; j++) {
    phi += DELTA[j] * Math.sin(2 * j * chi);
  }

  // 弧度 -> 度：全模块唯一的单位转换点（见 angles.js 约定）
  const lat = toDegrees(phi);
  const lon = normalizeLon(toDegrees(lam) + centralMeridian(zone));

  return { lat, lon, zone, hemisphere };
}

module.exports = { inverse };
