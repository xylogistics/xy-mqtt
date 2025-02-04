# XT MQTT
Guaranteed delivery of calls and events over MQTT.

## Features
Defaults to QoS 2, non clean session, SQLite persistence. Implements a command pattern for calling functions and receiving their results.

## TODO
1. Document unsubscribe and command_unregister.
2. A diagram of how this works under the hood - QoS2, non clean session, SQLite persistence, MQTT broker's responsibilities.

## Run a MQTT broker

compose.yml:
```yml
services:
  mqtt:
    image: eclipse-mosquitto:2-openssl
    volumes:
      - ./docker/mosquitto_config:/mosquitto/config
      - mqtt-data:/mosquitto/data
      - mqtt-logs:/mosquitto/log
    ports:
      - '1883:1883'
volumes:
  mqtt-data:
  mqtt-logs:
```

```bash
docker compose up
```

## Setup xy-mqtt with SQLite
SQLite database for queues using [better-sqlite3](https://github.com/WiseLibs/better-sqlite3).

```javascript
import Database from 'better-sqlite3'
import MQTT from 'xy-mqtt'

const extend_sl = sl => {
  const cache = new Map()
  const get = sql => {
    if (!cache.has(sql)) cache.set(sql, sl.prepare(sql))
    return cache.get(sql)
  }
  sl.run = (sql, ...args) => get(sql).run(...args)
  sl.get = (sql, ...args) => get(sql).get(...args)
  sl.all = (sql, ...args) => get(sql).all(...args)
  sl.iterate = (sql, ...args) => get(sql).iterate(...args)
  sl.pluck = (sql, ...args) => get(sql).pluck(...args)
  sl.expand = (sql, ...args) => get(sql).expand(...args)
  sl.raw = (sql, ...args) => get(sql).raw(...args)
  sl.columns = (sql, ...args) => get(sql).columns(...args)
  sl.bind = (sql, ...args) => get(sql).bind(...args)
  return sl
}

const sl = extend_sl(new Database('./path/to/database'))
sl.pragma('journal_mode = WAL')
sl.pragma('synchronous = EXTRA')

sl.exec(`
  create table if not exists mqtt_incoming_packet (
    id text,
    at timestamp default current_timestamp,
    packet text
  );
  create table if not exists mqtt_outgoing_packet (
    id text,
    at timestamp default current_timestamp,
    packet text
  );
`)

const mqtt = MQTT({
  clientId: 'unique_application_name',
  username: 'mqtt',
  password: 'mqtt',
  incomingDB: {
    put: packet =>
      sl.run(`insert into mqtt_incoming_packet (id, packet) values (@id, @packet)`, {
        id: packet.messageId,
        packet: JSON.stringify(packet)
      }),
    get: packet => sl.get(`select packet from mqtt_incoming_packet where id = @id`, { id: packet.messageId }),
    del: packet =>
      sl.run(`delete from mqtt_incoming_packet where id = @id`, {
        id: packet.messageId
      }),
    all: () => sl.all(`select packet from mqtt_incoming_packet order by at asc`).map(row => JSON.parse(row.packet))
  },
  outgoingDB: {
    put: packet =>
      sl.run(`insert into mqtt_outgoing_packet (id, packet) values (@id, @packet)`, {
        id: packet.messageId,
        packet: JSON.stringify(packet)
      }),
    get: packet => sl.get(`select packet from mqtt_outgoing_packet where id = @id`, { id: packet.messageId }),
    del: packet =>
      sl.run(`delete from mqtt_outgoing_packet where id = @id`, {
        id: packet.messageId
      }),
    all: () => sl.all(`select packet from mqtt_outgoing_packet order by at asc`).map(row => JSON.parse(row.packet))
  }
})
```

## Publish events
Publish a tick event every 2 seconds.

```javascript
const timestamp = new Date().toISOString()
let count = 1
setInterval(async () => {
  const payload = { timestamp, count: count++ }
  const wait = mqtt.publish('evt/publisher/tick', payload)
  console.log(payload)
  await wait
  console.log(payload, '√')
}, 2000)
```

## Subscribe to events
If an exception is thrown the event is retried. Guaranteed delivery. Once this code has run the broker will queue events while the subscriber is offline.

```javascript
mqtt.subscribe('evt/publisher/tick', async payload => {
  const should_fail = Math.random() >= 0.5
  if (should_fail) {
    console.log(payload, 'X')
    throw new Error('Error')
  }
  console.log(payload, '√')
})
```

## Register commands
Commands can resolve or reject. Reject a command by throwing an exception. Commands can optionally be cancelled.

```javascript
mqtt.command_register('cmd/publisher/ping', async (payload, onCancel) => {
  onCancel(() => console.log('cmd/publisher/ping', 'cancelled'))
  console.log('cmd/publisher/ping', payload)
  const should_fail = Math.random() >= 0.5
  if (should_fail) {
    console.log('cmd/publisher/ping', 'X')
    throw { ok: false, message: 'random failure' }
  }
  console.log('cmd/publisher/ping', '√')
  return { pong: true }
})
```

## Call commands
Because commands can resolve or reject while the callee is offline we subscribe to the result, rather than use a promise like [xy-websocket](https://github.com/xylogistics/xy-websocket). The string `payload.messageId` is a unique identifier for the call and can be independently persisted.

```javascript
mqtt.subscribe('cmd/publisher/ping/resolve', async payload => {
  console.log('cmd/publisher/ping', payload)
})
mqtt.subscribe('cmd/publisher/ping/reject', async payload => {
  console.log('cmd/publisher/ping X')
})
setInterval(async () => {
  const { messageId, cancel } = await mqtt.call('cmd/publisher/ping', {})
  console.log('cmd/publisher/ping', messageId)
}, 2000)
```
