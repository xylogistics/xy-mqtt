# XT MQTT
Guaranteed delivery of calls and events over MQTT.

## Features
Defaults to QoS 2, non clean session, SQLite persistence.

```javascript
// API to register commands
const command_register = (topic, fn) => {}
const command_unregister = (topic, fn) => {}

// Register command usage
const cmd_topic_subject = async (payload, onCancel) => {
  onCancel(async () => {
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
subscribe('cmd/topic/subject/resolve', cmd_topic_subject_resolve)
subscribe('cmd/topic/subject/reject', cmd_topic_subject_reject)
const call1 = call('cmd/topic/subject', { payload: 'data' })
// Save the message
const messageId = call1.messageId
// To cancel
call1.cancel()
```