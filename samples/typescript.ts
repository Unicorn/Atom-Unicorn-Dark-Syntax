import { AMI, MSG } from './shared'
import { AmiConnect, AmiOriginate, AmiHangup, AmiEventResponse } from './types'

var amiio = require('ami-io')

var asteriskClient: any

const clientStatus = (message?: string): AmiEventResponse => {
  if (asteriskClient && asteriskClient.connected)
    return {
      success: true,
      message: 'connected successfully'
    }
  else
    return {
      success: false,
      message
    }
}

const ipcResponse = (err: any, data: any): AmiEventResponse => ({
  success: err === null,
  message: err ? err.message : data ? data.message : MSG.GENERIC.ERROR,
  payload: err || data
})

/**
 * Connect to Asterisk AMI
 *
 * @param   event ipcRenderer event
 * @param   args  expects connection string
 * @return  object with success bool, message, and payload
 */
export const amiConnect = (renderer: any, args: AmiConnect) => {
  const { connection } = args

  if (!connection || !connection.match('@') || !connection.match(':')) {
    renderer.returnValue = clientStatus(
      'Invalid connection string, please check your connection settings'
    )
    return
  }

  const [credentials, host] = args.connection.split('@').map(a => a.split(':'))

  asteriskClient = amiio.createClient({
    host: host[0],
    port: host[1],
    login: credentials[0],
    password: credentials[1]
  })

  asteriskClient.useLogger(new amiio.SilentLogger())

  asteriskClient.on('connected', () => {
    renderer.returnValue = clientStatus()
  })

  asteriskClient.on('incorrectServer', () => {
    console.log('incorrectServer', renderer)
    renderer.returnValue = clientStatus(
      'Invalid server address, please check your connection settings'
    )
  })

  asteriskClient.on('connectionRefused', () => {
    console.log('connectionRefused', renderer)
    renderer.returnValue = clientStatus(
      'Connection refused, please check your connection settings'
    )
  })

  asteriskClient.on('incorrectLogin', () => {
    console.log('incorrectLogin', renderer)
    renderer.returnValue = clientStatus(
      'Incorrect login credentials, please check your connection settings'
    )
  })

  asteriskClient.connect()
}

/**
 * Make a Call using Asterisk AMI
 *
 * @param   renderer ipcRenderer event
 * @param   args  expects: AmiOriginate payload
 * @return  void
 *
 *  {
 *    payload: {
 *      key: '9895011460',
 *      contact: {
 *        group: 'all',
 *        name: '(989) 501-1460',
 *        phone: '9895011460'
 *      },
 *      startTime: '2018-06-07T20:37:54.336Z'
 *    },
 *    settings: {
 *      activeWidget: 'phone',
 *      caller: 'Clay Unicorn',
 *      channel: 'SIP/1001',
 *      connection: 'admin:56c239f9c0ac0b9c1981bc7a0e405c5f@localhost:5038',
 *      prefix: '9'
 *    }
 *  }
 */
export const amiOriginate = (renderer: any, args: AmiOriginate) => {
  console.log('amiOriginate', args)

  // Guard clause to make sure we are connected to Asterisk
  const status = clientStatus()
  if (status.success === false)
    return renderer.sender.send(AMI.ORIGINATE.RESPONSE, status)

  const { payload, settings } = args

  let phoneNumber = payload.contact.phone
  let phone =
    settings.prefix && phoneNumber.length > 6
      ? settings.prefix + phoneNumber
      : phoneNumber
  let action = new amiio.Action.Originate()

  action.Channel = settings.channel
  action.Context = 'from-internal'
  action.Exten = phone
  action.Priority = 1
  action.Async = false
  action.WaitEvent = false
  action.CallerID = settings.caller
  action.variables = {
    SIPADDHEADER: 'Call-Info: Answer-After=0'
  }

  asteriskClient.send(action, (err: any, data: any) => {
    renderer.sender.send(
      AMI.ORIGINATE.RESPONSE,
      ipcResponse(err, { ...payload, amiResponse: data })
    )
  })

  asteriskClient.on('rawEvent.DialBegin', (event: any) => {
    renderer.sender.send(
      AMI.ORIGINATE.RESPONSE,
      ipcResponse(null, { ...payload, channel: event.destchannel })
    )
  })
}

/**
 * Hangup a Call using Asterisk AMI
 *
 * @param   renderer ipcRenderer event
 * @param   args  expects: channel
 * @return  object with success bool, message, and payload
 */
export const amiHangup = (renderer: any, args: AmiHangup) => {
  console.log('amiHangup', args)

  // Guard clause to make sure we are connected to Asterisk
  const status = clientStatus()
  if (status.success === false)
    return renderer.sender.send(AMI.HANGUP.RESPONSE, status)

  let action = new amiio.Action.Hangup()
  action.Channel = args.channel

  asteriskClient.send(action, (err: any, data: any) => {
    renderer.sender.send(AMI.HANGUP.RESPONSE, ipcResponse(err, data))
  })
}

/**
 * Get a list of peers through AMI
 */
export const amiPeers = (renderer: any, args: any) => {
  console.log('amiPeers Init')
  // Guard clause to make sure we are connected to Asterisk
  const status = clientStatus()
  if (status.success === false)
    return renderer.sender.send(AMI.PEERS.RESPONSE, status)

  let action = new amiio.Action.SipPeers()

  asteriskClient.send(action, (_: any, data: any) => {
    let peers = data.events.filter((e: any) => e.event === 'PeerEntry')
    renderer.sender.send(AMI.PEERS.RESPONSE, ipcResponse(null, peers))
  })

  // asteriskClient.on('PeerEntry', (event: any) => {
  //   console.log('TEST/PeerEntry', event)
  // })
  //
  // asteriskClient.on('PeerlistComplete', (event: any) => {
  //   console.log('TEST/PeerlistComplete', event)
  //   // renderer.sender.send(AMI.PEERS.RESPONSE, ipcResponse(null, event))
  // })
}
