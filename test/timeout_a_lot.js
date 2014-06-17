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
                 * 此测试中, server 不应被 call. 且 server 最终收到的
                 * 请求应该只有 (与 clientHWM 相同的) 10个
                 */
                done(new Error('server be called after this call already timeout'));
                console.log('server be called after this call already timeout');
                return params.foo;
            });

            /** 设置 client call timeout 时长 */
            client.callTimeout = 1000;

            /** client call */
            var n = 100,
                i = 1;

            while (i <= n) {
                client
                    .call("foo", {foo:i})
                    .done(function(ret){
                        /* 不应到此 */
                        done(new Error('client call should not be done without server'));
                    }, function(err) {
                        /** 应该到此 */
                        assert.equal(err.code, -32603);
                        assert.equal(err.message, 'Call Timeout');
                    });

                i += 1;
            }

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
