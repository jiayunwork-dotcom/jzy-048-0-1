'use strict';

/**
 * 角度单位换算 —— 全项目唯一的度 <-> 弧度转换点。
 *
 * 约定：对外 API 与分带模块一律使用「度」；投影级数内部一律使用「弧度」。
 * 转换只发生在 forward.js / inverse.js 的入口与出口处，且只能调用本模块，
 * 严禁在业务代码里再乘 Math.PI / 180，避免"度被当成弧度又转一次"的经典错误。
 */

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

const toRadians = (degrees) => degrees * DEG_TO_RAD;
const toDegrees = (radians) => radians * RAD_TO_DEG;

module.exports = { toRadians, toDegrees };
