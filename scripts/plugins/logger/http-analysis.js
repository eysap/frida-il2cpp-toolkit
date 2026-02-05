"use strict";

/**
 * HTTP request/response analysis utilities for API hooking
 *
 * Request Analysis:
 * - Base path extraction from configuration objects
 * - URL construction from base + relative paths
 * - HTTP method detection from method objects
 * - Request options parsing (headers, query params, body, form data)
 *
 * Response Analysis:
 * - Status code extraction
 * - Response summary generation (status, reason, URI)
 * - ToString() parsing for HttpResponseMessage objects
 *
 * Special Handling:
 * - NewRequest method detection and logging
 * - CallApi/SendAsync response interception
 * - Headers block extraction from ToString() output
 * - Body detection for POST/PUT/PATCH requests
 *
 * @module http-analysis
 */

(function(global) {
  const utils = global.IL2CPPHooker.utils;
  const formatters = global.IL2CPPHooker.formatters;

  /**
   * Extracts base path from configuration object
   * @param {NativePointer} configPtr - Configuration object pointer
   * @returns {string|null} Base path or null
   */
  function extractBasePathFromConfig(configPtr) {
    return utils.findStringField(configPtr, (name) =>
      name.toLowerCase().includes("basepath")
    );
  }

  /**
   * Builds full URL from base path and relative path
   * @param {string} basePath - Base URL path
   * @param {string} path - Relative path
   * @returns {string} Combined URL
   */
  function buildUrl(basePath, path) {
    if (!basePath) return path || "";
    if (!path) return basePath;
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
    const p = path.startsWith("/") ? path : `/${path}`;
    return base + p;
  }

  /**
   * Reads HTTP method from method object
   * @param {NativePointer} methodPtr - HTTP method object pointer
   * @returns {string|null} HTTP method string or null
   */
  function readHttpMethod(methodPtr) {
    if (!methodPtr || methodPtr.isNull()) return null;
    const asString = utils.tryObjectToString(methodPtr, 50);
    if (asString) return asString;
    return utils.findStringField(methodPtr, (name) =>
      name.toLowerCase().includes("method")
    );
  }

  /**
   * Extracts detailed options from request options object
   * @param {NativePointer} optionsPtr - Options object pointer
   * @param {Object} opts - Preview options
   * @returns {Object} Extracted details {details, body, form}
   */
  function extractOptionsDetails(optionsPtr, opts) {
    const result = {
      details: [],
      body: null,
      form: null,
    };

    if (!optionsPtr || optionsPtr.isNull()) return result;

    try {
      const obj = new Il2Cpp.Object(optionsPtr);
      for (const field of obj.class.fields) {
        if (field.isStatic) continue;
        const name = field.name || "";
        const lower = name.toLowerCase();
        const value = obj.field(field.name).value;
        const summary = formatters.summarizeFieldValue(value, field.type.name, opts);

        if (lower.includes("pathparameters")) {
          result.details.push(`pathParams=${summary}`);
        } else if (lower.includes("queryparameters")) {
          result.details.push(`query=${summary}`);
        } else if (lower.includes("headerparameters")) {
          result.details.push(`headers=${summary}`);
        } else if (lower.includes("formparameters")) {
          result.form = summary;
          result.details.push(`form=${summary}`);
        } else if (lower.includes("fileparameters")) {
          result.details.push(`files=${summary}`);
        } else if (lower.includes("cookies")) {
          result.details.push(`cookies=${summary}`);
        } else if (
          lower.includes("body") ||
          lower.includes("postbody") ||
          lower.includes("data")
        ) {
          if (!result.body) {
            result.body = summary;
          }
        }
      }
    } catch (_) {}

    return result;
  }

  /**
   * Extracts response summary information
   * @param {NativePointer} respPtr - Response object pointer
   * @param {Object} opts - Options with maxStringLength
   * @returns {string|null} Response summary or null
   */
  function extractResponseSummary(respPtr, opts) {
    if (!respPtr || respPtr.isNull()) return null;

    const parts = [];
    const str = utils.tryObjectToString(respPtr, opts.maxStringLength);
    if (str) parts.push(`"${str}"`);

    const status = utils.findIntField(respPtr, (name) =>
      name.toLowerCase().includes("status")
    );
    if (status !== null) parts.push(`status=${status}`);

    const reason = utils.findStringField(respPtr, (name) =>
      name.toLowerCase().includes("reason")
    );
    if (reason) parts.push(`reason="${utils.truncate(reason, opts.maxStringLength)}"`);

    const uri = utils.findStringField(respPtr, (name) =>
      name.toLowerCase().includes("uri")
    );
    if (uri) parts.push(`uri="${utils.truncate(uri, opts.maxStringLength)}"`);

    return parts.length > 0 ? parts.join(" ") : null;
  }

  /**
   * Extracts request summary from HttpRequestMessage
   * @param {NativePointer} reqPtr - Request object pointer
   * @param {Object} opts - Options with reqToStringMaxLen
   * @returns {Object|null} Request info {method, uri, headersBlock} or null
   */
  function extractRequestSummary(reqPtr, opts) {
    if (!reqPtr || reqPtr.isNull()) return null;

    const str = utils.tryObjectToString(
      reqPtr,
      opts.reqToStringMaxLen || opts.maxStringLength
    );
    if (!str) return null;

    const methodMatch = str.match(/Method:\s*([^,]+)/);
    const uriMatch = str.match(/RequestUri:\s*'([^']+)'/);
    const method = methodMatch ? methodMatch[1].trim() : null;
    const uri = uriMatch ? uriMatch[1].trim() : null;

    let headersBlock = null;
    const headersIdx = str.indexOf("Headers:");
    if (headersIdx !== -1) {
      const braceStart = str.indexOf("{", headersIdx);
      if (braceStart !== -1) {
        const braceEnd = str.indexOf("}", braceStart);
        headersBlock =
          braceEnd !== -1
            ? str.slice(braceStart, braceEnd + 1)
            : str.slice(braceStart);
      } else {
        headersBlock = str.slice(headersIdx + "Headers:".length).trim();
      }
    }

    return { method, uri, headersBlock };
  }

  // Export to global scope
  global.IL2CPPHooker = global.IL2CPPHooker || {};
  global.IL2CPPHooker.httpAnalysis = {
    extractBasePathFromConfig,
    buildUrl,
    readHttpMethod,
    extractOptionsDetails,
    extractResponseSummary,
    extractRequestSummary,
  };
})(globalThis);
