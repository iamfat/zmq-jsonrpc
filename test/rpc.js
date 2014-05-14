var zRPC = require('../');
var Promise = require('promise');
var assert = require("assert");

describe("JSON RPC on ZMQ:", function(){
    
    var path = 'ipc://zeromq-test';
    var server = zRPC.bind(path);
    var client = zRPC.connect(path);

    var promise;
    
    describe("Client RPC", function() {

        it("should be called", function(done) {

            promise = new Promise(function(resolve, reject) {
                server.calling("foo", function(params, client_id) {
                    resolve(client_id); // pass client id to next test
                    assert.equal(params.foo, "bar");
                    done();
                    return params.foo;
                });
           });


           client
           .call("foo", {foo:"bar"})
           .done(function(ret){
               assert.equal(ret, "bar");
           });

        })

    });

    describe("Server RPC", function(){

        it("should be called", function(done){

            client.calling("foo", function(params, client_id){
                assert.equal(params.foo, "bar");
                return params.foo;
            });

            promise.then(function(client_id) {
                server
                .call("foo", {foo:"bar"}, client_id)
                .done(function(ret){
                    assert.equal(ret, "bar");
                    done();
                });
            });

        })
    
    });
    
});


describe("JSON RPC on ZMQ later binding:", function(){
    
    var path = 'ipc://zeromq-test2';
    var server = new zRPC();
    var client = new zRPC();

    var promise;
    
    describe("Client RPC", function() {

        it("should be called", function(done) {

            promise = new Promise(function(resolve, reject) {
                server.calling("foo", function(params, client_id) {
                    resolve(client_id); // pass client id to next test
                    assert.equal(params.foo, "bar");
                    done();
                    return params.foo;
                });
           });


           client
           .call("foo", {foo:"bar"})
           .done(function(ret){
               assert.equal(ret, "bar");
           });

        })

    });

    describe("Server RPC", function(){

        it("should be called", function(done){

            client.calling("foo", function(params, client_id){
                assert.equal(params.foo, "bar");
                return params.foo;
            });

            promise.then(function(client_id) {
                server
                .call("foo", {foo:"bar"}, client_id)
                .done(function(ret){
                    assert.equal(ret, "bar");
                    done();
                });
            });

        })
    
    });
    
    server.bind(path);
    client.connect(path);
    
});