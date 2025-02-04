class CommandAlreadyRegistered extends Error {
  constructor(message) {
    super(message)
    this.name = this.constructor.name
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor)
  }
}

class CallWithNoSubscription extends Error {
  constructor(message) {
    super(message)
    this.name = this.constructor.name
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor)
  }
}

export { CommandAlreadyRegistered, CallWithNoSubscription }
