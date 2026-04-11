// ── 华为云 APM API 模块 ─────────────────────────────────────────
// 此模块预留华为云APM接口，待用户提供API信息后实现

/**
 * 华为云 APM 配置
 * TODO: 根据实际华为云配置填写
 */
const HUAWEI_CLOUD_CONFIG = {
  // 华为云 APM 服务地址
  // 例如: 'https://apm.cn-north-4.myhuaweicloud.com'
  endpoint: import.meta.env.VITE_HUAWEI_CLOUD_APM_ENDPOINT || '',

  // 项目ID
  projectId: import.meta.env.VITE_HUAWEI_CLOUD_PROJECT_ID || '',

  // Region名称（例如: cn-north-4）
  region: import.meta.env.VITE_HUAWEI_CLOUD_REGION || '',

  // 应用ID (biz_id) - 从华为云APM控制台获取
  bizId: import.meta.env.VITE_HUAWEI_CLOUD_BIZ_ID
    ? parseInt(import.meta.env.VITE_HUAWEI_CLOUD_BIZ_ID, 10)
    : null,

  // 应用名称（可选，用于显示）
  appName: import.meta.env.VITE_HUAWEI_CLOUD_APP_NAME || '',

  // 环境ID（可选）
  envId: import.meta.env.VITE_HUAWEI_CLOUD_ENV_ID
    ? parseInt(import.meta.env.VITE_HUAWEI_CLOUD_ENV_ID, 10)
    : null,

  // 认证方式: 'aksk' | 'iam' | 'custom'
  authType: import.meta.env.VITE_HUAWEI_CLOUD_AUTH_TYPE || 'aksk',

  // AK/SK 认证（如果使用AK/SK）
  accessKeyId: import.meta.env.VITE_HUAWEI_CLOUD_AK || '',
  secretKeyId: import.meta.env.VITE_HUAWEI_CLOUD_SK || '',

  // IAM Token 认证（如果使用IAM）
  iamToken: import.meta.env.VITE_HUAWEI_CLOUD_IAM_TOKEN || '',

  // 自定义认证Header（如果使用custom认证）
  customAuthHeader: import.meta.env.VITE_HUAWEI_CLOUD_CUSTOM_AUTH || '',

  // API 版本
  apiVersion: 'v1',
};

/**
 * 统一的数据格式
 * 将华为云APM数据转换为与Jaeger兼容的格式
 */
class HuaweiCloudAPM {
  constructor(config = {}) {
    this.config = { ...HUAWEI_CLOUD_CONFIG, ...config };
    this.baseUrl = `${this.config.endpoint}/apm2/${this.config.apiVersion}`;
  }

  /**
   * 搜索 Traces
   * 使用华为云APM ShowSpanSearch API
   *
   * @param {Object} params - 搜索参数
   * @param {string} params.traceId - Trace ID
   * @param {string} params.vin - VIN码
   * @param {number} params.limit - 返回数量限制
   * @param {number} params.lookbackMs - 回溯时间（毫秒）
   * @returns {Promise<Array>} Traces列表（Jaeger格式）
   */
  async searchTraces({ traceId, vin, limit = 50, lookbackMs = 3600000 }) {
    console.log('[华为云APM] searchTraces 调用', { traceId, vin, limit, lookbackMs });

    if (!this.config.endpoint) {
      console.warn('[华为云APM] 未配置endpoint，返回空数据');
      return [];
    }

    if (!this.config.bizId) {
      console.warn('[华为云APM] 未配置bizId（应用ID），返回空数据');
      return [];
    }

    try {
      // 1. 构建请求参数
      const end = Date.now();
      const start = end - lookbackMs;

      // 格式化时间为 "YYYY-MM-DD HH:mm:ss"
      const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      };

      const requestBody = {
        region: this.config.region || '',
        biz_id: this.config.bizId,
        page: 1,
        page_size: Math.min(limit, 1000),
        start_time_string: formatTime(start),
        end_time_string: formatTime(end),
        codes: [],
      };

      // 如果指定了traceId，添加到请求中
      if (traceId) {
        requestBody.trace_id = traceId;
      }

      // 如果指定了vin，使用tags_content搜索
      if (vin) {
        requestBody.tags_content = vin;
        requestBody.real_source_full_match = false;
      }

      console.log('[华为云APM] 请求参数:', requestBody);

      // 2. 发送POST请求到华为云APM
      const url = `${this.config.endpoint}/v1/apm2/openapi/view/trace/span-search`;
      const response = await fetch(url, {
        method: 'POST',
        headers: await this._getHeaders('POST', url, requestBody),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`华为云APM API错误: ${response.status} ${response.statusText}`);
      }

      const huaweiData = await response.json();
      console.log('[华为云APM] 响应数据:', huaweiData);

      // 3. 转换为Jaeger格式
      return this._convertSpanSearchToJaegerFormat(huaweiData);

    } catch (error) {
      console.error('[华为云APM] searchTraces 失败:', error);
      throw error;
    }
  }

  /**
   * 获取单个 Trace 的拓扑图
   * 使用华为云APM ShowTopology API
   * 这是我们拓扑图视图的主要数据源
   *
   * @param {string} traceId - Trace ID
   * @returns {Promise<Object>} Trace拓扑图数据（Jaeger格式）
   */
  async getTrace(traceId) {
    console.log('[华为云APM] getTrace (topology) 调用', { traceId });

    if (!this.config.endpoint) {
      console.warn('[华为云APM] 未配置endpoint，返回null');
      return null;
    }

    try {
      // 1. 构建查询参数
      const queryParams = new URLSearchParams({
        trace_id: traceId,
      });

      if (this.config.region) {
        queryParams.append('region', this.config.region);
      }

      // 2. 发送GET请求到华为云APM
      const url = `${this.config.endpoint}/v1/apm2/openapi/view/trace/topology?${queryParams}`;
      console.log('[华为云APM] 请求URL:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: await this._getHeaders('GET', url, null),
      });

      if (!response.ok) {
        throw new Error(`华为云APM API错误: ${response.status} ${response.statusText}`);
      }

      const topologyData = await response.json();
      console.log('[华为云APM] 拓扑图响应数据:', topologyData);

      // 3. 转换为Jaeger格式
      return this._convertTopologyToJaegerFormat(topologyData);

    } catch (error) {
      console.error('[华为云APM] getTrace 失败:', error);
      throw error;
    }
  }

  /**
   * 获取服务/应用列表
   * TODO: 实现华为云APM获取应用列表接口
   *
   * @returns {Promise<Array<string>>} 服务名称列表
   */
  async getServices() {
    console.log('[华为云APM] getServices 调用');

    if (!this.config.endpoint) {
      console.warn('[华为云APM] 未配置endpoint，返回空数组');
      return [];
    }

    // TODO: 华为云APM需要找到对应的应用列表API
    // 可能的API端点: GET /v1/apm2/openapi/business/list
    // 或者: GET /v1/{project_id}/applications

    try {
      // 临时方案：返回配置中的应用名称（如果配置了的话）
      if (this.config.appName) {
        return [this.config.appName];
      }

      // 或者尝试从华为云APM获取应用列表（需要具体的API文档）
      // const url = `${this.config.endpoint}/v1/apm2/openapi/business/list`;
      // const response = await fetch(url, {
      //   method: 'GET',
      //   headers: await this._getHeaders(),
      // });
      // const data = await response.json();
      // return data.data?.map(app => app.name) || [];

      console.warn('[华为云APM] 应用列表API尚未实现，返回空数组');
      return [];

    } catch (error) {
      console.error('[华为云APM] getServices 失败:', error);
      return [];
    }
  }

  /**
   * 获取认证 Headers
   * 实现华为云AK/SK签名认证
   *
   * @private
   * @param {string} method - HTTP方法
   * @param {string} url - 请求URL
   * @param {Object} body - 请求体
   * @returns {Promise<Object>} Headers对象
   */
  async _getHeaders(method = 'GET', url = '', body = null) {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (this.config.authType === 'aksk') {
      // 华为云AK/SK认证
      try {
        const authHeaders = await this._getAKSKHeaders(method, url, body);
        Object.assign(headers, authHeaders);
      } catch (error) {
        console.error('[华为云APM] AK/SK认证失败:', error);
        // 如果AK/SK认证失败，尝试使用自定义header
        if (this.config.customAuthHeader) {
          headers['Authorization'] = this.config.customAuthHeader;
        }
      }

    } else if (this.config.authType === 'iam') {
      // IAM Token认证
      if (this.config.iamToken) {
        headers['X-Auth-Token'] = this.config.iamToken;
      }

    } else if (this.config.authType === 'custom') {
      // 自定义认证方式
      if (this.config.customAuthHeader) {
        headers['Authorization'] = this.config.customAuthHeader;
      }
    }

    return headers;
  }

  /**
   * 生成华为云AK/SK认证Headers
   * 使用HMAC-SHA256签名算法
   *
   * @private
   * @param {string} method - HTTP方法
   * @param {string} url - 请求URL
   * @param {Object} body - 请求体
   * @returns {Promise<Object>} 认证Headers
   */
  async _getAKSKHeaders(method, url, body = null) {
    // TODO: 实现完整的华为云AK/SK签名算法
    // 华为云签名算法参考: https://support.huaweicloud.com/api-arg/mac-0301.html

    // 基本实现框架：
    // 1. 构建CanonicalRequest
    // 2. 创建StringToSign
    // 3. 计算Signature
    // 4. 添加Authorization header

    // 临时实现：直接返回基础的AK信息（不安全，仅用于测试）
    // 在生产环境中必须实现完整的签名算法

    console.warn('[华为云APM] AK/SK签名认证尚未完全实现');

    // 示例结构（需要完善）:
    /*
    const accessKeyId = this.config.accessKeyId;
    const secretKeyId = this.config.secretKeyId;

    if (!accessKeyId || !secretKeyId) {
      throw new Error('AK/SK未配置');
    }

    // 计算签名（简化版，实际需要更复杂的实现）
    const timestamp = new Date().toISOString();
    const signature = await this._calculateSignature(method, url, body, timestamp, secretKeyId);

    return {
      'X-HW-AKSK-Access-Key': accessKeyId,
      'X-HW-AKSK-Signature': signature,
      'X-HW-AKSK-Timestamp': timestamp,
    };
    */

    // 临时：返回空，依赖后端CORS配置或其他认证方式
    return {};
  }

  /**
   * 计算华为云API签名
   *
   * @private
   * @param {string} method - HTTP方法
   * @param {string} url - 请求URL
   * @param {Object} body - 请求体
   * @param {string} timestamp - 时间戳
   * @param {string} secretKey - 密钥
   * @returns {Promise<string>} 签名值
   */
  async _calculateSignature(method, url, body, timestamp, secretKey) {
    // TODO: 实现华为云签名算法
    // 参考文档: https://support.huaweicloud.com/api-arg/mac-0301.html

    // 华为云签名算法步骤:
    // 1. 构建规范请求 (CanonicalRequest)
    // 2. 创建待签名字符串 (StringToSign)
    // 3. 计算签名 (HMAC-SHA256)
    // 4. 添加Authorization header

    // 示例代码框架:
    /*
    import { createHmac } from 'crypto';

    // 1. CanonicalRequest
    const canonicalRequest = this._buildCanonicalRequest(method, url, body);

    // 2. StringToSign
    const algorithm = 'SDK-HMAC-SHA256';
    const stringToSign = `${algorithm}\n${timestamp}\n${canonicalRequest}`;

    // 3. 计算签名
    const signature = createHmac('sha256', secretKey)
      .update(stringToSign)
      .digest('hex');

    return signature;
    */

    console.warn('[华为云APM] 签名计算尚未实现');
    return '';
  }

  /**
   * 将华为云APM SpanSearch结果转换为Jaeger格式
   *
   * @private
   * @param {Object} huaweiData - 华为云APM ShowSpanSearch返回的数据
   * @returns {Array} Jaeger格式的traces数组
   */
  _convertSpanSearchToJaegerFormat(huaweiData) {
    const traces = [];

    if (!huaweiData.span_info_list || !Array.isArray(huaweiData.span_info_list)) {
      console.warn('[华为云APM] 没有找到span_info_list');
      return traces;
    }

    // 按trace_id分组
    const traceGroups = new Map();

    huaweiData.span_info_list.forEach(span => {
      const traceId = span.trace_id || span.global_trace_id;

      if (!traceGroups.has(traceId)) {
        traceGroups.set(traceId, []);
      }

      traceGroups.get(traceId).push(span);
    });

    // 转换每个trace
    traceGroups.forEach((spans, traceId) => {
      const jaegerTrace = {
        traceID: traceId,
        spans: spans.map(span => this._convertSpanToJaegerFormat(span, traceId)),
        processes: this._extractProcessesFromSpans(spans),
      };

      traces.push(jaegerTrace);
    });

    console.log('[华为云APM] 转换了', traces.length, '个traces');
    return traces;
  }

  /**
   * 将华为云APM拓扑图数据转换为Jaeger格式
   * 这是拓扑图视图使用的主要转换方法
   *
   * @private
   * @param {Object} topologyData - 华为云APM ShowTopology返回的数据
   * @returns {Object} Jaeger格式的trace
   */
  _convertTopologyToJaegerFormat(topologyData) {
    if (!topologyData) {
      return null;
    }

    const traceId = topologyData.global_trace_id || 'topology-trace';

    // 从拓扑图数据提取节点和边
    const nodes = topologyData.node_list || [];
    const lines = topologyData.line_list || [];

    // 将拓扑节点转换为Jaeger processes
    const processes = {};
    nodes.forEach(node => {
      const serviceName = node.node_name?.split(':')[0] || node.node_name || 'unknown';
      processes[node.node_id] = {
        serviceName: serviceName,
        tags: [
          { key: 'node_id', value: String(node.node_id), type: 'string' },
          { key: 'region', value: this.config.region || '', type: 'string' },
        ],
      };
    });

    // 将拓扑边转换为Jaeger spans
    const spans = lines.map((line, index) => {
      const spanId = line.span_id || String(index + 1);
      const parentNodeId = line.start_node_id;
      const nodeId = line.end_node_id;

      // 从hint中解析出操作信息
      // hint格式示例: "(1)((GET)(/apm2/health/v1/health-check)(200))"
      let operationName = 'unknown';
      let httpMethod = '';
      let httpUrl = '';
      let httpStatusCode = '';

      if (line.hint) {
        const match = line.hint.match(/\(([^)]+)\)/g);
        if (match && match.length >= 2) {
          httpMethod = match[1]?.replace(/\(|\)/g, '') || '';
          httpUrl = match[2]?.replace(/\(|\)/g, '') || '';
          httpStatusCode = match[3]?.replace(/\(|\)/g, '') || '';
          operationName = httpUrl || 'unknown';
        }
      }

      // 从server_info中获取详细信息
      const serverInfo = line.server_info || {};
      const startTime = serverInfo.start_time || Date.now() * 1000;
      const duration = serverInfo.time_used || 0;

      return {
        traceID: traceId,
        spanID: spanId,
        operationName: operationName,
        processID: nodeId,
        parentSpanID: parentNodeId ? String(parentNodeId) : null,
        startTime: startTime,
        duration: duration,
        tags: this._buildTopologyTags(line, httpMethod, httpUrl, httpStatusCode),
        logs: [],
        references: parentNodeId ? [
          {
            refType: 'CHILD_OF',
            traceID: traceId,
            spanID: String(parentNodeId),
          }
        ] : [],
      };
    });

    const jaegerTrace = {
      traceID: traceId,
      spans: spans,
      processes: processes,
      warnings: topologyData.warnings,
    };

    console.log('[华为云APM] 拓扑图转换完成:', {
      traceId,
      nodeCount: nodes.length,
      lineCount: lines.length,
      spanCount: spans.length,
    });

    return jaegerTrace;
  }

  /**
   * 将单个华为云APM span转换为Jaeger格式
   *
   * @private
   * @param {Object} span - 华为云APM的span
   * @param {string} traceId - Trace ID
   * @returns {Object} Jaeger格式的span
   */
  _convertSpanToJaegerFormat(span, traceId) {
    const operationName = span.real_source || span.source || 'unknown';

    return {
      traceID: traceId,
      spanID: span.span_id || '1',
      operationName: operationName,
      processID: span.app_id || span.instance_id || 'unknown',
      parentSpanID: null, // TODO: 从span解析父span关系
      startTime: (span.start_time || Date.now()) * 1000, // 转换为微秒
      duration: (span.time_used || 0) * 1000, // 转换为微秒
      tags: this._convertSpanTags(span),
      logs: [],
      references: [],
    };
  }

  /**
   * 从spans数组中提取processes
   *
   * @private
   * @param {Array} spans - Spans数组
   * @returns {Object} Jaeger格式的processes
   */
  _extractProcessesFromSpans(spans) {
    const processes = {};

    spans.forEach(span => {
      const processId = span.app_id || span.instance_id || 'unknown';

      if (!processes[processId]) {
        processes[processId] = {
          serviceName: span.app_name || span.source || 'unknown-service',
          tags: [
            { key: 'app_id', value: String(span.app_id || ''), type: 'string' },
            { key: 'env_name', value: span.env_name || '', type: 'string' },
            { key: 'instance_name', value: span.instance_name || '', type: 'string' },
            { key: 'region', value: span.region || '', type: 'string' },
            { key: 'type', value: span.type || '', type: 'string' },
          ],
        };
      }
    });

    return processes;
  }

  /**
   * 构建拓扑图span的tags
   *
   * @private
   * @param {Object} line - 拓扑边数据
   * @param {string} httpMethod - HTTP方法
   * @param {string} httpUrl - HTTP URL
   * @param {string} httpStatusCode - HTTP状态码
   * @returns {Array} Jaeger格式的tags
   */
  _buildTopologyTags(line, httpMethod, httpUrl, httpStatusCode) {
    const tags = [
      { key: 'span.kind', value: 'server', type: 'string' },
    ];

    if (httpMethod) {
      tags.push({ key: 'http.method', value: httpMethod, type: 'string' });
    }

    if (httpUrl) {
      tags.push({ key: 'http.url', value: httpUrl, type: 'string' });
    }

    if (httpStatusCode) {
      tags.push({ key: 'http.status_code', value: httpStatusCode, type: 'string' });
    }

    if (line.server_info?.time_used !== undefined) {
      tags.push({ key: 'duration', value: String(line.server_info.time_used), type: 'string' });
    }

    if (line.hint) {
      tags.push({ key: 'hint', value: line.hint, type: 'string' });
    }

    return tags;
  }

  /**
   * 转换单个Trace到Jaeger格式
   *
   * @private
   * @param {Object} huaweiTrace - 华为云APM单个trace数据
   * @returns {Object} Jaeger格式的trace
   */
  _convertSingleTraceToJaegerFormat(huaweiTrace) {
    // TODO: 实现单个trace的转换
    return null;
  }

  /**
   * 转换Tags格式（通用方法）
   *
   * @private
   * @param {Array|Object} huaweiTags - 华为云APM的tags
   * @returns {Array} Jaeger格式的tags
   */
  _convertTags(huaweiTags) {
    if (!huaweiTags) return [];

    if (Array.isArray(huaweiTags)) {
      return huaweiTags.map(tag => ({
        key: tag.key,
        value: String(tag.value),
        type: tag.type || 'string',
      }));
    } else if (typeof huaweiTags === 'object') {
      return Object.entries(huaweiTags).map(([key, value]) => ({
        key,
        value: String(value),
        type: 'string',
      }));
    }

    return [];
  }

  /**
   * 转换span的tags（专门处理华为云APM span数据）
   *
   * @private
   * @param {Object} span - 华为云APM的span
   * @returns {Array} Jaeger格式的tags
   */
  _convertSpanTags(span) {
    const tags = [];

    // 基本信息tags
    tags.push({ key: 'span.kind', value: 'server', type: 'string' });

    if (span.type) {
      tags.push({ key: 'span.type', value: span.type, type: 'string' });
    }

    if (span.http_method) {
      tags.push({ key: 'http.method', value: span.http_method, type: 'string' });
    }

    if (span.code) {
      tags.push({ key: 'http.status_code', value: String(span.code), type: 'string' });
    }

    if (span.has_error) {
      tags.push({ key: 'error', value: 'true', type: 'bool' });
    }

    if (span.error_reasons) {
      tags.push({ key: 'error.message', value: span.error_reasons, type: 'string' });
    }

    // 添加自定义tags
    if (span.tags && typeof span.tags === 'object') {
      Object.entries(span.tags).forEach(([key, value]) => {
        tags.push({
          key,
          value: String(value),
          type: 'string',
        });
      });
    }

    return tags;
  }

  /**
   * 转换Processes格式
   *
   * @private
   * @param {Array} spans - Spans数组
   * @returns {Object} Jaeger格式的processes
   */
  _convertProcesses(spans) {
    const processes = {};

    spans.forEach(span => {
      const processId = span.processId;
      if (!processes[processId]) {
        processes[processId] = {
          serviceName: span.serviceName,
          tags: this._convertTags(span.serviceTags || {}),
        };
      }
    });

    return processes;
  }

  /**
   * 测试连接
   * TODO: 实现连接测试
   *
   * @returns {Promise<boolean>} 连接是否成功
   */
  async testConnection() {
    console.log('[华为云APM] testConnection 调用');

    try {
      const services = await this.getServices();
      console.log('[华为云APM] 测试成功，获取到服务列表:', services);
      return true;
    } catch (error) {
      console.error('[华为云APM] 测试连接失败:', error);
      return false;
    }
  }
}

// ── 导出 ───────────────────────────────────────────────────

/**
 * 创建华为云APM客户端实例
 */
export function createHuaweiCloudAPM(config) {
  return new HuaweiCloudAPM(config);
}

/**
 * 默认实例（使用环境变量配置）
 */
export const huaweiCloudAPM = new HuaweiCloudAPM();

// 导出类，支持自定义配置
export default HuaweiCloudAPM;
