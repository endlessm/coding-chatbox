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

        this._pending_requests = [];

        let name = 'com.endlessm.Showmehow.Service';
        let path = '/com/endlessm/Showmehow/Service';

        /* Connect to the service and refresh the content once we have a connection */
        Showmehow.ServiceProxy.new_for_bus(Gio.BusType.SESSION, 0, name, path, null,
                                           Lang.bind(this, function(source, result) {
            try {
                this._service = Showmehow.ServiceProxy.new_for_bus_finish(result);
            } catch (e) {
                logError(e, "Error occurred in creating ShowmehowServiceProxy");
                return;
            }

            /* Release any pending requests now */
            this._pending_requests.forEach(function(r) {
                r();
            });
            this._pending_requests = [];
        }));
    },

    _on_lesson_response: function(source, result, name, position, actor) {
        let success, rv;

        try {
            [success, rv] = this._service.call_attempt_lesson_remote_finish(result);
        } catch (e) {
            logError(e, 'Error occurred in attempting lesson');
            return;
        }

        /* XXX: Does !sucess here imply that an exception was thrown
         * earlier? IF so, this block can be removed. */
        if (!success) {
            log('Couldn\'t attempt lesson successfully');
            return;
        }

        let [responses_json, move_to] = rv.deep_unpack();
        let responses = JSON.parse(responses_json);

        responses.forEach(Lang.bind(this, function(response) {
            this.emit('chat-message', actor, {
                type: response.type,
                text: response.value
            });
        }));

        /* Move to the next specified task. If this is an empty
         * string, then it means there are no more tasks to
         * complete and we should respond accordingly. */
        if (move_to.length === 0) {
            return;
        }

        this.fetch_task_description_for(name, move_to, actor);
    },

    fetch_task_description_for: function(name, position, actor) {
        let service_call = Lang.bind(this, function() {
            this._service.call_get_task_description(name, position, null,
                                                    Lang.bind(this, function(source, result) {
                let success, return_value;

                try {
                    [success, return_value] = this._service.call_get_task_description_finish(result);
                } catch (e) {
                    logError(e, 'Error occurred in getting task description for ' + position);
                    return;
                }

                if (!success) {
                    log('Call to get_task_description failed, cannot show this task.');
                    return;
                }

                let [desc, input_spec_string] = return_value.deep_unpack();
                let input_spec = JSON.parse(input_spec_string);

                this.emit('chat-message', actor, {
                    type: 'scrolled',
                    mode: 'animated',
                    text: desc
                });
                this.emit('user-input-bubble', actor, input_spec, name, position);
            }));
        });

        if (this._service) {
            service_call();
        } else {
            this._pending_requests.push(service_call);
        }

    },

    evaluate: function(name, position, actor, text, callback) {
        this._service.call_attempt_lesson_remote(name, position, text, null,
                                                 Lang.bind(this, function(source, result) {
            let success, returnValue;
            try {
                [success, returnValue] = this._service.call_attempt_lesson_remote_finish(result);
            } catch (e) {
                logError(e, 'Failed to get showmehow response for ' +
                         [name, position].join('::') + ' with response ' +
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
