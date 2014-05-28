var EventEmitter = require('events').EventEmitter;
var Winston = require("winston");
var Util = require("util");
var ZeroMQ = require("zmq");
var msgpack = require('msgpack');
var Promise = require('promise');

function RPCException(message, code) {
    this.code = code || 0;
    this.message = message;
    this.toString = function () {
        return this.message;
    };
}

function _send_response(data, client_id) {
    var self = this;
    var response = msgpack.pack(data);
    if (client_id) {
        self.logger.debug(Util.format(
            "0MQ [%s] => %s: %s", 
            data.id, client_id.toString('base64'), JSON.stringify(data)
        ));
        self.socket.send([client_id, response]);                   
    }
    else {
        self.logger.debug(Util.format(
            "0MQ [%s] => %s", 
            data.id, JSON.stringify(data)
        ));
        self.socket.send(response);                   
    }   
}

function _process(data, client_id) {
    var request;
    var self = this;

    try {
        request = msgpack.unpack(data);
        self.logger.debug(Util.format(
            "0MQ [%s] <= %s", request.id || "N/A", JSON.stringify(request)
        ));
    }
    catch (e) {
        _send_response.apply(self, [{
            jsonrpc:'2.0',
            error: {
                code: -32700,
                message: 'Parse error'
            }
        }, client_id]);
        return;
    }

    if (request.jsonrpc !== '2.0') {
        _send_response.apply(self, [{
            jsonrpc:'2.0',
            error: {
                code: -32600,
                message: 'Invalid Request'
            }
        }, client_id]);
        return;
    }

    if (request.hasOwnProperty('method')) {
        /** request */
        
        function _response(e, result) {
            
            if (e) {
                if (request.id) {
                    _send_response.apply(self, [{
                        jsonrpc: "2.0",
                        error: {
                            code: e.code || -32603,
                            message: e.message || "Internal Error"
                        },
                        id: request.id
                    }, client_id]);    
                }
            }
            else {
                if (result !== undefined && request.id) {                
                    _send_response.apply(self, [{
                        jsonrpc: "2.0",
                        result: result,
                        id: request.id
                    }, client_id]);                   
                }

            }
            
        }

        var params = request.params;

        var cb = self._callings[request.method];
        if (!cb) {
            if (self._callings['*']) {
                /**
                 * 如果 method not found, 但有 * handler,
                 * 则使用 * handler
                 */
                cb = self._callings['*'];
                params = {
                    method: request.method,
                    params: request.params
                };
            }
            else {
                _response({code: -32601, message: 'Method not found'});
            }
        }

        try {
            var result = cb.apply(self, [params, client_id ? client_id.toString('base64') : null]);
        } catch (e) {

            if (e instanceof RPCException) {
                _response(e);
            } else {
                throw e;
            }        
        }
        
        if (typeof(result) == 'function') {
            // deferred callback
            result(_response);
        } else {
            _response(null, result);
        }
        
    } else if (request.id && self.promisedRequests.hasOwnProperty(request.id)) {
        /** response */

        var rq = self.promisedRequests[request.id];
        clearTimeout(rq.timeout);
        delete self.promisedRequests[request.id];

        if (request.hasOwnProperty('result')) {
            self.logger.debug(Util.format(
                "0MQ remote: %s(%s) <= %s", 
                rq.method, JSON.stringify(rq.params), 
                JSON.stringify(request.result)
            ));
            rq.resolve(request.result);
        }
        else if (request.hasOwnProperty('error')) {
            self.logger.debug(Util.format(
                "0MQ remote: %s(%s) <= %s", 
                rq.method, JSON.stringify(rq.params), 
                JSON.stringify(request.error)
            ));             
            rq.reject(request.error);
        }
        else {
            rq.reject({
                code: -32603,
                message: "Internal Error"
            });
        }
    }
    else {
        _send_response.apply(self, [{
            jsonrpc:'2.0',
            error: {
                code: -32600,
                message: 'Invalid Request'
            }
        }, client_id]);
    }
}

var RPC = function (path) {
    this.promisedRequests = {};
    this._callings = {};
    this.callTimeout = 5000;
    this.isServer = false;
    this.Exception = RPCException;
    this.logger = new Winston.Logger();
}

RPC.prototype.bind = function (path) {
    
    var self = this;
    self.isServer = true;

    var socket = ZeroMQ.socket("router");
    self.socket = socket;

    socket
    .bind(path, function (err) {
        if (err) throw err;
        
        socket
        .on("message", function (id, data) {
            _process.apply(self, [data, id]);
        });
        
    });

    return self;
};

RPC.prototype.connect = function (path) {

    var self = this;
    self.isServer = false;
    
    var socket = ZeroMQ.socket("dealer");

    self.socket = socket;
    socket.connect(path);

    socket
    .on("error", function (err){
        self.logger.debug(Util.format("0MQ error: %s", err));
        // reconnect in 3s
        setTimeout(function (){
            socket.connect(path);
        }, 3000);
    })
    .on("message", function (data) { 
        _process.apply(self, [data]);
    });
    
    return self;
};

// inherit EventEmitter
RPC.prototype.__proto__ = EventEmitter.prototype;

var _uniqsec = 0;
var _uniqid = 0;
var Moment = require('moment');

RPC.prototype.getUniqueId = function () {
    // var uuid = require("uuid");
    // var buffer = new Buffer(16);
    // uuid.v4(null, buffer);
    // return buffer.toString("hex");
    var sec = Moment().valueOf();
    if (sec !== _uniqsec) {
        _uniqsec = sec;
        _uniqid  = 0;
    }
    else {
        _uniqid ++;
    }
    return _uniqsec.toString(36) + _uniqid.toString();
}

RPC.prototype.calling = function (method, cb) {
    var self = this;
    self._callings[method] = cb;
    return self;
}

RPC.prototype.removeCalling = function (key) {
    var self = this;
    if (self._callings.hasOwnProperty(key)) delete self._callings[key];
    return self;
}

RPC.prototype.removeCallings = function (pattern) {
    var self = this;
    var wildcard = require('wildcard');

    wildcard(pattern, Object.keys(self._callings)).forEach(function (key){
        delete self._callings[key];
    });

    return self;
}

RPC.prototype.call = function (method, params, client_id) {

    var self = this;
    
    return new Promise(function(resolve, reject) {
        
        var id = self.getUniqueId();
    
        params = params || {};
    
        var data = {
            jsonrpc:'2.0',
            method: method,
            params: params,
            id: id
        };
    
        if (client_id) {
            self.logger.debug(Util.format("0MQ [%s] => [%s] %s", id, client_id, JSON.stringify(data)));
        }
        else {
            self.logger.debug(Util.format("0MQ [%s] => %s", id, JSON.stringify(data)));
        }
    
        var msg = msgpack.pack(data)
        if (self.isServer) {
            self.socket.send([new Buffer(client_id, 'base64'), msg]);
        }
        else {
            self.socket.send(msg);
        }
    
        self.promisedRequests[id] = {
            method: method,
            params: params,
            resolve: resolve,
            reject: reject
        };

        self.promisedRequests[id].timeout = setTimeout(function (){
            self.logger.debug(Util.format("0MQ [%s] <= timeout", id));
            delete self.promisedRequests[id];
            reject({
                code: -32603,
                message: "Call Timeout"
            });
        }, self.callTimeout);
        
    })
    
};

var RPCWrapper = function() {
    return new RPC();
};

RPCWrapper.connect = function (path) {
    var rpc = new RPC();
    return rpc.connect(path);
};

RPCWrapper.bind = function (path) {
    var rpc = new RPC();
    return rpc.bind(path);
};

module.exports = RPCWrapper;
