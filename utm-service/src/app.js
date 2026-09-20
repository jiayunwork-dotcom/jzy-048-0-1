'use strict';

const Fastify = require('fastify');
const { forward } = require('./lib/forward');
const { inverse } = require('./lib/inverse');
const { zoneNumber, centralMeridian } = require('./lib/zone');
const {
  validateForwardInput,
  validateInverseInput,
  validateZoneQuery,
} = require('./lib/validate');
const { ValidationError, OutOfProjectionDomainError } = require('./lib/errors');
const { bounds } = require('./lib/validate');

/** 预置示范点：北京（39.9042°N, 116.4074°E），落在 UTM 50N 带。 */
const SAMPLE_POINT = { name: '北京（中国）', lat: 39.9042, lon: 116.4074 };

/** 反算结果落点合理性检查：平面坐标须能映回 UTM 纬度覆盖域。 */
function assertInverseInDomain(lat) {
  const margin = 0.5; // 边界容差，避免误杀贴边的合法点
  if (!(lat >= bounds.LAT_MIN - margin && lat <= bounds.LAT_MAX + margin)) {
    throw new OutOfProjectionDomainError(
      `反算结果纬度 ${lat}° 超出 UTM 适用范围 [${bounds.LAT_MIN}, ${bounds.LAT_MAX}]，` +
        '给定的平面坐标不在该带有效覆盖内'
    );
  }
}

function buildApp(options = {}) {
  const app = Fastify({ logger: options.logger ?? false });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ValidationError) {
      return reply.status(400).send({
        error: { code: err.code, message: err.message, details: err.issues },
      });
    }
    if (err instanceof OutOfProjectionDomainError) {
      return reply.status(400).send({
        error: { code: err.code, message: err.message },
      });
    }
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      // Fastify 自身的客户端错误（如 JSON 解析失败、不支持的 Content-Type）
      return reply.status(err.statusCode).send({
        error: { code: 'BAD_REQUEST', message: err.message },
      });
    }
    req.log.error(err);
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' },
    });
  });

  app.get('/health', async () => ({ status: 'ok' }));

  /**
   * 正算：经纬度 -> UTM
   * body: { lat, lon, zone? }
   */
  app.post('/api/v1/utm/forward', async (req) => {
    const body = req.body ?? {};
    validateForwardInput(body);
    const result = forward(body.lat, body.lon, body.zone ?? null);
    return { input: { lat: body.lat, lon: body.lon }, ...result };
  });

  /**
   * 反算：UTM -> 经纬度
   * body: { zone, easting, northing, hemisphere? }
   */
  app.post('/api/v1/utm/inverse', async (req) => {
    const body = req.body ?? {};
    validateInverseInput(body);
    const hemisphere = body.hemisphere ? body.hemisphere.toUpperCase() : 'N';
    const result = inverse(body.zone, body.easting, body.northing, hemisphere);
    assertInverseInDomain(result.lat);
    return {
      input: {
        zone: body.zone,
        easting: body.easting,
        northing: body.northing,
        hemisphere,
      },
      ...result,
    };
  });

  /**
   * 分带查询：某经度落在哪个带、中央经线是多少
   * query: ?lon=116.4
   */
  app.get('/api/v1/utm/zone', async (req) => {
    const lon = validateZoneQuery(req.query);
    const zone = zoneNumber(lon);
    return { lon, zone, centralMeridian: centralMeridian(zone) };
  });

  /**
   * 预置示范点：一次调用即可确认级数展开正确（正算 + 往返闭合自检）。
   */
  app.get('/api/v1/utm/sample', async () => {
    const fwd = forward(SAMPLE_POINT.lat, SAMPLE_POINT.lon);
    const back = inverse(fwd.zone, fwd.easting, fwd.northing, fwd.hemisphere);
    return {
      description: '预置示范点（中国境内，UTM 50N 带），用于验证级数展开正确性',
      input: { ...SAMPLE_POINT },
      forward: fwd,
      roundtrip: {
        lat: back.lat,
        lon: back.lon,
        absErrorLatDeg: Math.abs(back.lat - SAMPLE_POINT.lat),
        absErrorLonDeg: Math.abs(back.lon - SAMPLE_POINT.lon),
      },
    };
  });

  return app;
}

module.exports = { buildApp, SAMPLE_POINT };
