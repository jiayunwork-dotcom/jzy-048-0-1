'use strict';

const { isValidZone } = require('./zone');
const { ValidationError } = require('./errors');

/**
 * 输入校验（独立模块）。进入投影计算前必须先过这里的校验，
 * 任何非法输入都抛出 ValidationError（结构化、按类型区分），绝不硬算。
 *
 * 校验规则：
 *   纬度   [-80, 84]      —— UTM 投影适用范围（北约 84° 至南纬 80°）
 *   经度   [-180, 180]
 *   带号   1..60 的整数
 *   东坐标 [100000, 900000] m —— 覆盖赤道处带宽极值(约 16.6万~83.4万)并留有余量
 *   北坐标 [0, 10000000]  m
 *   半球   'N' | 'S'（大小写不敏感，可选）
 */

const LAT_MIN = -80;
const LAT_MAX = 84;
const LON_MIN = -180;
const LON_MAX = 180;
const EASTING_MIN = 100000;
const EASTING_MAX = 900000;
const NORTHING_MIN = 0;
const NORTHING_MAX = 10000000;

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function checkNumber(issues, field, value, { min, max, code, label }) {
  if (value === undefined || value === null) {
    issues.push({ field, code: 'MISSING_FIELD', message: `缺少必填字段 ${label}` });
    return;
  }
  if (!isFiniteNumber(value)) {
    issues.push({
      field,
      code: 'INVALID_TYPE',
      message: `${label} 必须是有限数值（拒绝字符串/NaN/Infinity）`,
    });
    return;
  }
  if (value < min || value > max) {
    issues.push({
      field,
      code,
      message: `${label} ${value} 超出有效范围 [${min}, ${max}]`,
    });
  }
}

function checkZone(issues, zone, { required }) {
  if (zone === undefined || zone === null) {
    if (required) {
      issues.push({ field: 'zone', code: 'MISSING_FIELD', message: '缺少必填字段带号 zone' });
    }
    return;
  }
  if (!isValidZone(zone)) {
    issues.push({
      field: 'zone',
      code: 'INVALID_ZONE',
      message: `带号 ${JSON.stringify(zone)} 非法，必须是 1..60 的整数`,
    });
  }
}

function checkHemisphere(issues, hemisphere) {
  if (hemisphere === undefined || hemisphere === null) return; // 可选，默认 'N'
  if (typeof hemisphere !== 'string' || !/^[ns]$/i.test(hemisphere)) {
    issues.push({
      field: 'hemisphere',
      code: 'INVALID_HEMISPHERE',
      message: `半球标识 ${JSON.stringify(hemisphere)} 非法，只能是 'N' 或 'S'`,
    });
  }
}

/** 校验正算输入 {lat, lon, zone?}，全部通过则静默返回。 */
function validateForwardInput(body) {
  const issues = [];
  const { lat, lon, zone } = body || {};
  checkNumber(issues, 'lat', lat, {
    min: LAT_MIN,
    max: LAT_MAX,
    code: 'LATITUDE_OUT_OF_RANGE',
    label: '纬度 lat',
  });
  checkNumber(issues, 'lon', lon, {
    min: LON_MIN,
    max: LON_MAX,
    code: 'LONGITUDE_OUT_OF_RANGE',
    label: '经度 lon',
  });
  checkZone(issues, zone, { required: false });
  if (issues.length) throw new ValidationError(issues);
}

/** 校验反算输入 {zone, easting, northing, hemisphere?}。 */
function validateInverseInput(body) {
  const issues = [];
  const { zone, easting, northing, hemisphere } = body || {};
  checkZone(issues, zone, { required: true });
  checkNumber(issues, 'easting', easting, {
    min: EASTING_MIN,
    max: EASTING_MAX,
    code: 'EASTING_OUT_OF_RANGE',
    label: '东坐标 easting',
  });
  checkNumber(issues, 'northing', northing, {
    min: NORTHING_MIN,
    max: NORTHING_MAX,
    code: 'NORTHING_OUT_OF_RANGE',
    label: '北坐标 northing',
  });
  checkHemisphere(issues, hemisphere);
  if (issues.length) throw new ValidationError(issues);
}

/** 校验分带查询输入 {lon}。 */
function validateZoneQuery(query) {
  const issues = [];
  const raw = query ? query.lon : undefined;
  // 查询串中的空串 / 非数字串必须拒绝；注意 Number('') === 0 的陷阱
  const lon =
    typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw === undefined ? undefined : NaN;
  if (lon === undefined) {
    issues.push({ field: 'lon', code: 'MISSING_FIELD', message: '缺少必填参数经度 lon' });
  } else if (!isFiniteNumber(lon)) {
    issues.push({ field: 'lon', code: 'INVALID_TYPE', message: '经度 lon 必须是有限数值' });
  } else if (lon < LON_MIN || lon > LON_MAX) {
    issues.push({
      field: 'lon',
      code: 'LONGITUDE_OUT_OF_RANGE',
      message: `经度 lon ${lon} 超出有效范围 [${LON_MIN}, ${LON_MAX}]`,
    });
  }
  if (issues.length) throw new ValidationError(issues);
  return lon;
}

module.exports = {
  validateForwardInput,
  validateInverseInput,
  validateZoneQuery,
  bounds: {
    LAT_MIN,
    LAT_MAX,
    LON_MIN,
    LON_MAX,
    EASTING_MIN,
    EASTING_MAX,
    NORTHING_MIN,
    NORTHING_MAX,
  },
};
