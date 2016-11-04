const { Server, Socket } = require('net')
const Parser = require('redis-parser')
const debug = require('debug')('noderedis')

const server = new Server()

server.listen({host:'127.0.0.1', port: 6379, exclusive: true});

server.on('listening', () => {
  console.log('opened server on', server.address());
})

server.on('connection', (socket)=> {
  new RedisSocket(socket)
})

class Store {
  constructor() {
    this._store = {}
  }

  get(key){
    return this._store[key]
  }

  set(key, value) {
    this._store[key] = `${value}`
  }

  del(key) {
    if(this._store[key] !== undefined){
      delete this._store[key]
      return 1
    }
    return 0
  }
}


const store = new Store()

const Nil = '$-1\r\n'
const NilArray = '*-1\r\n'

const isArray = (obj) => Object.prototype.toString.call(obj) === "[object Array]"

const reduceItem = (item) => {
  switch (typeof item) {
    case 'string':
      return `${item.length}\r\n${item}`
    case 'number':
      return `:${item}`
    case 'object':
      if(isArray(item)) {
        return makeArray(item)
      }
      return NilArray
    default:
      return Nil
  }
}
const makeArray = (array) => {
  if(array.length) {
    return `*${array.length}\r\n${array.map(reduceItem).join('\r\n')}\r\n`
  } else {
    return `*0\r\n`
  }
}


class RedisSocket {
  constructor(socket) {
    this.socket = socket
    const parser = new Parser({
      returnReply: (reply) => {
        debug("receive:", reply)
        let commond = reply[0].toString()
        switch (commond.toUpperCase()) {
          case 'GET':
            let value = store.get(reply[1].toString())
            value === undefined ? this.sendNil() : this.sendString(value)
            break;
          case 'SET':
            let key = reply[1].toString()
            let v = reply[2].toString()
            store.set(key, v)
            this.sendStatus("OK")
            break;
          case 'DEL':
            let k = reply[1].toString()
            this.sendInteger(store.del(k))
            break
          default:
            this.sendError("Unkown command")
            break;
        }
      },
      returnError: (err)=> {
        this.sendError(err)
      },
      returnBuffers: true // All strings are returned as buffer e.g. <Buffer 48 65 6c 6c 6f> 
    });
    socket.on('data', (data)=>{
      parser.execute(data)
    })
  }
  write(data) {
    this.socket.write(data)
  }
  sendNil() {
    this.write(Nil)
  }
  sendString(data) {
    this.write(`$${data.length}\r\n${data}\r\n`)
  }
  sendInteger(i) {
    this.write(`:${i}\r\n`)
  }
  sendArray(array){
    this.write(makeArray(array))
  }
  sendStatus(state) {
    this.write(`+${state}\r\n`)
  }
  sendError(err, type) {
    this.write(`-${type || 'ERR'} ${err}\r\n`)
  }
}


