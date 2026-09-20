'use strict';

/**
 * UTM 分带逻辑（独立模块）。
 *
 * 规则（按需求钉死）：
 *   带号 n = floor((lon + 180) / 6) + 1        —— lon 单位为度，范围 [-180, 180]
 *   中央经线 λ0 = 3 + 6·(n − 1) − 180 (度)
 *
 * 边界约定：lon = +180 时公式给出 61，按惯例钳制到 60 带
 * （180° 经线与 -180° 为同一子午线，归入 60 带西边缘）。
 */

const ZONE_COUNT = 60;
const ZONE_WIDTH_DEG = 6;

/** 经度(度) -> 带号 1..60。输入需已通过经度范围校验。 */
function zoneNumber(longitudeDeg) {
  const zone = Math.floor((longitudeDeg + 180) / ZONE_WIDTH_DEG) + 1;
  return Math.min(Math.max(zone, 1), ZONE_COUNT);
}

/** 带号 -> 中央经线(度)。 */
function centralMeridian(zone) {
  return 3 + ZONE_WIDTH_DEG * (zone - 1) - 180;
}

/** 带号合法性：1..60 的整数。 */
function isValidZone(zone) {
  return Number.isInteger(zone) && zone >= 1 && zone <= ZONE_COUNT;
}

module.exports = { zoneNumber, centralMeridian, isValidZone, ZONE_COUNT, ZONE_WIDTH_DEG };
