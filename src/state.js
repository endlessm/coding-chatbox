// src/state.js
//
// Copyright (c) 2016 Endless Mobile Inc.
// All Rights Reserved.
//
// Contains the "service" backend, which drives the chatbox interaction with
// the rest of the game.
//

const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;

const Lang = imports.lang;

const CodingChatboxMessage = new Lang.Interface({
    Name: 'CodingChatboxMessage',
    GTypeName: 'CodingChatboxMessageType',
    Requires: [ GObject.Object ],

    //
    // amend
    //
    // Attempts to amend the contents of the message. If it returns false, then that means that
    // the container should dispose of the whole message and construct a new one in its place.
    //
    amend: Lang.UNIMPLEMENTED,

    //
    // render_view
    //
    // Renders a view for this message, which iis suitable to be put into a container. The exact
    // implementation of the view depends on the message and it might be connected to signals
    // which occurr on the message container.
    //
    // The function should take one argument, a callback function "listener". The callback will
    // itself take a single object argument, which is the response to send to
    // the service, and an oject describing any amendments which should be
    // made to this state. That amendment shall be the same as a message
    // specification which could be used to construct a message.
    //
    // {
    //    name: string,
    //    amendment: object
    // }
    //
    //
    render_view: Lang.UNIMPLEMENTED
});

const SentBy = {
    USER: 0,
    ACTOR: 1
};

const CodingChatboxMessageBase = new Lang.Class({
    Name: 'CodingChatboxMessageBase',
    Extends: GObject.Object,
    Implements: [ CodingChatboxMessage ],

    _init: function(params) {
        this.parent(params);
    }
});

const TextChatboxMessage = new Lang.Class({
    Name: 'TextChatboxMessage',
    Extends: CodingChatboxMessageBase,
    Properties: {
        text: GObject.ParamSpec.string('text',
                                '',
                                '',
                                GObject.ParamFlags.READABLE,
                                '')
    },

    _init: function(params, spec) {
        this.parent(params);
        this.text = spec.text;
    },

    amend: function(spec) {
        if (spec.type !== 'scrolled' && spec.type !== 'scroll_wait') {
            return false;
        }

        this.text = this.text + '\n' + spec.text;
        return true;
    }
});

const ChoiceChatboxMessage = new Lang.Class({
    Name: 'ChoiceChatboxMessage',
    Extends: CodingChatboxMessageBase,

    _init: function(params, spec) {
        this.parent(params);
        this.choices = Object.keys(spec.settings).map(function(key) {
            return {
                label: spec.settings[key].text,
                name: key
            };
        });
    },

    amend: function() {
        return false;
    }
});

const InputChatboxMessage = new Lang.Class({
    Name: 'InputChatboxMessage',
    Extends: CodingChatboxMessageBase,
    Properties: {
        showmehow_id: GObject.ParamSpec.string('showmehow-id',
                                               '',
                                               '',
                                               GObject.ParamFlags.READWRITE,
                                               '')
    },

    _init: function(params, spec) {
        this.parent(params);
        this.showmehow_id = spec.settings.showmehow_id;
    },

    amend: function() {
        return false;
    }
});

const AttachmentChatboxMessage = new Lang.Class({
    Name: 'AttachmentChatboxMessage',
    Extends: CodingChatboxMessageBase,
    Properties: {
        path: GObject.ParamSpec.object('path',
                                       'Path',
                                       'Path to the Attachment',
                                       GObject.ParamFlags.READWRITE |
                                       GObject.ParamFlags.CONSTRUCT_ONLY,
                                       Gio.File),
        desc: GObject.ParamSpec.string('desc',
                                       'Description',
                                       'Description of the Attachment',
                                       GObject.ParamFlags.READWRITE |
                                       GObject.ParamFlags.CONSTRUCT_ONLY,
                                       '')
    },

    _init: function(params, spec) {
        this.parent(params);
        this.path = Gio.File.new_for_path(spec.attachment.path);
        this.desc = spec.attachment.desc;
    },

    amend: function() {
        return false;
    }
});

//
// CodingChatboxMessageContainer
//
// A container for a CodingChatboxMessage, which emits a signal when the underlying
// message is changed. It has a constant sender.
//
const CodingChatboxMessageContainer = new Lang.Class({
    Name: 'CodingChatboxMessageContainer',
    Extends: GObject.Object,
    Properties: {
        'message': GObject.ParamSpec.object('message',
                                            '',
                                            '',
                                            GObject.ParamFlags.WRITABLE |
                                            GObject.ParamFlags.CONSTRUCT_ONLY,
                                            CodingChatboxMessage),
        'location': GObject.ParamSpec.string('location',
                                             '',
                                             '',
                                             GObject.ParamFlags.READWRITE |
                                             GObject.ParamFlags.CONSTRUCT_ONLY,
                                             ''),
        'sender': GObject.ParamSpec.int('sender',
                                        '',
                                        '',
                                        GObject.ParamFlags.READWRITE |
                                        GObject.ParamFlags.CONSTRUCT_ONLY,
                                        SentBy.USER,
                                        SentBy.ACTOR,
                                        SentBy.USER)
    },
    Signals: {
        'message-changed': {
            param_types: [ GObject.TYPE_OBJECT ]
        }
    },

    _init: function(params, message_factories) {
        this.parent(params);
        this._message_factories = message_factories;
    },

    //
    // amend
    //
    // Attempts to amend this message, for instance, because of a user interaction
    // or something that happened on the service side. If the message spec indicates that
    // the message was actually sent by another user, reject the amendment and force a new
    // message to be displayed.
    //
    // Otherwise, check if the underlying message will accept the amendment. If it will,
    // let that message update. Otherwise, change the underlying message to fit the new
    // message contents. In both cases, fire the message-changed signal so that any listening
    // view can update itself with the new state of the message in the container.
    //
    amend: function(spec) {
        if (!spec) {
            return false;
        }

        if (spec.sender != this.sender) {
            return false;
        }

        if (!this.message.amend(spec)) {
            this.message = new this._message_factories[spec.type]({}, spec);
        }

        this.emit('message-changed', this.message);
        return true;
    },

    //
    // Render a view which can go into a view tree. The listener
    // takes a single string argument for the response to send to the
    // service for the location this container represents.
    //
    render_view: function(listener) {
        return this.message.render_view(Lang.bind(this, function(event) {
            // Attempt to amend the underlying message using
            // the data from event
            var amendment_spec = event.amendment;

            if (amendment_spec) {
                amendment_spec.sender = this.sender;
                this.amend(amendment_spec);
            }

            listener(event.response);
        }));
    }
});

//
// CodingChatboxConversationState
//
// The state of a particular conversation. Each conversation has a series of messages
// and also a respond-to property, which is the current narrative arc that we should
// request a response to on the next user input.
//
//
const CodingChatboxConversationState = new Lang.Class({
    Name: 'CodingChatboxConversationState',

    _init: function(message_factories) {
        this.parent();
        this._conversation = [];
        this._message_factories = message_factories;
    },

    //
    // with_each_message_container
    //
    // Pass each message specification to callback, which can figure out what to do with it. The
    // messages passed are to be treated as immutable and typically used for things like
    // constructing views.
    with_each_message_container: function(callback) {
        this._conversation.forEach(callback);
    },

    //
    // add_from_service
    //
    // Add a new response or user input bubble from the service using the specification
    // in message. Internally a new CodingChatboxMessage will be created, which represents
    // the internal state of the message.
    //
    add_from_service: function(sender, message, location) {
        let container = new CodingChatboxMessageContainer({
            sender: sender,
            location: location,
            message: new this._message_factories[message.type]({}, message)
        }, this._message_factories);
        this._conversation.push(container);
        return container;
    },

    //
    // amend_last_message
    //
    // Amend the last message in the model with a message specification. This might completely
    // change the message type (eg, from user input to just text).
    //
    // Returns false if it wasn't possible to change this message (for instance, the sender
    // was different).
    //
    amend_last_message: function(spec) {
        if (!this._conversation.length) {
            return false;
        }

        return this._conversation[this._conversation.length - 1].amend(spec);
    },

    //
    // current_location
    //
    // The current location in the message storyline that we are currently in, computed by
    // the last chat bubble.
    //
    // Returns null if there is no relevant position (eg, we are at the start of the
    // conversation).
    //
    current_location: function() {
        if (!this._conversation.length) {
            return null;
        }

        return this._conversation[this._conversation.length - 1].location;
    }
});

//
// CodingChatboxState
//
// The overall "state" of the chatbox, which includes the individual converation
//
const CodingChatboxState = new Lang.Class({
    Name: 'CodingChatboxState',

    _init: function(message_factories) {
        this.parent();
        this.conversations = {};
        this._message_factories = message_factories;
    },

    load_conversations_for_actor: function(actor) {
        if (Object.keys(this.conversations).indexOf(actor) !== -1) {
            return;
        }

        this.conversations[actor] = new CodingChatboxConversationState(this._message_factories);
    },

    conversation_position_for_actor: function(actor) {
        this.load_conversations_for_actor(actor);
        return this.conversations[actor].current_location();
    },

    add_message_for_actor: function(actor, sender, spec, location) {
        this.load_conversations_for_actor(actor);
        return this.conversations[actor].add_from_service(sender, spec, location);
    },

    amend_last_message_for_actor: function(actor, sender, spec) {
        this.load_conversations_for_actor(actor);
        var amendment_spec = spec;
        amendment_spec.sender = sender;
        return this.conversations[actor].amend_last_message(spec);
    }
});
