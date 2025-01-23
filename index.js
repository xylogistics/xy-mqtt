import MQTT from './mqtt.js'
export { MQTT }
export default options => {
  const mqtt = MQTT(options)

  // TODO: Wrap with event, call, resolve and reject APIs
  // Like xy-websocket
  const api = {
    mqtt
  }

  return api
}
