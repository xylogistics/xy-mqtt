import MQTT from 'mqtt'
import { Hub } from './hub.js'
import { backOff } from 'exponential-backoff'

// publish, subscribe and unsubscribe return promises
export default ({
  brokerUrl,
  clientId,
  username,
  password,
  onConnect,
  onReconnect,
  onInit,
  onPacketReceive,
  onPacketSend,
  onMessage,
  onMessageRetry,
  incomingDB,
  outgoingDB
}) => {
  const hub = Hub()

  // Need to implement readable event + null if async loading data
  const objectStream = data => {
    const hub = Hub()
    return {
      read: () => {
        if (data.length == 0) {
          hub.emit('end')
          return null
        }
        return data.shift()
      },
      on: hub.on,
      off: hub.off,
      // Doesn't look like we need these.
      // But if there is a problem perhaps we need the once('readable') listerner implemented
      destroy: () => {},
      once: () => {}
    }
  }

  const incomingStore = {
    put: (packet, cb) => {
      try {
        // Comes in as a buffer, but we want to store it as a string
        packet.payload = packet.payload.toString()
        incomingDB.put(packet)
        cb()
      } catch (e) {
        console.error(e)
        cb(e)
      }
      return incomingStore
    },
    get: (packet, cb) => {
      try {
        const result = incomingDB.get(packet)
        if (!result) {
          console.error('incomingStore packet not found. Is this a bug?', packet)
          return cb(packet)
        }
        cb(null, JSON.parse(result.packet))
      } catch (e) {
        console.error(e)
        cb(e)
      }
      return incomingStore
    },
    del: (packet, cb) => {
      try {
        incomingDB.del(packet)
        cb()
      } catch (e) {
        console.error(e)
        cb(e)
      }
      return incomingStore
    },
    createStream: () => objectStream(incomingDB.all()),
    close: cb => cb()
  }
  const outgoingStore = {
    put: (packet, cb) => {
      try {
        outgoingDB.put(packet)
        cb()
      } catch (e) {
        console.error(e)
        cb(e)
      }
      return outgoingStore
    },
    get: (packet, cb) => {
      try {
        const result = outgoingDB.get(packet)
        if (!result) {
          console.error('incomingStore packet not found. Is this a bug?', packet)
          return cb(packet)
        }
        cb(null, JSON.parse(result.packet))
      } catch (e) {
        console.error(e)
        cb(e)
      }
      return outgoingStore
    },
    del: (packet, cb) => {
      try {
        outgoingDB.del(packet)
        cb()
      } catch (e) {
        console.error(e)
        cb(e)
      }
      return outgoingStore
    },
    createStream: () => objectStream(outgoingDB.all()),
    close: cb => cb()
  }

  const tryForever = (fn, retry) =>
    backOff(fn, {
      maxDelay: 12800,
      numOfAttempts: Number.MAX_SAFE_INTEGER,
      retry: () => {
        retry()
        return true
      }
    })

  const mqtt = MQTT.connect(brokerUrl, {
    clientId,
    username,
    password,
    clean: false,
    reconnectOnConnackError: true,
    queueQoSZero: true,
    resubscribe: true,
    incomingStore: incomingStore,
    outgoingStore: outgoingStore
  })

  mqtt.handleMessage = async (packet, cb) => {
    const topic = packet.topic
    const payload = JSON.parse(packet.payload)
    await tryForever(
      async () => {
        if (onMessage) await onMessage(ctx, topic, payload, packet)
        await hub.emit(topic, payload)
      },
      () => {
        if (onMessageRetry) onMessageRetry(ctx, topic, payload, packet)
        hub.emit('retry', topic, payload, packet)
      }
    )
    cb()
  }

  const api = {
    on: (topic, fn) => hub.on(topic, fn),
    off: (topic, fn) => hub.off(topic, fn),
    publish: (topic, payload) => mqtt.publishAsync(topic, JSON.stringify(payload), { qos: 2 }),
    subscribe: topics => mqtt.subscribeAsync(topics, { qos: 2 }),
    unsubscribe: topics => mqtt.unsubscribeAsync(topics)
  }

  // If we already have a session with the broker, we don't need to re-subscribe unless we have new subscriptions
  mqtt.on('connect', async ({ sessionPresent }) => {
    if (onConnect) await onConnect(ctx)
    await hub.emit('connect')
    if (sessionPresent) return
    if (onInit) await onInit(ctx)
    await hub.emit('init')
  })

  if (onPacketReceive) mqtt.on('packetreceive', onPacketReceive)
  if (onPacketSend) mqtt.on('packetsend', onPacketSend)
  if (onReconnect) mqtt.on('reconnect', onReconnect)

  return api
}
