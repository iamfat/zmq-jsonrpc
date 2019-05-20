// const EventEmitter = require('events')
const winston = require('winston')
const zeromq = require('zeromq')
const uuid = require('uuid/v4')
const msgpack = require('msgpack')
const WebSocketServer = require('ws').Server
const http = require('http')

const
    RPCException = function (message, code) {
        this.code = code || 0
        this.message = message
        this.toString = () => this.message
    }
pass = Symbol('pass')
send = Symbol('send')

class RPC {
    constructor() {
        // super()
        this.promisedRequests = {}
        this._callings = {}
        this.callTimeout = 5000
        /**
         * 由于 0MQ 的 MQ 特性, 如果 server 端未连接, 则请求会在
         * client 端排队等待. 此时, 即使请求已被 client 端认定为超时,
         * 在 server 连接后, 实际还是会发送给 server.
         *
         * 之前增加了 server 对 request timeout 的判断, 但该判断非 jsonrpc
         * 的标准, 所以现在删除了该判断. 对于时间敏感的 API, API 应有时间
         * 相关的参数, 在 API 中自行做超时判断
         *
         * hwm: high-water mark 水位线, 避免 server 离线后, client 积压过
         * 多超时的消息
         */
        this.clientHWM = 10
        this.wsClients = new Map()
        this.isServer = false
        this.Exception = RPCException
        this.logger = winston.createLogger({
            transports: [
                new winston.transports.Console()
            ]
        })
    }

    [pass](data, clientId = '') {
        let request
        try {
            request = msgpack.unpack(data)
            this.logger.debug(`0MQ [${data}] <= ${request.id}` || 'N/A')
        }
        catch (e) {
            this[send]({
                jsonrpc: '2.0',
                error: {
                    code: -32700,
                    message: 'Parse error'
                }
            }, clientId)
            return
        }

        if (request.jsonrpc !== '2.0') {
            this[send]({
                jsonrpc: '2.0',
                error: {
                    code: -32600,
                    message: 'Invalid Request'
                }
            }, clientId)
            return
        }

        /**
         * 由于本 RPC 要实现双向通信, 即一个对象既要实现 client 又要实现
         * server, 所以要对收到的消息做 request 和 response 两类检查
         */
        if (Reflect.has(request, 'method') && typeof request.method == 'string') {
            /**
             * 10. request or notification
             *
             * A Notification is a Request object without an "id" member. A
             * Request object that is a Notification signifies the Client's
             * lack of interest in the corresponding Response object, and as
             * such no Response object needs to be returned to the client. The
             * Server MUST NOT reply to a Notification, including those that
             * are within a batch request.
             * @todo add more Invalid Request tests before
             */

            let _response = (e, result) => {
                if (e && request.id) {
                    this[send]({
                        jsonrpc: '2.0',
                        error: {
                            code: e.code || -32603,
                            message: e.message || "Internal Error"
                        },
                        id: request.id
                    }, clientId)
                }
                else if (result !== undefined && request.id) {
                    this[send]({
                        jsonrpc: '2.0',
                        result: result,
                        id: request.id
                    }, clientId)
                }
            }

            let cb = Reflect.get(this._callings, request.method)
            if (!cb && !this._callingDefault) {
                _response({code: -32601, message: 'Method not found'})
                return
            }

            let result
            try {
                if (cb) {
                    result = Reflect.apply(cb, this, [
                        request.params,
                        clientId ? this.isWsId(clientId) ? clientId : clientId.toString('base64') : null
                    ])
                }
                else {
                    /**
                     * 如果 method not found, 但有 callingDefault,
                     * 则使用 callingDefault
                     */
                    result = Reflect.apply(this._callingDefault, this, [
                        request.method,
                        request.params,
                        clientId ? this.isWsId(clientId) ? clientId : clientId.toString('base64') : null
                    ])
                }
            } catch (e) {
                if (e instanceof RPCException) {
                    _response(e)
                    return
                } else {
                    throw e
                }
            }

            if (typeof result == 'function') {
                // deferred callback
                result(_response)
            } else {
                _response(null, result)
                return
            }
        }
        else if (Reflect.has(request, 'result') || Reflect.has(request, 'error')) {
            /*
              *
              * 20. 判断是否为 response
              *
              * Either the result member or error member MUST be included, but
              * both members MUST NOT be included.
              *
              * **response 不需要回复**
              *
              */

            /** ignore invalid responses */
            if (Reflect.has(request, 'result') && Reflect.has(request, 'error')) {
                this.logger.debug('invalid response include both result', 'and error, ignored', request)
                return
            }
            if (!Reflect.has(this.promisedRequests, request.id)) {
                this.logger.debug('invalid response with a not-found id,', 'ignored', request)
                return
            }

            let rq = Reflect.get(this.promisedRequests, request.id)
            clearTimeout(rq.timeout)
            Reflect.deleteProperty(this.promisedRequests, request.id)

            if (Reflect.has(request, 'result')) {
                this.logger.debug(`0MQ remote: ${rq.method}(${JSON.stringify(rq.params)}) <= ${JSON.stringify(request.result)}`)
                rq.resolve(request.result)
            }
            else if (Reflect.has(request, 'error')) {
                this.logger.debug(`0MQ remote: ${rq.method}(${JSON.stringify(rq.params)}) <= ${JSON.stringify(request.error)}`)
                rq.reject(request.error)
            }
            else {
                /** @todo 不会到此 */
                rq.reject({
                    code: -32603,
                    message: "Internal Error"
                })
            }
        }
        else {
            /**
             * 30. 其他情况
             *
             * 如果有 id: 返回 invalid request
             * 否则 (无 id): ignore
             */
            if (request.id) {
                this[send]({
                    jsonrpc: '2.0',
                    error: {
                        code: -32600,
                        message: 'Invalid Request'
                    }
                }, clientId)
            }
        }
    }

    [send](data, clientId) {
        let response = msgpack.pack(data)
        if (clientId) {
            const isWsId = this.isWsId(clientId)
            this.logger.debug(`0MQ [${data.id}] => ${isWsId ? clientId : clientId.toString('base64')}: ${JSON.stringify(data)}`)
            if (isWsId) {
                const client = this.wsClients.get(clientId)
                client && client.send(response)
            } else {
                this.socket.send([clientId, response])
            }
        }
        else {
            this.logger.debug(`0MQ [${data.id}] => ${JSON.stringify(data)}`)
            this.socket.send(response)
        }
    }

    bind(path) {
        this.isServer = true
        this.socket = zeromq.socket('router')
        this.socket
            .bindSync(path)
            .on('message', (id, data) => {
                this[pass](data, id)
            })

        return this
    }


    isWsId(clientId) {
        return clientId.startsWith("websocket")
    }

    // Handle new WebSocket client
    onClientConnect(client) {
        client.clientId = "websocket-" + uuid()
        client.isAlive = true
        client.on('message', (data) => {
            client.isAlive = true
            this[pass](data, client.clientId)
        })
        client.on('close', (code, reason) => {
            this.wsClients.delete(client.clientId)
        })
        client.on('error', () => {
        })
        client.on('pong', () => {
            client.isAlive = true
        })
        this.wsClients.set(client.clientId, client)
    }

    bindWs(port) {
        this.isServer = true
        this.webServer = http.createServer((request, response) => {
            response.end()
        })
        this.webServer.listen(port, () => {
            this.wsServer = new WebSocketServer({
                server: this.webServer, verifyClient: (info,cb) => {
                    cb(true);
                }
            })
            this.wsServer.on('connection', this.onClientConnect.bind(this))
        })
        this.interval && clearInterval(this.interval)
        this.interval = setInterval(() => {
            for (const client of this.wsClients.values()) {
                if (client.isAlive === false) {
                    try {
                        client.close()
                        client.terminate()
                    } catch (e) {
                    }
                    continue
                } else {
                    client.isAlive = false
                    client.ping('heartbeat')
                }
            }
        }, 30000)
        return this
    }

    connect(path) {
        this.isServer = false
        this.socket = zeromq.socket('dealer')

        this.socket
            .setsockopt(zeromq.ZMQ_SNDHWM, this.clientHWM)
            .connect(path)
            .on('error', err => {
                this.logger.debug(`0MQ error: ${err}`)
                setTimeout(() => {
                    this.socket.connect(path)
                }, 3000)
            })
            .on('message', data => this[pass](data))

        return this
    }

    call(method, params = {}, clientId = '') {
        return new Promise((resolve, reject) => {
            let id = uuid()
            let data = {
                jsonrpc: '2.0',
                method,
                params,
                id
            }

            this.logger.debug(`0MQ [${id}] => [${clientId}] ${JSON.stringify(data)}`)

            let msg = [msgpack.pack(data)]
            if (this.isServer) {
                if (this.isWsId("websocket")) {
                    const client = this.wsClients.get(clientId)
                    client && client.send(msg[0])
                } else {
                    msg.unshift(Buffer.from(clientId, 'base64'))
                    this.socket.send(msg)
                }
            } else {
                this.socket.send(msg)
            }

            Reflect.set(this.promisedRequests, id, {
                method,
                params,
                resolve,
                reject,
                timeout: setTimeout(() => {
                    this.logger.debug(`0MQ [${id}] <= timeout`)
                    Reflect.deleteProperty(this.promisedRequests, id)
                    reject({
                        code: -32603,
                        message: 'Call Timeout'
                    })
                }, this.callTimeout)
            })
        })
    }

    calling(method, cb) {
        this._callings[method] = cb
        return this
    }

    callingDefault(cb) {
        this._callingDefault = cb
        return this
    }

    removeCalling(key) {
        if (Reflect.has(this._callings, key)) Reflect.deleteProperty(this._callings, key)
        return this
    }

    removeCallings(pattern) {
        for (let key of Object.keys(this._callings)) {
            if (key.match(pattern) != null) Reflect.deleteProperty(this._callings, key)
        }
        return this
    }
}

module.exports = RPC

