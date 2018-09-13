"use strict";
var __assign = (this && this.__assign) || Object.assign || function(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
            t[p] = s[p];
    }
    return t;
};
exports.__esModule = true;
var shared_1 = require("./shared");
var amiio = require('ami-io');
var asteriskClient;
var clientStatus = function (message) {
    if (asteriskClient && asteriskClient.connected)
        return {
            success: true,
            message: 'connected successfully'
        };
    else
        return {
            success: false,
            message: message
        };
};
var ipcResponse = function (err, data) { return ({
    success: err === null,
    message: err ? err.message : data ? data.message : shared_1.MSG.GENERIC.ERROR,
    payload: err || data
}); };
/**
 * Connect to Asterisk AMI
 *
 * @param   event ipcRenderer event
 * @param   args  expects connection string
 * @return  object with success bool, message, and payload
 */
exports.amiConnect = function (renderer, args) {
    var connection = args.connection;
    if (!connection || !connection.match('@') || !connection.match(':')) {
        renderer.returnValue = clientStatus('Invalid connection string, please check your connection settings');
        return;
    }
    var _a = args.connection.split('@').map(function (a) { return a.split(':'); }), credentials = _a[0], host = _a[1];
    asteriskClient = amiio.createClient({
        host: host[0],
        port: host[1],
        login: credentials[0],
        password: credentials[1]
    });
    asteriskClient.useLogger(new amiio.SilentLogger());
    asteriskClient.on('connected', function () {
        renderer.returnValue = clientStatus();
    });
    asteriskClient.on('incorrectServer', function () {
        console.log('incorrectServer', renderer);
        renderer.returnValue = clientStatus('Invalid server address, please check your connection settings');
    });
    asteriskClient.on('connectionRefused', function () {
        console.log('connectionRefused', renderer);
        renderer.returnValue = clientStatus('Connection refused, please check your connection settings');
    });
    asteriskClient.on('incorrectLogin', function () {
        console.log('incorrectLogin', renderer);
        renderer.returnValue = clientStatus('Incorrect login credentials, please check your connection settings');
    });
    asteriskClient.connect();
};
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
exports.amiOriginate = function (renderer, args) {
    console.log('amiOriginate', args);
    // Guard clause to make sure we are connected to Asterisk
    var status = clientStatus();
    if (status.success === false)
        return renderer.sender.send(shared_1.AMI.ORIGINATE.RESPONSE, status);
    var payload = args.payload, settings = args.settings;
    var phoneNumber = payload.contact.phone;
    var phone = settings.prefix && phoneNumber.length > 6
        ? settings.prefix + phoneNumber
        : phoneNumber;
    var action = new amiio.Action.Originate();
    action.Channel = settings.channel;
    action.Context = 'from-internal';
    action.Exten = phone;
    action.Priority = 1;
    action.Async = false;
    action.WaitEvent = false;
    action.CallerID = settings.caller;
    action.variables = {
        SIPADDHEADER: 'Call-Info: Answer-After=0'
    };
    asteriskClient.send(action, function (err, data) {
        renderer.sender.send(shared_1.AMI.ORIGINATE.RESPONSE, ipcResponse(err, __assign({}, payload, { amiResponse: data })));
    });
    asteriskClient.on('rawEvent.DialBegin', function (event) {
        renderer.sender.send(shared_1.AMI.ORIGINATE.RESPONSE, ipcResponse(null, __assign({}, payload, { channel: event.destchannel })));
    });
};
/**
 * Hangup a Call using Asterisk AMI
 *
 * @param   renderer ipcRenderer event
 * @param   args  expects: channel
 * @return  object with success bool, message, and payload
 */
exports.amiHangup = function (renderer, args) {
    console.log('amiHangup', args);
    // Guard clause to make sure we are connected to Asterisk
    var status = clientStatus();
    if (status.success === false)
        return renderer.sender.send(shared_1.AMI.HANGUP.RESPONSE, status);
    var action = new amiio.Action.Hangup();
    action.Channel = args.channel;
    asteriskClient.send(action, function (err, data) {
        renderer.sender.send(shared_1.AMI.HANGUP.RESPONSE, ipcResponse(err, data));
    });
};
/**
 * Get a list of peers through AMI
 */
exports.amiPeers = function (renderer, args) {
    console.log('amiPeers Init');
    // Guard clause to make sure we are connected to Asterisk
    var status = clientStatus();
    if (status.success === false)
        return renderer.sender.send(shared_1.AMI.PEERS.RESPONSE, status);
    var action = new amiio.Action.SipPeers();
    asteriskClient.send(action, function (_, data) {
        var peers = data.events.filter(function (e) { return e.event === 'PeerEntry'; });
        renderer.sender.send(shared_1.AMI.PEERS.RESPONSE, ipcResponse(null, peers));
    });
    // asteriskClient.on('PeerEntry', (event: any) => {
    //   console.log('TEST/PeerEntry', event)
    // })
    //
    // asteriskClient.on('PeerlistComplete', (event: any) => {
    //   console.log('TEST/PeerlistComplete', event)
    //   // renderer.sender.send(AMI.PEERS.RESPONSE, ipcResponse(null, event))
    // })
};
