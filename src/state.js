// src/state.js
//
// Copyright (c) 2016-2017 Endless Mobile Inc.
//
// Contains the "service" backend, which drives the chatbox interaction with
// the rest of the game.
//

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;

const Lang = imports.lang;

const INT32_MAX = (2147483647);

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
    // renderView
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
    renderView: Lang.UNIMPLEMENTED
});

const SentBy = {
    USER: 0,
    ACTOR: 1,
    INPUT: 2
};

const AmendmentResult = {
    NONE: 0,
    DID_AMENDMENT: 1,
    ADD_TO_CONTAINER: 2
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
                                ''),
        wrap_width: GObject.ParamSpec.int('wrap-width',
                                          '',
                                          '',
                                          GObject.ParamFlags.READWRITE |
                                          GObject.ParamFlags.CONSTRUCT_ONLY,
                                          -1,
                                          INT32_MAX,
                                          30)
    },

    _init: function(params, spec) {
        this.parent(params);
        this.text = spec.text;
        if (spec.wrap_width)
            this.wrap_width = spec.wrap_width;
    },

    amend: function() {
        return AmendmentResult.NONE;
    }
});

const ChoiceChatboxMessage = new Lang.Class({
    Name: 'ChoiceChatboxMessage',
    Extends: CodingChatboxMessageBase,
    Properties: {
        'prompt': GObject.ParamSpec.string('prompt',
                                           '',
                                           '',
                                           GObject.ParamFlags.READWRITE |
                                           GObject.ParamFlags.CONSTRUCT_ONLY,
                                           '')
    },

    _init: function(params, spec) {
        // If we don't have a prompt in the spec, there's not a whole lot
        // we can do. It probably came from the history at a point where
        // service was not sending prompts back. Just send through nothing
        // in that case, since there will usually be a default in every other
        // case
        params.prompt = spec.settings.prompt || '';
        this.parent(params);
        this.choices = Object.keys(spec.settings.choices).map(function(key) {
            return {
                label: spec.settings.choices[key].text,
                name: key
            };
        });
    },

    amend: function() {
        return AmendmentResult.NONE;
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
        return AmendmentResult.NONE;
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
                                       ''),
        open_event: GObject.ParamSpec.string('open-event',
                                             'Optional event to trigger on open',
                                             'Optional event to trigger on open',
                                             GObject.ParamFlags.READWRITE |
                                             GObject.ParamFlags.CONSTRUCT_ONLY,
                                             '')
    },

    _init: function(params, spec) {
        this.parent(params);
        this.path = Gio.File.new_for_path(spec.attachment.path);
        this.desc = spec.attachment.desc;
        if (spec.attachment.open_event)
            this.open_event = spec.attachment.open_event;
    },

    amend: function() {
        return AmendmentResult.NONE;
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
                                        SentBy.INPUT,
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

        let messageAmendResult = this.message.amend(spec);
        switch (messageAmendResult) {
        case AmendmentResult.ADD_TO_CONTAINER:
        case AmendmentResult.DID_AMENDMENT:
            // Unimplemented for now
            this.emit('message-changed', this.message);
            return true;
        default:
            // In any other case, return false, as we
            // could not do an amendment here.
            return false;
        }
    },

    // Replaces the contents of this message container with another
    // message, for instance when the user interacts with an
    // InputChatboxMessage or a ChoiceChatboxMessage, the message
    // should turn into a TextChatboxMessage.
    replaceWith: function(spec) {
        this.message = new this._message_factories[spec.type]({}, spec);
        this.emit('message-changed', this.message);
    },

    //
    // Render a view which can go into a view tree. The listener
    // takes a single string argument for the response to send to the
    // service for the location this container represents.
    //
    renderView: function(listener) {
        return this.message.renderView(Lang.bind(this, function(event) {
            // Attempt to amend the underlying message using
            // the data from event
            var amendment_spec = event.amendment;

            if (amendment_spec) {
                amendment_spec.sender = this.sender;
                this.replaceWith(amendment_spec);
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
    Extends: GObject.Object,
    Properties: {
        unread_messages: GObject.ParamSpec.int('unread-messages',
                                               '',
                                               '',
                                               GObject.ParamFlags.READWRITE,
                                               0,
                                               INT32_MAX,
                                               0)
    },

    _init: function(message_factories) {
        this.parent({
            unread_messages: 0
        });
        this._conversation = [];
        this._userInput = null;
        this._message_factories = message_factories;
        this._unreadNotificationTimeout = 0;
    },

    //
    // withEachMessageContainer
    //
    // Pass each message specification to callback, which can figure out what to do with it. The
    // messages passed are to be treated as immutable and typically used for things like
    // constructing views.
    withEachMessageContainer: function(callback) {
        this._conversation.forEach(callback);
    },

    //
    // addFromService
    //
    // Add a new response or user input bubble from the service using the specification
    // in message. Internally a new CodingChatboxMessage will be created, which represents
    // the internal state of the message.
    //
    addFromService: function(sender, message, location) {
        let container = new CodingChatboxMessageContainer({
            sender: sender,
            location: location,
            message: new this._message_factories[message.type]({}, message)
        }, this._message_factories);
        this._conversation.push(container);
        return container;
    },

    //
    // replaceUserInputWith
    //
    // Replace the currently active user input.
    //
    replaceUserInputWith: function(spec, location) {
        this._userInput = new CodingChatboxMessageContainer({
            sender: SentBy.INPUT,
            location: location,
            message: new this._message_factories[spec.type]({}, spec)
        }, this._message_factories);
        return this._userInput;
    },

    //
    // amendLastMessage
    //
    // Amend the last message in the model with a message specification. This might completely
    // change the message type (eg, from user input to just text).
    //
    // Returns false if it wasn't possible to change this message (for instance, the sender
    // was different).
    //
    // This function will return both a reference to the relevant container and also
    // whether the amendment was successful.
    //
    amendLastMessage: function(spec) {
        if (!this._conversation.length) {
            return false;
        }

        let container = this._conversation[this._conversation.length - 1];
        return [container.amend(spec), container];
    },

    //
    // currentLocation
    //
    // The current location in the message storyline that we are currently in, computed by
    // the last chat bubble.
    //
    // Returns null if there is no relevant position (eg, we are at the start of the
    // conversation).
    //
    currentLocation: function() {
        if (!this._conversation.length) {
            return null;
        }

        return this._conversation[this._conversation.length - 1].location;
    },

    //
    // markAllMessagesAsRead
    //
    // Marks all messages as read, thereby disconnecting the signal for
    // unread messages.
    markAllMessagesAsRead: function() {
        this.unread_messages = 0;
        if (this._unreadNotificationTimeout) {
            GLib.source_remove(this._unreadNotificationTimeout);
            this._unreadNotificationTimeout = 0;
        }
    },

    //
    // mesageBecameVisibleAndNotRead
    //
    // Increment the number of unread messages.
    //
    // Calls stillUnreadHandler if messages on this actor are still unread
    // after a certain amount of time.
    mesageBecameVisibleAndNotRead: function(timeoutSeconds, callback) {
        // We always want to increment _unreadMessages
        this.set_property('unread-messages', this.unread_messages + 1);

        // If _unreadNotificationTimeout is set, then just keep the old timeout
        // on-foot instead of removing it and re-adding it. We want the user
        // to get the notification timeoutSeconds after the first unread message
        // arrived.
        if (this._unreadNotificationTimeout)
            return;

        this._unreadNotificationTimeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,
                                                                   timeoutSeconds,
                                                                   Lang.bind(this, function() {
                                                                       callback();
                                                                       this._unreadNotificationTimeout = 0;
                                                                   }));
    },
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

    loadConversationsForActor: function(actor) {
        if (Object.keys(this.conversations).indexOf(actor) !== -1) {
            return;
        }

        this.conversations[actor] = new CodingChatboxConversationState(this._message_factories);
    },

    currentPositionForActor: function(actor) {
        this.loadConversationsForActor(actor);
        return this.conversations[actor].currentLocation();
    },

    addMessageForActor: function(actor, sender, spec, location) {
        this.loadConversationsForActor(actor);
        return this.conversations[actor].addFromService(sender, spec, location);
    },

    //
    // replaceUserInputWithForActor
    //
    // Replace the currently active user input with the given spec
    // for the given actor.
    //
    replaceUserInputWithForActor: function(actor, spec, location) {
        this.loadConversationsForActor(actor);
        return this.conversations[actor].replaceUserInputWith(spec, location);
    },

    amendLastMessageForActor: function(actor, sender, spec) {
        this.loadConversationsForActor(actor);
        var amendment_spec = spec;
        amendment_spec.sender = sender;
        return this.conversations[actor].amendLastMessage(spec);
    },

    mesageBecameVisibleAndNotRead: function(actor, timeoutSeconds, callback) {
        this.loadConversationsForActor(actor);
        this.conversations[actor].mesageBecameVisibleAndNotRead(timeoutSeconds, callback);
    },

    markAllMessagesByActorAsRead: function(actor) {
        this.loadConversationsForActor(actor);
        this.conversations[actor].markAllMessagesAsRead();
    },

    //
    // bindPropertyForActorState
    //
    // Create a GBinding between a property on the state of actor and
    // targetObject, using flags to control the binding.
    bindPropertyForActorState: function(actor,
                                        actorStateProp,
                                        targetObject,
                                        targetProp,
                                        flags,
                                        transformFrom,
                                        transformTo) {
        this.loadConversationsForActor(actor);
        if (transformFrom && transformTo) {
            // g_object_bind_property_full does not seem to work here, so
            // simulate it by connecting on 'notify'
            let realActorStateProp = actorStateProp.replace('-', '_');
            this.conversations[actor].connect('notify::' + actorStateProp, Lang.bind(this, function() {
                let value = this.conversations[actor][realActorStateProp];
                targetObject[targetProp] = transformFrom(value);
            }));
            let value = this.conversations[actor][realActorStateProp];
            targetObject[targetProp] = transformFrom(value);
        } else {
            this.conversations[actor].bind_property(actorStateProp,
                                                    targetObject,
                                                    targetProp,
                                                    flags);
        }
    },

    clearConversations: function() {
        this.conversations = {};
    }
});
