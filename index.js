import MQTT from './mqtt.js'
export { MQTT }
export default options => {
  const subscriptions = new Map()

  const mqtt = MQTT({
    onMessage: async (topic, payload, packet) => {
      if (subscriptions.has(topic)) {
        for (const fn of subscriptions.get(topic)) {
          await fn(payload, packet)
        }
      }
    },
    onConnect: () => {
      for (const topic of subscriptions.keys()) {
        mqtt.subscribe(topic)
      }
    },
    ...options
  })

  const api = {
    mqtt,
    subscribe: async (topic, fn) => {
      if (!subscriptions.has(topic)) {
        subscriptions.set(topic, new Set())
        if (mqtt.connected) await mqtt.subscribe(topic)
      }
      subscriptions.get(topic).add(fn)
    },
    unsubscribe: async (topic, fn) => {
      if (!subscriptions.has(topic)) return
      const fns = subscriptions.get(topic)
      fns.delete(fn)
      if (fns.size > 0) return
      subscriptions.delete(topic)
      if (mqtt.connected) await mqtt.unsubscribe(topic)
    },
    publish: (topic, payload) => mqtt.publish(topic, payload)
  }

  return api
}
