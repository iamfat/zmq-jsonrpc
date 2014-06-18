var zRPC = require('../'),
    assert = require("assert"),
    fs = require('fs'),
    moment = require('moment');

describe("JSON RPC on ZMQ later binding:", function(){

    var file,
        path,
        server,
        client,
        begin;

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

            /** 设置测试时长较长 */
            this.timeout(10000);

            /** 设置 server 的 API */
            server.calling("foo", function(params, client_id) {

                return params.foo;
            });

            /** 设置 server 很晚 (在 client call timeout 后) 才 bind */
            setTimeout(function() {
                server.bind(path);
            }, 2000);

            /** 设置 client callTimeout */
            client.callTimeout = 1000;

            /** client call */
            client
            .call("foo", {foo:"bar"})
            .done(function(ret){
                /* 不应到此 */
                done(new Error('client call should not be done'));
            }, function(err) {
                /** 1s 后应该到此 */
                assert.equal(err.code, -32603);
                assert.equal(err.message, 'Call Timeout');
            });

            /** server bind 后, 测试才结束 */
            setTimeout(function() {
                done();
            }, 3000);

        });

    });

});
