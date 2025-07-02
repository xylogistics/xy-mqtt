import MQTT from './mqtt.js'
import short from 'short-uuid'
import { CommandAlreadyRegistered, CallWithNoSubscription } from './exceptions.js'
export { MQTT }
export default options => {
  const subscriptions = new Map()
  const commands = new Map()
  const cancel_commands = new Map()

  const mqtt = MQTT({
    onMessage: async (topic, payload, packet) => {
      if (subscriptions.has(topic)) {
        for (const fn of subscriptions.get(topic)) await fn(payload, packet)
      }
      if (topic.endsWith('/invoke')) {
        const command = topic.slice(0, -7)
        if (!commands.has(command)) return
        const messageId = payload.messageId
        let complete = false
        try {
          const result = await commands.get(command)(payload, onCancel => {
            if (complete) return
            cancel_commands.set(messageId, async () => {
              await onCancel()
              complete = true
            })
          })
          if (complete) return
          mqtt.publish(`${command}/resolve`, { messageId, ...result })
        } catch (e) {
          if (complete) return
          if (e.ok !== false) console.error(e)
          const p = e.ok === false ? e : { ok: false, status: 500, message: `${e.name}: ${e.message}` }
          mqtt.publish(`${command}/reject`, { messageId, ...p })
        }
        complete = true
        cancel_commands.delete(messageId)
      } else if (topic.endsWith('/cancel')) {
        const command = topic.slice(0, -7)
        if (!commands.has(command)) return
        const messageId = payload.messageId
        if (!cancel_commands.has(messageId)) return
        await cancel_commands.get(messageId)()
        cancel_commands.delete(messageId)
      }
    },
    onConnect: () => {
      for (const topic of subscriptions.keys()) mqtt.subscribe(topic)
      for (const topic of commands.keys()) subscribe_command(topic)
    },
    ...options
  })

  const subscribe_command = async topic => {
    await mqtt.subscribe(`${topic}/invoke`)
    await mqtt.subscribe(`${topic}/cancel`)
  }

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
    publish: (topic, payload) => mqtt.publish(topic, payload),
    command_register: async (topic, fn) => {
      if (commands.has(topic)) throw new CommandAlreadyRegistered(topic)
      commands.set(topic, fn)
      if (mqtt.connected) await subscribe_command(topic)
    },
    command_unregister: async (topic, fn) => {
      if (!commands.has(topic)) return
      commands.delete(topic)
      if (mqtt.connected) await mqtt.unsubscribe(`${topic}/invoke`)
    },
    call: async (topic, payload) => {
      if (!subscriptions.has(`${topic}/resolve`)) throw new CallWithNoSubscription(topic)
      if (!subscriptions.has(`${topic}/reject`)) throw new CallWithNoSubscription(topic)
      const messageId = short.generate()
      await mqtt.publish(`${topic}/invoke`, { messageId, ...payload })
      return {
        messageId,
        cancel: async () => {
          await mqtt.publish(`${topic}/cancel`, { messageId })
        }
      }
    },
    close: mqtt.close
  }

  return api
}
