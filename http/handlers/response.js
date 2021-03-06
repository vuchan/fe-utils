import createError from 'axios/lib/core/createError'
import { errorMessage } from '@@/utils/message'
import { getMessage } from '../helpers/get-message'
import { codeHandlers } from '../helpers/code-status-handler'
import { isRightResponse } from '../helpers/is-right-response'
import { isStandardResponseBody } from '../helpers/is-standard-response'
import { HTTP_STATUS_CODE } from '../config/http-code-status'

/**
 * @typedef {Object<string, any>} RequestConfig
 * @property {XMLHttpRequest} request
 * @property {string} method
 * @property {string} url
 * @property {*} data
 * @property {boolean} [external] 外部的非 ResponseData 的数据结构因此也不满足我们内部判断 isRightResponse 的标准
 * @property {boolean} [debug] 开启 debug mode，打印消息
 * @property {boolean} [all] 需要整个 response 被返回到业务
 * @property {boolean} [ignoreMsg] 是否忽略消息
 * @property {boolean} [handleError] 需要业务自身处理异常，不走通用异常处理逻辑
 * // @property {Function} [showErrorMsg] 默认提示错消息的方法
 */

/**
 * @typedef ResponseData
 * @property {0|1|99|100|403|404|429|503|1403|1503|200} code
 * @property {any} data
 * @property {string} message
 * @property {boolean} success
 */

/**
 * References:
 * 0. [adapters/xhr.js](https://github.com/axios/axios/blob/master/lib/adapters/xhr.js#L67)
 * 1. [core/settle.js](https://github.com/axios/axios/blob/master/lib/core/settle.js#L18)
 * 2. [core/createError.js](https://github.com/axios/axios/blob/master/lib/core/createError.js#L15)
 * 3. [core/enhanceError.js](https://github.com/axios/axios/blob/master/lib/core/enhanceError.js#L13)
 *
 * @see {@link https://github.com/axios/axios/blob/master/lib/adapters/xhr.js#L50}
 * @example
 *  ```js
 *    response: { data: responseData, status: request.status, statusText: request.statusText, headers: responseHeaders, config: config, request: request }
 *  ```
 *
 * @typedef AxiosResponse
 * @property {ResponseData} data
 * @property {number} status
 * @property {string} statusText
 * @property {Map<string, any>} headers
 * @property {RequestConfig} config
 * @property {Request} request
 *
 * @param {AxiosResponse} response
 * @param {boolean} allResponse 向前兼容: 是否返回整个 ResponseData
 */
export function responseHandler(response, allResponse = false) {
  const { data, status, statusText, /* headers, */ request, config } = response // 参见0 参见1
  const { all, external, debug, handleError, ignoreMsg } = config

  if (debug || status !== HTTP_STATUS_CODE.OK) {
    console.log(response)
  }

  if (status === HTTP_STATUS_CODE.OK) {
    if (all) return response

    // 检测如果非标准 ResponseBody 被返回，则返回整个 data，而非 ResponseBody.data
    // 例如：枚举对象 /enum, /mfe, /config 等相关接口返回的数据结构
    if (external || !isStandardResponseBody(data)) {
      return allResponse ? response : data
    } else {
      if (isRightResponse(data)) {
        return allResponse ? response : data.data
      } else {
        const handler = codeHandlers[data.code] || errorMessage
        const errorMsg = getMessage(data, status, statusText)

        if (!handleError) {
          if (!ignoreMsg && handler) {
            handler(errorMsg)
          }

          if (allResponse) {
            return response
          } else {
            return Promise.reject(
              createError(
                errorMsg,
                config,
                (data && data.code) || status,
                request,
                response
              )
            )
          }
        } else {
          if (allResponse) {
            return response
          } else {
            return Promise.reject(
              createError(
                errorMsg,
                config,
                (data && data.code) || status,
                request,
                response
              )
            )
          }
        }
      }
    }
  } else {
    return Promise.reject(
      createError(
        `Unexpected http status code: ${status}`,
        config,
        (data && data.code) || status,
        request,
        response
      )
    )
  }
}

/**
 * 兼容老系统的 HTTP 请求，它们需要返回 Response
 * @param {AxiosResponse} response
 */
export const needReturnResponseHandler = (response) => {
  const res = responseHandler(response, true)

  if (res !== undefined) {
    return res
  }

  return response
}

/**
 * @see {@link https://github.com/axios/axios/blob/2ee3b482456cd2a09ccbd3a4b0c20f3d0c5a5644/dist/axios.js#L1222}
 * @typedef AxiosError
 * @property {number|string} code
 * @property {string} message
 * @property {RequestConfig} config
 * @property {XMLHttpRequest} [request]
 * @property {AxiosResponse} [response]
 * @property {string} [code] The error code (for example, 'ECONNABORTED').
 *
 * @param {AxiosError} error
 */
export function responseErrorHandler(error) {
  const { config, request, response } = error // References#1
  const { debug, handleError } = config
  const { data, status, statusText /* headers */ } = response // 参见0

  if (debug) {
    console.dir(error)
  }

  if (config) {
    const errorMsg =
      getMessage(data, status, statusText) ||
      error.message ||
      'Uncaught Error (in ibuild/http)'

    if (!error.message) {
      error.message = errorMsg
    }

    if (!error.code && status) {
      error.code = status
    }

    if (handleError) {
      return Promise.reject(error)
    } else {
      errorMessage(errorMsg)

      return Promise.reject(
        createError(
          errorMsg,
          config,
          (data && data.code) || status,
          request,
          response
        )
      )
    }
  }
}

/**
 * 兼容老系统的 HTTP 请求，它们需要返回 error
 * @param {AxiosError} error
 */
export const needReturnResponseErrorHandler = (error) => {
  // 如果存在返回值
  const res = responseErrorHandler(error)

  if (res !== undefined) {
    return res
  } else {
    return Promise.reject(error)
  }
}
