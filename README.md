zmq-jsonrpc
===========

Bi-directional JSON-RPC 2.0 for ZeroMQ

## Client-side RPC
This is the ordinary way for people to make remote call. A server could be connected by multiple clients, `clientId` will be passed when a call was received to provide a way for server to identify where those calls are from.
```javascript
var zRPC = require('zmq-jsonrpc');

var path = "ipc://foobar"; // or tcp://host:port

var server = zRPC.bind(path);
server.calling('foo', function(params, clientId){
    return "bar";
});

var client = zRPC.connect(path);
client.call('foo', {foo1:"bar1", foo2:"bar2"})
.done(function(ret){
    //onSuccess
}, function(err){
    //onFail  err = {code:xxx, message:xxx}
});

```

## Server-side RPC
zmq-jsonrpc support RPC call from server side to client side, but you have to know `clientId` from previous client-side calls.
```javascript
client.calling('foo', function(params) {
    return "bar";
});

server.call('foo', {foo1:"bar1", foo2:"bar2"}, clientId)
.done(function(ret){
    //onSuccess
}, function(err){
    //onFail  err = {code:xxx, message:xxx}
});
```
