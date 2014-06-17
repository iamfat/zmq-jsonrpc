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

        it("should not be called after client call timeout", function(done) {

            /** 设置测试时长较长 */
            this.timeout(10000);

            /** 设置 server 的 API */
            server.calling("foo", function(params, client_id) {

                /** 此测试中, server 不应被 call */
                done(new Error('server be called after this call already timeout'));

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

        /**
         * 如果 server 设置了较短的 timeout, 则即使 client 设置的
         * call timeout 较长, 也按 server 的设置判断超时
         */
        it("should not be called after server call timeout", function(done) {

            /** 设置测试时长较长 */
            this.timeout(10000);

            /** 设置 server 的 API */
            server.serverTimeout = 1000;
            server.calling("foo", function(params, client_id) {

                /** 此测试中, server 不应被 call */
                done(new Error('server be called after this call already timeout'));

                return params.foo;
            });

            /** 设置 server 很晚 (在 client call timeout 后) 才 bind */
            setTimeout(function() {
                server.bind(path);
            }, 1500);

            /** 设置 client callTimeout */
            client.callTimeout = 2000;

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
