var zRPC = require('./');

var path = 'ipc:///tmp/zeromq-test';
var server = new zRPC().bind(path);
var client = new zRPC().connect(path);

server.calling("foo", function(params, client_id) {
  console.log('params', params)
  return params.foo;
});

client
.call("foo", {foo:"bar"})
.then(ret => {
  console.log('ret', ret)
}, err => {
  console.log('error', err)
});
