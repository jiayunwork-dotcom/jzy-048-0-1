'use strict';

/**
 * 结构化错误类型。所有非法输入统一抛出 ValidationError，
 * 由全局错误处理器序列化为：
 *   HTTP 400 { "error": { "code", "message", "details": [...] } }
 * code 按错误类型区分，调用方可据此编程处理。
 */

class ValidationError extends Error {
  /**
   * @param {Array<{field: string, code: string, message: string}>} issues
   */
  constructor(issues) {
    super(issues.map((i) => `${i.field}: ${i.message}`).join('; '));
    this.name = 'ValidationError';
    this.statusCode = 400;
    // 顶层 code 取首个问题的类型，便于简单判断；完整列表在 details 中
    this.code = issues[0].code;
    this.issues = issues;
  }
}

/** 反算平面坐标落出 UTM 有效覆盖范围（非单字段格式错误）。 */
class OutOfProjectionDomainError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OutOfProjectionDomainError';
    this.statusCode = 400;
    this.code = 'COORDINATES_OUT_OF_RANGE';
  }
}

module.exports = { ValidationError, OutOfProjectionDomainError };
