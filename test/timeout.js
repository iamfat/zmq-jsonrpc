var zRPC = require('../');
var assert = require("assert");

describe("JSON RPC on ZMQ later binding:", function(){

    var file = 'zeromq-test-' + Math.random().toString(36).substring(7),
        path = 'ipc://' + file;

    process.on('exit', function() {
        console.log('deleting '+ file);
        require('fs').unlinkSync(file);
    });

    var server = new zRPC();
    server.logger = {
        debug: function(m) {
            console.log('server', m);
        }
    };

    var client = new zRPC();
    client.logger = {
        debug: function(m) {
            console.log('client', m);
        }
    };
    client.connect(path);

    describe("Server API", function() {

        it("should not be called after client call timeout", function(done) {

            /** 设置测试时长较长 */
            this.timeout(10000);

            /** 设置 server 的 API */
            server.calling("foo", function(params, client_id) {

                /**

                 client 0MQ [hwh8999h0] => {"jsonrpc":"2.0","method":"foo","params":{"foo":"bar"},"id":"hwh8999h0"}
                 client 0MQ [hwh8999h0] <= timeout

                 // 如果 server 正常处理了已超时的请求, 则会返回结果

                 server 0MQ [hwh8999h0] <= {"jsonrpc":"2.0","method":"foo","params":{"foo":"bar"},"id":"hwh8999h0"}
                 server 0MQ [hwh8999h0] => AG7f4R3vik92rFDeEEWq2HE=: {"jsonrpc":"2.0","result":"bar","id":"hwh8999h0"}

                 // 但返回的结果会被 client 解析为 Invalid Request 错误, 并将此错误汇报回 server

                 client 0MQ [hwh8999h0] <= {"jsonrpc":"2.0","result":"bar","id":"hwh8999h0"}
                 client 0MQ [undefined] => {"jsonrpc":"2.0","error":{"code":-32600,"message":"Invalid Request"}}

                 // 而 server 收到该错误后, 也会解析为 Invalid Request, 并再次踢回给 client

                 server 0MQ [N/A] <= {"jsonrpc":"2.0","error":{"code":-32600,"message":"Invalid Request"}}
                 server 0MQ [undefined] => AG7f4R3vik92rFDeEEWq2HE=: {"jsonrpc":"2.0","error":{"code":-32600,"message":"Invalid Request"}}
                 client 0MQ [N/A] <= {"jsonrpc":"2.0","error":{"code":-32600,"message":"Invalid Request"}}

                 // 会如此反反复复无穷尽也

                 */

                /** 此测试中, server 不应被 call */
                done(new Error('server be called after this call already timeout'));

                return params.foo;
            });

            /** 设置 client call timeout 时长 */
            client.callTimeout = 1000;

            /** client call */
            client
            .call("foo", {foo:"bar"})
            .done(function(ret){
                /* 不应到此 */
                done(new Error('client call should not be done without server'));
            }, function(err) {
                /** 应该到此 */
                assert.equal(err.code, -32603);
                assert.equal(err.message, 'Call Timeout');
            });

            /** 在 client call timeout 后, server 才 bind */
            setTimeout(function() {
                server.bind(path);
            }, 2000);

            /** server bind 后, 测试才结束 */
            setTimeout(function() {
                done();
            }, 5000);

        });

    });

});
