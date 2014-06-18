var zRPC = require('../'),
    assert = require("assert"),
    moment = require('moment'),
    fs = require('fs');

describe("JSON RPC on ZMQ later binding:", function(){

    var file,
        path,
        server,
        client,
        begin,
        client_hwm = 5;

    describe("Server API", function() {

        beforeEach(function() {
            begin = moment().valueOf();
            file = 'zeromq-test-' + Math.random().toString(36).substring(7);
            path = 'ipc://' + file;

            server = new zRPC();
            server.logger = {
                debug: function(m) {
                    console.log(moment().valueOf() - begin, 'server', m);
                }
            };

            client = new zRPC();
            client.clientHWM = client_hwm;
            client.logger = {
                debug: function(m) {
                    console.log(moment().valueOf() - begin, 'client', m);
                }
            };
            client.connect(path);
        });

        afterEach(function() {
            server = null;
            client = null;
            fs.unlinkSync(file);
        });

        it("client should handle `timeout request's response` right", function(done) {

            var n_server_request_received = 0;

            /** 设置测试时长较长 */
            this.timeout(10000);

            /** 设置 server 的 API */
            server.calling("foo", function(params, client_id) {
                /**
                 * server 被 call 的数目应该与 clientHWM 相同
                 */
                n_server_request_received++;
                return params.foo;
            });

            /** 设置 client call timeout 时长 */
            client.callTimeout = 1000;

            /** client call, 这些 call 都会超时 */
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

                /**
                 * bind 后的 call 应该正常处理
                 */
                client
                    .call("foo", {foo:'final'})
                    .done(function(ret){
                        done();
                    }, function(err) {
                        done(err);
                    });

            }, 2000);


        });

    });

});
