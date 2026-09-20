'use strict';

const { a, e2 } = require('./ellipsoid');

/**
 * 子午线弧长（独立模块）：自赤道至纬度 phi 的椭球子午线弧长 M(phi)。
 *
 * 采用 USGS / Snyder《Map Projections — A Working Manual》式 (3-21)
 * 的 e^2 级数展开（与 Krüger alpha 级数相互独立），用作交叉校验：
 * 中央经线上 Krüger 正算北坐标必须满足 N = K0 * M(phi)，
 * 两套独立级数互相印证可锁定展开式正确性。
 *
 * @param {number} phi 大地纬度（弧度）
 * @returns {number} 弧长（米），南纬为负
 */
function meridianArc(phi) {
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  return (
    a *
    ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
      ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
      ((35 * e6) / 3072) * Math.sin(6 * phi))
  );
}

module.exports = { meridianArc };
