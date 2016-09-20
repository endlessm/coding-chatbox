/* src/service.js
 *
 * Copyright (c) 2016 Endless Mobile Inc.
 * All Rights Reserved.
 *
 * Contains the "service" backend, which drives the chatbox interaction with
 * the rest of the game.
 */

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Showmehow = imports.gi.Showmehow;
const CodingGameDBUSService = imports.gi.CodingGameService
const ChatboxService = imports.gi.ChatboxService;

const Lang = imports.lang;
const Signals = imports.signals;


const CodingGameService = new Lang.Class({
    Name: 'CodingGameService',
    Extends: GObject.Object,

    _init: function() {
        this.parent();

        /* Initialise this service straight away, we need it for the chatbox
         * to function */

        let name = 'com.endlessm.CodingGameService.Service';
        let path = '/com/endlessm/CodingGameService/Service';

        this._service = CodingGameDBUSService.CodingGameServiceProxy
                                             .new_for_bus_sync(Gio.BusType.SESSION,
                                                               0,
                                                               name,
                                                               path,
                                                               null);
    },

    chatboxLogForActor: function(actor, callback) {
        this._service.call_chat_history(actor, null, Lang.bind(this, function(source, result) {
            try {
                [success, returnValue] = this._service.call_chat_history_finish(result);
            } catch (e) {
                logError(e, "Failed to get chat service history for " + actor);
                return;
            }

            let history = returnValue.deep_unpack();
            callback(history.map(function(h) {
                return JSON.parse(h);
            }));
        }));
    },

    respond_to_message: function(location, response_contents, response_name) {
        this._service.call_chat_response(location,
                                         response_contents,
                                         response_name,
                                         null,
                                         Lang.bind(this, function(source, result) {
            try {
                [success, returnValue] = this._service.call_chat_response_finish(result);
            } catch(e) {
                logError(e, "Failed to repond to message " + location + " with response " + response_name);
            }
        }));
    }
});

const ChatboxReceiverErrorDomain = GLib.quark_from_string('chatbox-receiver-error');
const ChatboxReceiverErrors = {
    INTERNAL_ERROR: 0
};


const ChatboxReceiverService = new Lang.Class({
    Name: 'ChatboxReceiverService',
    Extends: ChatboxService.CodingChatboxSkeleton,

    _init: function(params) {
        this.parent(params);
    },

    vfunc_handle_receive_message: function(method, message) {
        try {
            let decodedMessage = JSON.parse(message);
            decodedMessage.message.type = 'scrolled'; // Obviously needs to be fixed service-side

            this.emit('chat-message', decodedMessage.actor, decodedMessage.message);
            if (decodedMessage.input) {
                this.emit('user-input-bubble',
                          decodedMessage.actor,
                          decodedMessage.input,
                          decodedMessage.name);
            }

            this.complete_receive_message(method);
        } catch (e) {
            method.return_error_literal(ChatboxReceiverErrorDomain,
                                        ChatboxReceiverErrors.INTERNAL_ERROR,
                                        String(e));
        }
    }
});
Signals.addSignalMethods(ChatboxReceiverService.prototype);

const CodingChatboxTextService = new Lang.Class({
    Name: 'CodingChatboxTextService',
    Extends: GObject.Object,

    _init: function() {
        this.parent();

        /* Null-initialise service for now, but we'll set it later */
        this._service = null;

        let name = 'com.endlessm.Showmehow.Service';
        let path = '/com/endlessm/Showmehow/Service';

        /* Connect to the service and refresh the content once we have a connection */
        this._service = Showmehow.ServiceProxy.new_for_bus_sync(Gio.BusType.SESSION, 0, name, path, null);
    },

    evaluate: function(showmehow_id, text, callback) {
        let [name, position] = showmehow_id.split('::');

        this._service.call_attempt_lesson_remote(name, position, text, null,
                                                 Lang.bind(this, function(source, result) {
            let success, returnValue;
            try {
                [success, returnValue] = this._service.call_attempt_lesson_remote_finish(result);
            } catch (e) {
                logError(e, 'Failed to get showmehow response for ' +
                         showmehow_id + ' with response ' +
                         text);
                return;
            }

            /* Now that we have the response, unpack it and call callback with
             * the discrete result */
            let [response, move_to] = returnValue.deep_unpack();

            /* Send that result back to the game service */
            callback(response);
        }));
    },
});
Signals.addSignalMethods(CodingChatboxTextService.prototype);
