# XT MQTT
Guaranteed delivery of calls and events over MQTT.

## Features
Defaults to QoS 2, non clean session, SQLite persistence.

```javascript
// API to subscribe to topics
const subscribe = async (topic, fn) => {}
const unsubscribe = async (topic, fn) => {}

// Subscribe usage
const topic_subject = async payload => {
  // Throw exception, mqtt will retry
  // Do something async with payload, mqtt message receiving will wait for this
  // Or dispatch an async function to accept the message
}
subscribe('topic/subject', topic_subject)
unsubscribe('topic/subject', topic_subject)

// API to publish events
const publish = async (topic, payload) => {}

// Publish usage
await publish('topic/subject', { payload: 'data' })

// API to register commands
const command_register = (topic, fn) => {}
const command_unregister = (topic, fn) => {}

// Register command usage
const cmd_topic_subject = async (payload, onCancel) => {
  onCancel(() => {
    // Do something here
  })
  // Do something async here with payload
  // throw exception to reject
  // return to resolve
  return {
    status: 200, // prefer http statuses
    result: 'success'
  }
}
command_register('cmd/topic/subject', cmd_topic_subject)
command_unregister('cmd/topic/subject', cmd_topic_subject)

// API to call commands and receive their result
const call_resolve_register = (topic, fn) => {}
const call_resolve_unregister = (topic, fn) => {}
const call_reject_register = (topic, fn) => {}
const call_reject_unregister = (topic, fn) => {}
const call = (topic, payload) => {
  return {
    messageId: 'unique-id',
    cancel: () => {},
    promise: () => new Promise()
  }
}

// Call command usage
const cmd_topic_subject_resolve = async result => {}
const cmd_topic_subject_reject = async result => {}
call_resolve_register('cmd/topic/subject', cmd_topic_subject_resolve)
call_reject_register('cmd/topic/subject', cmd_topic_subject_reject)
const call1 = call('cmd/topic/subject', { payload: 'data' })
// Save the message
const messageId = call1.messageId
// To cancel
call1.cancel()
// Wait for result (result also sent to call_resolve_register)
// Will throw exception if command is rejected
const result = await call1.promise()
```