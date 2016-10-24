/* src/service.js
 *
 * Copyright (c) 2016 Endless Mobile Inc.
 * All Rights Reserved.
 *
 * Contains the "service" backend, which drives the chatbox interaction with
 * the rest of the game.
 */

const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Showmehow = imports.gi.Showmehow;

const Lang = imports.lang;
const Signals = imports.signals;


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

    evaluate: function(name, position, actor, text) {
        this._service.call_attempt_lesson_remote(name, position, text, null,
                                                 Lang.bind(this, this._on_lesson_response, name, position, actor));
    },
});
Signals.addSignalMethods(CodingChatboxTextService.prototype);
