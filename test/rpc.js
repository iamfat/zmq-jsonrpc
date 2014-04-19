var zRPC = require('../');
var Promise = require('promise');
var assert = require("assert");

describe("JSON RPC on ZMQ:", function(){
    
    var path = 'ipc://zeromq-test';
    var server = zRPC.bind(path);
    var client = zRPC.connect(path);

    var promise;
    
    describe("Client RPC", function() {

        it("should be called", function() {

            promise = new Promise(function(resolve, reject) {
                server.calling("foo", function(params, client_id) {
                    assert.equal(params.foo, "bar");
                    resolve(client_id); // pass client id to next test
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

        it("should be called", function(){

            client.calling("foo", function(params, client_id){
                assert.equal(params.foo, "bar");
                return params.foo;
            });

            promise.then(function(client_id) {
                server
                .call("foo", {foo:"bar"}, client_id)
                .done(function(ret){
                    assert.equal(ret, "bar");
                });
            });

        })
    
    });
    
});