const zRPC = require('../')
const assert = require('assert')

describe('JSON RPC on ZMQ:', () => {
  const path = 'ipc:///tmp/zeromq-1st'
  const server = new zRPC().bind(path)
  const client = new zRPC().connect(path)
  let promise
    
  describe('Client RPC', () => {
    it('should be called', done => {
      promise = new Promise((resolve, reject) => {
        server
        .calling('foo', (params, clientId) => {
          resolve(clientId) // pass client id to next test
          assert.equal(params.foo, 'bar')
          done()
          return params.foo
        })
      })

      client
      .call('foo', { foo: 'bar' })
      .then(ret => {
        assert.equal(ret, 'bar')
      }, err => {
        console.log('error', err)
      })
    })
  })

  describe('Server RPC', () => {
    it('should be called', done => {
      client.calling('foo', (params, clientId) => {
        assert.equal(params.foo, 'bar')
        return params.foo
      })

      promise.then(clientId => {
        server
        .call('foo', { foo: 'bar' }, clientId)
        .then(ret => {
          assert.equal(ret, 'bar')
          done()
        }, err => {
          console.log('error', err)
        })
      })
    })
  })
})


describe('JSON RPC on ZMQ later binding:', () => {
  const path = 'ipc:///tmp/zeromq-2ec'
  const server = new zRPC()
  const client = new zRPC()
  let promise
  
  describe('Client RPC', () => {
    it('should be called', done => {
      promise = new Promise((resolve, reject) => {
        server.calling('foo', (params, clientId) => {
          resolve(clientId) // pass client id to next test
          assert.equal(params.foo, 'bar')
          done()
          return params.foo
        })
      })

      client
      .call('foo', { foo: 'bar' })
      .then(ret => {
        assert.equal(ret, 'bar')
      }, err => {
        console.log('error', err)
      })
    })
  })

  describe('Server RPC', () => {
    it('should be called', done => {
      client.calling('foo', (params, clientId) => {
        assert.equal(params.foo, 'bar')
        return params.foo
      })

      promise.then(clientId => {
        server
        .call('foo', {foo:'bar'}, clientId)
        .then(ret => {
          assert.equal(ret, 'bar')
          done()
        }, err => {
          console.log('error', err)
        })
      })
    })
  })
  
  server.bind(path)
  client.connect(path)
})