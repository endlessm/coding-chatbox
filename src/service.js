// src/service.js
//
// Copyright (c) 2016-2017 Endless Mobile Inc.
//
// Contains the "service" backend, which drives the chatbox interaction with
// the rest of the game.
//

const ChatboxService = imports.gi.ChatboxService;
const CodingGameDBUSService = imports.gi.CodingGameService;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gio = imports.gi.Gio;
const Showmehow = imports.gi.Showmehow;

const Lang = imports.lang;
const Signals = imports.signals;


// eslint-disable-next-line no-unused-vars
const CodingGameService = new Lang.Class({
    Name: 'CodingGameService',
    Extends: GObject.Object,

    _init: function() {
        this.parent();

        // Initialise this service straight away, we need it for the chatbox
        // to function
        this._service = CodingGameDBUSService.CodingGameServiceProxy.new_for_bus_sync(
            Gio.BusType.SESSION,
            Gio.DBusProxyFlags.DO_NOT_AUTO_START_AT_CONSTRUCTION,
            'com.endlessm.CodingGameService.Service',
            '/com/endlessm/CodingGameService/Service',
            null);
    },

    chatboxLogForActor: function(actor, callback) {
        this._service.call_chat_history(actor, null, Lang.bind(this, function(source, result) {
            let returnValue;

            try {
                returnValue = this._service.call_chat_history_finish(result)[1];
            } catch (e) {
                logError(e, 'Failed to get chat service history for ' + actor);
                return;
            }

            let history = returnValue.deep_unpack();
            callback(history.map(function(h) {
                return JSON.parse(h);
            }));
        }));
    },

    callExternalEvent: function(event) {
        this._service.call_external_event(event, null, Lang.bind(this, function(source, result) {
            try {
                this._service.call_external_event_finish(result);
            } catch(e) {
                logError(e, 'Failed to send external event ' + event);
            }
        }));
    },

    openAttachment: function(location) {
        this._service.call_open_attachment(location, null, Lang.bind(this, function(source, result) {
            try {
                this._service.call_open_attachment_finish(result);
            } catch(e) {
                logError(e, 'Failed to send attachment open notification to ' + location);
            }
        }));
    },

    respondToMessage: function(location, responseContents, responseName) {
        let chatResponseHandler = Lang.bind(this, function(source, result) {
            try {
                this._service.call_chat_response_finish(result);
            } catch(e) {
                logError(e, 'Failed to repond to message ' + location + ' with response ' + responseName);
            }
        });

        this._service.call_chat_response(location,
                                         responseContents,
                                         responseName,
                                         null,
                                         chatResponseHandler);
    }
});

const ChatboxReceiverErrorDomain = GLib.quark_from_string('chatbox-receiver-error');
const ChatboxReceiverErrors = {
    INTERNAL_ERROR: 0
};


const ChatboxReceiverService = new Lang.Class({
    Name: 'ChatboxReceiverService',
    Extends: ChatboxService.CodingChatboxSkeleton,

    vfunc_handle_receive_message: function(method, message) {
        try {
            let decodedMessage = JSON.parse(message);

            if (decodedMessage.message) {
                this.emit('chat-message',
                          decodedMessage.actor,
                          decodedMessage.message,
                          decodedMessage.name,
                          decodedMessage.timestamp,
                          decodedMessage.styles);
            } else if (decodedMessage.input) {
                this.emit('user-input-bubble',
                          decodedMessage.actor,
                          decodedMessage.input,
                          decodedMessage.name,
                          decodedMessage.styles);
            } else if (decodedMessage.attachment) {
                this.emit('chat-attachment',
                          decodedMessage.actor,
                          decodedMessage.attachment,
                          decodedMessage.name,
                          decodedMessage.timestamp,
                          decodedMessage.styles);
            } else if (decodedMessage.separator) {
                this.emit('chat-separator',
                          decodedMessage.actor);
            }
            this.complete_receive_message(method);
        } catch (e) {
            method.return_error_literal(ChatboxReceiverErrorDomain,
                                        ChatboxReceiverErrors.INTERNAL_ERROR,
                                        String(e));
        }

        return true;
    },

    vfunc_handle_reset: function(method) {
        try {
            this.emit('reset');
            this.complete_reset(method);
        } catch (e) {
            method.return_error_literal(ChatboxReceiverErrorDomain,
                                        ChatboxReceiverErrors.INTERNAL_ERROR,
                                        String(e));
        }

        return true;
    }
});
Signals.addSignalMethods(ChatboxReceiverService.prototype);

// eslint-disable-next-line no-unused-vars
const CodingChatboxTextService = new Lang.Class({
    Name: 'CodingChatboxTextService',
    Extends: GObject.Object,

    _init: function() {
        this.parent();

        let name = 'com.endlessm.Showmehow.Service';
        let path = '/com/endlessm/Showmehow/Service';

        // Connect to the service and refresh the content once we have a connection
        this._service = Showmehow.ServiceProxy.new_for_bus_sync(Gio.BusType.SESSION, 0, name, path, null);
    },

    evaluate: function(showmehow_id, text, callback) {
        let [name, position] = showmehow_id.split('::');

        this._service.call_attempt_lesson_remote(-1, name, position, text, null, Lang.bind(this, function(source, result) {
            let returnValue;
            try {
                returnValue = this._service.call_attempt_lesson_remote_finish(result)[1];
            } catch (e) {
                logError(e, 'Failed to get showmehow response for ' +
                         showmehow_id + ' with response ' +
                         text);
                return;
            }

            let decodedReturnValue = JSON.parse(returnValue);

            // Send that result back to the game service
            callback(decodedReturnValue.result);
        }));
    },
});
