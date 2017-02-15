// src/containers.js
//
// Copyright (c) 2016-2017 Endless Mobile Inc.
//
// Containers for chat bubbles.
//
// Due to the different interactions that can occurr, we separate out chat
// bubbles into paired containers and views, which actually display the content.
//
// There are a few different layers of containers. Each conversation has
// its own container which is made up of many message groups. A message
// group breaks either after a certain amount of time or once another
// actor starts talking. A message group is made up of many individual
// message containers which have both a bubble as well as some extra detail
// on each side. Finally, an individual container may contain a single
// or potentially multiple pieces of content, each of which might be of
// the same time.

const Gdk = imports.gi.Gdk;
const GdkPixbuf = imports.gi.GdkPixbuf;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;

const Contact = imports.contact;
const Lang = imports.lang;
const State = imports.state;
const Views = imports.views;
const Timestamp = imports.timestamp;
const Queue = imports.queue;

// createCopyPopover
//
// Creates a popover copy button which invokes the specified
// callback when the button is clicked
function createCopyPopover(forWidget, callback) {
    let popover = new Gtk.Popover({ relative_to: forWidget });
    // TODO: make this translatable
    let button = new Gtk.Button({
        label: 'Copy',
        visible: true
    });
    button.connect('clicked', callback);
    popover.add(button);
    return popover;
}

// eslint-disable-next-line no-unused-vars
const ChatBubble = new Lang.Class({
    Name: 'ChatBubble',
    Extends: Gtk.Box,
    Template: 'resource:///com/endlessm/Coding/Chatbox/chat-bubble-container.ui',
    Children: [
        'inner-box',
        'event-box',
        'user-image-container',
        'bubble-detail-left',
        'bubble-detail-right'
    ],
    Properties: {
        'content': GObject.ParamSpec.object('content',
                                            '',
                                            '',
                                            GObject.ParamFlags.READWRITE,
                                            Gtk.Widget),
        'sender': GObject.ParamSpec.int('sender',
                                        '',
                                        '',
                                        GObject.ParamFlags.READWRITE |
                                        GObject.ParamFlags.CONSTRUCT_ONLY,
                                        State.SentBy.USER,
                                        State.SentBy.INPUT,
                                        State.SentBy.USER),
        'display-image': GObject.ParamSpec.object('display-image',
                                                  '',
                                                  '',
                                                  GObject.ParamFlags.READWRITE |
                                                  GObject.ParamFlags.CONSTRUCT_ONLY,
                                                  GdkPixbuf.Pixbuf)
    },

    _init: function(params, styles, showContentHandler) {
        this.parent(params);

        Views.applyStyles(this, styles);
        this._popover = createCopyPopover(this, Lang.bind(this, function() {
            this.content.copyToClipboard();
            this._popover.hide();
        }));

        let margin_prop, halign, containerStyle;
        switch (params.sender) {
        case State.SentBy.ACTOR:
            [margin_prop, halign, containerStyle] = ['margin-start', Gtk.Align.START, 'by-actor'];

            // Add the user's icon to the left hand side of the box
            // as well
            this.user_image_container.pack_start(new Contact.RoundedImage({
                visible: true,
                pixbuf: this.display_image.scale_simple(28,
                                                        28,
                                                        GdkPixbuf.InterpType.BILINEAR),
                halign: Gtk.Align.START,
            }), true, true, 0);
            this.bubble_detail_left.visible = true;
            break;
        case State.SentBy.USER:
            [margin_prop, halign, containerStyle] = ['margin-end', Gtk.Align.END, 'by-user'];
            this.bubble_detail_right.visible = true;
            break;
        case State.SentBy.INPUT:
            [margin_prop, halign, containerStyle] = [null, Gtk.Align.FILL, 'input-bubble-container'];
            break;
        default:
            throw new Error('Don\'t know how to handle sender type ' + params.sender);
        }

        if (margin_prop) {
            this[margin_prop] = 10;
        }

        this.halign = halign;
        this.get_style_context().add_class(containerStyle);

        this.inner_box.pack_start(this.content, true, true, 0);
        this.event_box.add_events(Gdk.EventMask.BUTTON_PRESS_MASK |
                                  Gdk.EventMask.BUTTON_RELEASE_MASK);

        this.event_box.connect('button-press-event', Lang.bind(this, function(btn, event) {
            if (!this.content.supportsCopyPaste())
                return;

            if (event.get_button()[1] === Gdk.BUTTON_SECONDARY) {
                // Secondary button pressed. Show popover with copy option
                this._popover.show();
            }
        }));

        this._showContentHandler = showContentHandler;
    },

    set content(val) {
        this._content = val;

        // Can't run this setter if we don't have an inner_box yet
        if (!this.inner_box) {
            return;
        }

        this.inner_box.get_children().forEach(Lang.bind(this, function(child) {
            this.inner_box.remove(child);
        }));
        this.inner_box.pack_start(this._content, true, true, 0);
    },

    get content() {
        return this._content;
    },

    focused: function() {
        this._content.focused();
    },

    showContent: function() {
        this._showContentHandler();
    }
});

const _MILLISECONDS_TO_MINUTE = 1000 * 60;
const _FIVE_MINUTES_IN_MS = _MILLISECONDS_TO_MINUTE * 5;
const _MESSAGE_GROUP_LIMIT = 10;

// isCloseEnoughInTime
//
// Return true if the given date of the income chat bubble is close enough
// in time to the most recent one in this group
function isCloseEnoughInTime(lastMessageDate, currentMessageDate) {
    let delta = currentMessageDate.getTime() - lastMessageDate.getTime();
    return delta < _FIVE_MINUTES_IN_MS;
}

const MessageGroup = new Lang.Class({
    Name: 'MessageGroup',
    Extends: Gtk.Box,
    Template: 'resource:///com/endlessm/Coding/Chatbox/chatbox-message-group.ui',
    Children: [
        'message-received-date-container',
        'message-received-date-label',
        'chatbox-bubbles'
    ],

    _init: function(params) {
        params.orientation = Gtk.Orientation.VERTICAL;
        this.parent(params);

        this._messageDates = [];
        this._actorName = null;
    },

    addBubble: function(bubbleView, date, actorName) {
        // Different actors don't have the same message group. Note that the
        // convention here is that user bubbles have an actorName of 'user'
        if (this._actorName && actorName !== this._actorName) {
            return false;
        }

        // Limit of 10 bubbles per message group, just to add some
        // distinction between bubbles.
        if (this._messageDates.length > _MESSAGE_GROUP_LIMIT) {
            return false;
        }

        // If the incoming message is too new, it does not belong in the
        // same message group
        if (this._messageDates.length !== 0 &&
            !isCloseEnoughInTime(this._messageDates[this._messageDates.length - 1],
                                 date)) {
            return false;
        }

        if (!this._actorName && actorName === 'user') {
            this.message_received_date_container.halign = Gtk.Align.END;
            this.message_received_date_container.margin_end = 40;
        }

        this._messageDates.push(date);
        this._actorName = actorName;
        this.chatbox_bubbles.pack_start(bubbleView, true, true, 5);
        this.updateMessageReceivedDate();

        return true;
    },

    updateMessageReceivedDate: function() {
        if (!this._messageDates.length) {
            return;
        }

        let date = this._messageDates[this._messageDates.length - 1];
        this.message_received_date_label.label = Timestamp.calculateMessageReceivedTextFromDate(date);
    }
});



const ChatScrollView = new Lang.Class({
    Name: 'ChatScrollView',
    Extends: Gtk.ScrolledWindow,

    _init: function(chatContents) {
        this.parent({
            visible: true,
            width_request: 500,
            expand: true,
            max_content_width: 750
        });
        this.add(chatContents);
    }
});

const ChatStackChild = new Lang.Class({
    Name: 'ChatStackChild',
    Extends: Gtk.Box,
    Properties: {
        'chat-contents': GObject.ParamSpec.object('chat-contents',
                                                  '',
                                                  '',
                                                  GObject.ParamFlags.READWRITE |
                                                  GObject.ParamFlags.CONSTRUCT_ONLY,
                                                  Gtk.Box),
        'message-queue': GObject.ParamSpec.object('message-queue',
                                                  '',
                                                  '',
                                                  GObject.ParamFlags.READWRITE |
                                                  GObject.ParamFlags.CONSTRUCT_ONLY,
                                                  Queue.TriggerableEventQueue.$gtype),
        'input-area': GObject.ParamSpec.object('input-area',
                                               '',
                                               '',
                                               GObject.ParamFlags.READWRITE |
                                               GObject.ParamFlags.CONSTRUCT_ONLY,
                                               Gtk.Box)
    },

    _init: function(params) {
        this.parent(params);

        // XXX: Not sure why, but placing this widget in another box fixes
        // a problem where the box shadow in the input area would be
        // obscured by the scroll view
        let scrollViewBox = new Gtk.Box({
            visible: true,
            vexpand: true,
            valign: Gtk.Align.FILL
        });
        this._scrollView = new ChatScrollView(this.chat_contents);

        let chatInputBoxWithShadow = new Gtk.Box({
            visible: true,
            orientation: Gtk.Orientation.VERTICAL
        });
        chatInputBoxWithShadow.get_style_context().add_class('chatbox-input-area-shadow');

        this._chatInputRevealer = new Gtk.Revealer({
            visible: true,
            transition_duration: 200
        });
        this._chatInputRevealer.add(this.input_area);
        this._chatInputRevealer.connect('notify::child-revealed', Lang.bind(this, function() {
            if (!this._chatInputRevealer.child_revealed) {
                this.input_area.get_children().forEach(function(child) {
                    child.destroy();
                });
            } else {
                // Scroll the view back down to the bottom once the animation
                // completes. Unforatunately we get a brief moment where
                // the scroll view is in the 'wrong place' but it appears
                // there's not much we can do about this.
                let vadjustment = this._scrollView.vadjustment;
                vadjustment.set_value(vadjustment.upper - vadjustment.page_size);
            }
        }));

        scrollViewBox.add(this._scrollView);
        chatInputBoxWithShadow.pack_start(this._chatInputRevealer, false, false, 0);
        this.pack_start(scrollViewBox, true, true, 0);
        this.pack_start(chatInputBoxWithShadow, false, false, 0);
    },

    showInputArea: function() {
        this._chatInputRevealer.transition_type = Gtk.RevealerTransitionType.SLIDE_UP;
        this._chatInputRevealer.set_reveal_child(true);
    },

    hideInputArea: function() {
        this._chatInputRevealer.transition_type = Gtk.RevealerTransitionType.SLIDE_DOWN;
        this._chatInputRevealer.set_reveal_child(false);
    },

    updateTimestamps: function(callback) {
        this.chat_contents.get_children().forEach(function(group) {
            group.updateMessageReceivedDate();
        });
    },

    scrollToBottomOnUpdate: function() {
        let vadjustment = this._scrollView.vadjustment;
        let notifyId = vadjustment.connect('notify::upper', function() {
            vadjustment.disconnect(notifyId);
            vadjustment.set_value(vadjustment.upper - vadjustment.page_size);
        });
    }
});

// createChatContentsWidget
//
// Create a widget containing contents and an input box for this
// part of the chatbox stack.
function createChatContentsWidget() {
    let chatContents = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        visible: true,
        valign: Gtk.Align.START
    });
    chatContents.get_style_context().add_class('chatbox-chats');

    let messageQueue = new Queue.TriggerableEventQueue(function(item) {
        if (typeof(item) === 'function') {
            item();
        } else {
            // Check to see if there are any groups that will accept
            // this item to start with
            let groups = chatContents.get_children();
            if (!groups.length ||
                !groups[groups.length - 1].addBubble(item.view,
                                                     item.date,
                                                     item.actor)) {
                let newGroup = new MessageGroup({
                    visible: true,
                    expand: true
                });
                newGroup.addBubble(item.view, item.date, item.actor);
                chatContents.pack_start(newGroup, true, true, 15);
            }

            item.view.showContent();
        }
    });

    let chatInputArea = new Gtk.Box({
        visible: true,
        expand: false
    });
    chatInputArea.get_style_context().add_class('chatbox-input-area');

    return new ChatStackChild({
        orientation: Gtk.Orientation.VERTICAL,
        visible: true,
        chat_contents: chatContents,
        input_area: chatInputArea,
        message_queue: messageQueue
    });
}
