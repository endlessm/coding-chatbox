// src/main.js
//
// Copyright (c) 2016 Endless Mobile Inc.
// All Rights Reserved.
//
// This file is the file first run by the entrypoint to the coding-chatbox
// package.
//
pkg.initGettext();
pkg.initFormat();
pkg.require({
    Gdk: '3.0',
    GdkPixbuf: '2.0',
    Gtk: '3.0',
    Gio: '2.0',
    GLib: '2.0',
    GObject: '2.0'
});

const Cairo = imports.cairo;
const Gdk = imports.gi.Gdk;
const GdkPixbuf = imports.gi.GdkPixbuf;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;

const Lang = imports.lang;
const Service = imports.service;
const State = imports.state;
const Views = imports.views;

function initials_from_name(name) {
    return String(name.split().map(function(word) {
        return word[0];
    })).toUpperCase();
}

const CONTACT_IMAGE_SIZE = 48;
const CHAT_WITH_ACTION = 'chat-with';

const Actor = new Lang.Class({
    Name: 'Actor',
    Extends: GObject.Object,
    Properties: {
        'name': GObject.ParamSpec.string('name',
                                         '',
                                         '',
                                         GObject.ParamFlags.READWRITE |
                                         GObject.ParamFlags.CONSTRUCT_ONLY,
                                         ''),
        'image': GObject.ParamSpec.string('image',
                                          '',
                                          '',
                                          GObject.ParamFlags.READWRITE |
                                          GObject.ParamFlags.CONSTRUCT_ONLY,
                                          '')
    },

    _init: function(data) {
        this.parent();

        this.name = data.name;
        this.image = data.img;
    },

    _createActorAvatar: function() {
        if (!this.image)
            return null;

        let resourcePath = '/com/endlessm/Coding/Chatbox/img/' + this.image;
        try {
            return GdkPixbuf.Pixbuf.new_from_resource_at_scale(
                resourcePath, CONTACT_IMAGE_SIZE, CONTACT_IMAGE_SIZE, true);
        } catch(e) {
            logError(e, 'Can\'t load resource at ' + resourcePath);
        }

        return null;
    },

    _createDefaultAvatar: function() {
        // fake a GtkImage
        let parentWidget = new Gtk.Image();

        let surface = new Cairo.ImageSurface(Cairo.Format.ARGB32,
                                             CONTACT_IMAGE_SIZE, CONTACT_IMAGE_SIZE);
        let cr = new Cairo.Context(surface);
        let context = parentWidget.get_style_context();
        context.add_class('contact-default-image');

        Gtk.render_background(context, cr, 0, 0,
                              CONTACT_IMAGE_SIZE, CONTACT_IMAGE_SIZE);
        Gtk.render_frame(context, cr, 0, 0,
                         CONTACT_IMAGE_SIZE, CONTACT_IMAGE_SIZE);

        let text = initials_from_name(this.name);
        let layout = parentWidget.create_pango_layout(text);

        let [text_width, text_height] = layout.get_pixel_size();

        Gtk.render_layout(context, cr,
                          (CONTACT_IMAGE_SIZE - text_width) / 2,
                          (CONTACT_IMAGE_SIZE - text_height) / 2,
                          layout);

        cr.$dispose();
        context.remove_class('contact-default-image');

        return Gdk.pixbuf_get_from_surface(surface, 0, 0,
                                           CONTACT_IMAGE_SIZE, CONTACT_IMAGE_SIZE);
    },

    get avatar() {
        if (this._avatar)
            return this._avatar;

        this._avatar = this._createActorAvatar();
        if (!this._avatar)
            this._avatar = this._createDefaultAvatar();

        return this._avatar;
    }
});

const ActorModel = new Lang.Class({
    Name: 'ActorModel',
    Extends: Gio.ListStore,

    _init: function() {
        this.parent({ item_type: Actor.$gtype });

        let actorsFile = Gio.File.new_for_uri('resource:///com/endlessm/Coding/Chatbox/chatbox-data.json');
        let contents;
        try {
            contents = actorsFile.load_contents(null)[1];
        } catch (e) {
            logError(e, 'Couldn\'t load chatbox data file from data resource');
            return;
        }

        let actorsData = JSON.parse(String(contents)).actor_details;
        actorsData.forEach(Lang.bind(this, function(actorData) {
            let actor = new Actor(actorData);
            this.append(actor);
        }));
    },

    getByName: function(name) {
        for (let idx = 0; idx < this.get_n_items(); idx++) {
            let actor = this.get_item(idx);
            if (actor.name == name)
                return actor;
        }

        return null;
    }
});

const RoundedImage = new Lang.Class({
    Name: 'RoundedImage',
    Extends: Gtk.Image,

    vfunc_draw: function(cr) {
        let width = this.get_allocated_width();
        let height = this.get_allocated_height();

        // Clip drawing to contact circle
        cr.save();
        cr.arc(width / 2, height / 2, width / 2, 0, Math.PI * 2);
        cr.clip();
        cr.newPath();

        this.parent(cr);

        cr.restore();
        cr.$dispose();

        return false;
    }
});

const CodingChatboxContactListItem = new Lang.Class({
    Name: 'CodingChatboxContactListItem',
    Extends: Gtk.ListBoxRow,
    Template: 'resource:///com/endlessm/Coding/Chatbox/contact.ui',
    Children: ['content-grid', 'contact-name-label', 'contact-message-snippit-label', 'contact-message-notification'],
    Properties: {
        'actor': GObject.ParamSpec.object('actor',
                                          '',
                                          '',
                                          GObject.ParamFlags.READWRITE |
                                          GObject.ParamFlags.CONSTRUCT_ONLY,
                                          Actor.$gtype)
    },

    _init: function(params) {
        this.parent(params);

        this.contact_name_label.set_text(this.actor.name);
        this._contact_image_widget = new RoundedImage({
            visible: true,
            margin: 8
        });

        this._contact_image_overlay = new Gtk.Overlay({ visible: true });
        this._contact_image_overlay.add(this._contact_image_widget);

        let frame = new Gtk.Frame({
            visible: true,
            shadow_type: Gtk.ShadowType.NONE
        });
        this._contact_image_overlay.add_overlay(frame);
        frame.get_style_context().add_class('contact-image-overlay');

        this.content_grid.attach_next_to(this._contact_image_overlay, null, Gtk.PositionType.LEFT,
                                         1, 1);
        this._contact_image_widget.pixbuf = this.actor.avatar;
    },

    set snippet(v) {
        this.contact_message_snippit_label.label = v;
    },

    set highlight(v) {
        if (!v) {
            this.contact_message_notification.visible = false;
            this.get_style_context().remove_class('new-content');
            return;
        }

        // If highlight was set, then it means that we were not
        // considered to be visible, so show a highlight here.
        this.contact_message_notification.visible = true;
        this.get_style_context().add_class('new-content');
    },

    get avatar() {
        return this.actor.avatar;
    }
});


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

const CodingChatboxChatBubbleContainer = new Lang.Class({
    Name: 'CodingChatboxChatBubbleContainer',
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
            this.user_image_container.pack_start(new RoundedImage({
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

function calculateMessageReceivedTextFromDate(date) {
    /* Sanity check for clock skew. In this case, we just display
     * "In the future" */
    if (date.getTime() > Date.now()) {
        return "In the future";
    }

    let dateSinceEpoch = new Date(Date.now() - date.getTime());
    let epochDate = new Date(0);

    /* Compare deltas between the dates until we can determine a
     * string to show */
    let yearDelta = dateSinceEpoch.getFullYear() - epochDate.getFullYear();
    if (yearDelta > 0) {
        if (yearDelta === 1) {
            return "Last year";
        }

        return ["About", yearDelta, "years ago"].join(" ");
    }

    let monthDelta = dateSinceEpoch.getMonth() - epochDate.getMonth();
    if (monthDelta > 0) {
        if (monthDelta === 1) {
            return "Last month";
        }

        return ["About", monthDelta, "months ago"].join(" ");
    }

    let dayDelta = dateSinceEpoch.getDate() - epochDate.getDate();
    if (dayDelta > 0) {
        if (dayDelta > 7) {
            let weekDelta = Math.floor(dayDelta / 7);

            if (weekDelta === 1) {
                return "Last week";
            }

            return ["About", weekDelta, "weeks ago"].join(" ");
        }

        if (dayDelta === 1) {
            return "Yesterday";
        }

        return ["About", dayDelta, "days ago"].join(" ");
    }

    let hourDelta = dateSinceEpoch.getHours() - epochDate.getHours();
    if (hourDelta > 0) {
        if (hourDelta === 1) {
            return "About an hour ago";
        }

        return ["About", hourDelta, "hours ago"].join(" ");
    }

    let minutesDelta = dateSinceEpoch.getMinutes() - epochDate.getMinutes();
    if (minutesDelta > 0) {
        if (minutesDelta === 1) {
            return "About a minute ago";
        }

        return ["About", minutesDelta, "minutes ago"].join(" ");
    }

    let secondsDelta = dateSinceEpoch.getSeconds() - epochDate.getSeconds();
    if (secondsDelta > 30) {
        return ["About", secondsDelta, "seconds ago"].join(" ");
    }

    return "Just now";
}

const CodingChatboxMessageGroup = new Lang.Class({
    Name: 'CodingChatboxMessageGroup',
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
        this.message_received_date_label.label = calculateMessageReceivedTextFromDate(date);
    }
});

//
// new_message_view_for_state
//
// Creates a new message view container for a message state container, which
// automatically updates when the underlying state changes.
//
function new_message_view_for_state(container,
                                    actorObj,
                                    styles,
                                    onResponse,
                                    timeout,
                                    onVisible) {
    styles = styles ? styles : [];

    let responseFunc = function(response) {
        if (onResponse)
            onResponse(response, actorObj.name, container.location);
    };

    let view = container.render_view(responseFunc);
    let pending = new Views.MessagePendingView({ visible: true });

    let renderRealContent = function() {
        if (onVisible)
            onVisible();

        /* Update both the content and the styles to reflect that this
         * is now an actual bubble */
        view_container.content = view;
        Views.removeStyles(view_container, ['message-pending']);
        container.connect('message-changed', function() {
            view_container.content = container.render_view(responseFunc);
        });
    };

    let view_container = new CodingChatboxChatBubbleContainer({
        // We only want to display the container if the underlying view
        // itself is visible. The assumption here is that the visibility
        // state never changes between renders.
        visible: view.visible,
        content: pending,
        sender: container.sender,
        expand: true,
        display_image: actorObj.avatar
    }, styles.concat('message-pending'), function() {
        // Re-render the view in case something changes
        if (timeout > 0) {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                             timeout,
                             renderRealContent);
        } else {
            renderRealContent();
        }
    });

    return view_container;
}

const RenderableTextChatboxMessage = new Lang.Class({
    Name: 'RenderableTextChatboxMessage',
    Extends: State.TextChatboxMessage,

    render_view: function() {
        return new Views.TextChatboxMessageView({
            state: this,
            visible: true
        });
    }
});

const RenderableChoiceChatboxMessage = new Lang.Class({
    Name: 'RenderableChoiceChatboxMessage',
    Extends: State.ChoiceChatboxMessage,

    render_view: function(listener) {
        let view = new Views.ChoiceChatboxMessageView({
            state: this,
            visible: true
        });
        view.connect('clicked', Lang.bind(this, function(view, button_id, button_text) {
            listener({
                response: {
                    evaluate: button_id,
                    text: button_text
                },
                amendment: {
                    type: 'scrolled',
                    text: button_text
                }
            });
        }));
        return view;
    }
});

const RenderableInputChatboxMessage = new Lang.Class({
    Name: 'RenderableInputChatboxMessage',
    Extends: State.InputChatboxMessage,

    render_view: function(listener) {
        let view = new Views.InputChatboxMessageView({
            state: this,
            visible: true
        });
        view.connect('activate', Lang.bind(this, function(widget, msg) {
            listener({
                response: {
                    showmehow_id: this.showmehow_id,
                    text: msg
                },
                amendment: {
                    type: 'scrolled',
                    text: msg
                }
            });
        }));
        return view;
    }
});

// contentType
//
// Helper function that returns content type of a GFile.
function contentType(file) {
    let fileInfo = file.query_info('standard::content-type', 0, null, null);
    let type = fileInfo.get_content_type();
    return type;
}

const RenderableAttachmentChatboxMessage = new Lang.Class({
    Name: 'RenderableAttachmentChatboxMessage',
    Extends: State.AttachmentChatboxMessage,

    render_view: function(listener) {
        let view = new Views.AttachmentChatboxMessageView({
            state: this,
            visible: true
        });
        view.connect('clicked', Lang.bind(this, function() {
            let files = [];
            let appInfo = null;

            if (contentType(this.path) == 'application/x-desktop') {
                appInfo = Gio.DesktopAppInfo.new_from_filename(this.path.get_path());
            } else {
                appInfo = this.path.query_default_handler(null);
                files.push(this.path);
            }

            if (appInfo)
                appInfo.launch(files, null);
            else
                log('Couldn\'t find appInfo for ' + this.path.get_path() + ' ' + contentType(this.path));

            listener({
                response: {
                    open_attachment: true
                }
            });
        }));
        return view;
    }
});

const MessageClasses = {
    scrolled: RenderableTextChatboxMessage,
    scroll_wait: RenderableTextChatboxMessage,
    choice: RenderableChoiceChatboxMessage,
    text: RenderableInputChatboxMessage,
    console: RenderableInputChatboxMessage,
    attachment: RenderableAttachmentChatboxMessage
};

const CodingChatboxChatScrollView = new Lang.Class({
    Name: 'CodingChatboxChatScrollView',
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


// This class implements a queue of items which could be passed
// to a consumer progressively according to the needs of the application.
// The first item always gets added straight away, but is pushed to the back
// of the queue. While the queue has items in it, queuing more items will just
// cause them to be added to the queue. Calling the 'showNext' method will
// cause the front of the queue to be popped and the widget at the
// front of the queue to be added to the box.
//
// This class is used by the chatbox view to show pending animations
// for already-received messages and otherwise show messages in the order
// that they were received. When a message is done "showing", it can call
// showNext on the queue to start the animation for the next message.
const TriggerableEventQueue = new Lang.Class({
    Name: 'TriggerableEventQueue',
    Extends: GObject.Object,

    _init: function(itemConsumer) {
        this.parent({});
        this._queue = [];
        this._itemConsumer = itemConsumer;
    },

    showNext: function() {
        this._queue.shift();
        if (this._queue.length) {
            let item = this._queue[0];
            this._itemConsumer(item);
        }
    },

    // push
    //
    // push accepts anything. If it would be the first item on the queue
    // we immediately pass it to the consumer otherwise we keep it on the
    // queue and pass it to the consumer when showNext is called.
    push: function(item) {
        let hadLength = this._queue.length > 0;
        this._queue.push(item);

        if (!hadLength) {
            this._itemConsumer(item);
        }
    }
});

function notificationId(actor) {
    return actor + '-message';
}

const ChatboxStackChild = new Lang.Class({
    Name: 'ChatboxStackChild',
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
                                                  TriggerableEventQueue.$gtype),
        'input-area': GObject.ParamSpec.object('input-area',
                                               '',
                                               '',
                                               GObject.ParamFlags.READWRITE |
                                               GObject.ParamFlags.CONSTRUCT_ONLY,
                                               Gtk.Box)
    },

    _init: function(params) {
        this.parent(params);
        this._scrollView = new CodingChatboxChatScrollView(this.chat_contents);

        this.pack_start(this._scrollView, true, true, 0);
        this.pack_start(this.input_area, false, false, 0);
    },

    scrollToBottomOnUpdate: function() {
        let vadjustment = this._scrollView.vadjustment;
        let notifyId = vadjustment.connect('notify::upper', function() {
            vadjustment.disconnect(notifyId);
            vadjustment.set_value(vadjustment.upper - vadjustment.page_size);
        });
    }
});

// We'll send a reminder after 20 minutes if the user fails to read a message
const MINUTES_TO_SECONDS_SCALE = 60;
const CHATBOX_MESSAGE_REMINDER_NOTIFICATION_SECONDS = 20 * MINUTES_TO_SECONDS_SCALE;

// Update every five minutes
const CHATBOX_MESSAGE_RECEIVED_LABELS_UPDATE_PERIOD_SECONDS = 300;

const CodingChatboxMainWindow = new Lang.Class({
    Name: 'CodingChatboxMainWindow',
    Extends: Gtk.ApplicationWindow,
    Template: 'resource:///com/endlessm/Coding/Chatbox/main.ui',
    Children: ['chatbox-list-box', 'chatbox-stack'],
    Properties: {
        actor_model: GObject.ParamSpec.object('actor-model',
                                              '',
                                              '',
                                              GObject.ParamFlags.READWRITE |
                                              GObject.ParamFlags.CONSTRUCT_ONLY,
                                              ActorModel),
        service: GObject.ParamSpec.object('service',
                                          '',
                                          '',
                                          GObject.ParamFlags.READWRITE |
                                          GObject.ParamFlags.CONSTRUCT_ONLY,
                                          Service.CodingChatboxTextService),
        game_service: GObject.ParamSpec.object('game-service',
                                               '',
                                               '',
                                               GObject.ParamFlags.READWRITE |
                                               GObject.ParamFlags.CONSTRUCT_ONLY,
                                               Service.CodingGameService)
    },

    _init: function(params) {
        // Force the title of the window to be Coding Chatbox here so that it
        // doesn't get overridden as 'Current Page' later.
        params.title = _('ChatBox');
        this.parent(params);

        this._state = new State.CodingChatboxState(MessageClasses);
        this.chatbox_list_box.bind_model(this.actor_model, Lang.bind(this, function(actor) {
            // Ensure we create a content widget for this actor
            this._contentsForActor(actor.name);

            // Get the history for this actor, asynchronously
            this.game_service.chatboxLogForActor(actor.name, Lang.bind(this, function(history) {
                history.filter(function(item) {
                    return item.type.indexOf('chat') == 0;
                }).forEach(Lang.bind(this, function(item) {
                    // We always treat messages obtained through the log as "read"
                    let wrapWidth, spec;

                    switch (item.type) {
                    case 'chat-user':
                    case 'chat-actor':
                        wrapWidth = (item.styles && item.styles.indexOf('code') !== -1) ?
                             Views.CODE_MAX_WIDTH_CHARS :
                             Views.MAX_WIDTH_CHARS;
                        spec = {
                            type: 'scrolled',
                            text: item.message,
                            wrap_width: wrapWidth
                        };
                        this._addItem(spec, actor.name, 'none::none', item.timestamp, item.styles,
                                      item.type === 'chat-actor' ? State.SentBy.ACTOR :
                                                                   State.SentBy.USER,
                                      0, null);
                        this._notifyItem(spec, actor.name, false);
                        break;
                    case 'chat-user-attachment':
                    case 'chat-actor-attachment':
                        spec = {
                            type: 'attachment',
                            attachment: item.attachment
                        };
                        this._addItem(spec, actor.name, item.name, item.timestamp, item.styles,
                                      item.type === 'chat-actor-attachment' ? State.SentBy.ACTOR :
                                                                              State.SentBy.USER,
                                      0, null);
                        this._notifyItem(spec, actor.name, false);
                        break;
                    default:
                        throw new Error('Don\'t know how to handle logged message type ' + item.type);
                    }
                }));

                // Get the very last item in the history and check if it is
                // a user input bubble. If so, display it. Also mark it as
                // unread, unless we're currently on this actor's tab.
                if (history.length &&
                    history[history.length - 1].type == 'input-user' &&
                    history[history.length - 1].input) {
                    let lastMessage = history[history.length - 1];

                    this._replaceUserInput(lastMessage.input,
                                           lastMessage.actor,
                                           lastMessage.styles,
                                           lastMessage.name);
                }
            }));

            let contactListItem = new CodingChatboxContactListItem({
                visible: true,
                actor: actor
            });

            this._state.bindPropertyForActorState(actor.name,
                                                  'unread-messages',
                                                  contactListItem.contact_message_notification,
                                                  'label',
                                                  GObject.BindingFlags.SYNC_CREATE |
                                                  GObject.BindingFlags.DEFAULT,
                                                  function(value) {
                                                      return String(value);
                                                  },
                                                  function(value) {
                                                      let val = Number.parseInt(value);
                                                      return (val ? val : 0);
                                                  });

            return contactListItem;
        }));

        this.chatbox_list_box.connect('row-selected', Lang.bind(this, function(list_box, row) {
            if (!row)
                return;

            this.chatbox_stack.set_visible_child_name(row.actor.name);
            this._markVisibleActorAsRead();
        }));

        this.connect('notify::is-active', Lang.bind(this, this._markVisibleActorAsRead));

        // Add a new timeout which periodically traverses all message groups
        // and updates the message received label
        GLib.timeout_add_seconds(GLib.PRIORITY_LOW, CHATBOX_MESSAGE_RECEIVED_LABELS_UPDATE_PERIOD_SECONDS, Lang.bind(this, function() {
            this.chatbox_stack.get_children().forEach(function(child) {
                child.chat_contents.get_children().forEach(function(group) {
                    group.updateMessageReceivedDate();
                });
            });

            return true;
        }));
    },

    _markVisibleActorAsRead: function() {
        // Sets all the messages on the visible actor as read, by calling
        // focused() on the last view, removing any highlights and withdrawing
        // any notifications.
        //
        // When selecting the row here we'll want to look up the actor name
        // in the model and use that, since a row may not always be
        // 'selected' by the user
        let selectedActor = this.chatbox_stack.get_visible_child_name();

        // Assuming here that this will always succeed, because it is part
        // of the chatbox' invariant that an entry in the list box always has
        // a page on the GtkStack and vice versa.
        let row = this._rowForActor(selectedActor);
        let chatContents = this._contentsForActor(selectedActor).chat_contents;
        let groups = chatContents.get_children();
        if (groups.length) {
            let children = groups[groups.length - 1].chatbox_bubbles.get_children();
            children[children.length - 1].focused();
        }

        row.highlight = false;
        this._state.markAllMessagesByActorAsRead(selectedActor);
        this.application.withdraw_notification(notificationId(selectedActor));
    },

    _actorIsVisible: function(name) {
        return (this.is_active &&
                this.chatbox_stack.get_visible_child_name() === name);
    },

    _contentsForActor: function(actor) {
        let chatboxStackChild = this.chatbox_stack.get_child_by_name(actor);
        if (chatboxStackChild)
            return chatboxStackChild;

        let chatContents = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            visible: true,
            valign: Gtk.Align.CENTER
        });
        chatContents.get_style_context().add_class('chatbox-chats');

        let messageQueue = new TriggerableEventQueue(function(item) {
            if (typeof(item) === 'function') {
                item();
            } else {
                /* Check to see if there are any groups that will accept
                 * this item to start with */
                let groups = chatContents.get_children();
                if (!groups.length ||
                    !groups[groups.length - 1].addBubble(item.view,
                                                         item.date,
                                                         item.actor)) {
                    let newGroup = new CodingChatboxMessageGroup({
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

        chatboxStackChild = new ChatboxStackChild({
            orientation: Gtk.Orientation.VERTICAL,
            visible: true,
            chat_contents: chatContents,
            input_area: chatInputArea,
            message_queue: messageQueue
        });

        this.chatbox_stack.add_named(chatboxStackChild, actor);
        return chatboxStackChild;
    },

    _rowForActor: function(actor) {
        let children = this.chatbox_list_box.get_children();
        for (let row of children) {
            if (row.actor.name == actor)
                return row;
        }

        return null;
    },

    _addItem: function(item, actor, location, timestamp, style, sentBy, pendingTime, visibleAction) {
        let messageQueue = this._contentsForActor(actor).message_queue;

        // Scroll view to the bottom after the child is added. We only
        // connect to the signal for this one item, to avoid jumping to the
        // bottom of the view when 'upper' is notified for other reasons.
        let chatView = this.chatbox_stack.get_child_by_name(actor);
        chatView.scrollToBottomOnUpdate();

        // If we can amend the last message, great.
        // Though I'm not really sure if we want this. "amend" currently
        // means 'amend-or-replace'.
        let [amended, container] = this._state.amend_last_message_for_actor(actor,
                                                                            sentBy,
                                                                            item);

        if (amended)
            return container;

        let messageBecameVisibleHandler = Lang.bind(this, function() {
            // If actorIsVisible is false here, then we should listen for
            // notifications to show an unread-notification on this actor in a
            // given time period.
            let showReminder = Lang.bind(this, function() {
                let row = this._rowForActor(actor);
                if (!row)
                    throw new Error('Couldn\'t find row matching actor ' + actor);

                // TODO: Translations
                this.application.showNotification('Waiting on your input',
                                                  actor + ' is still waiting on your response!',
                                                  row.avatar,
                                                  actor);
            });


            if (!this._actorIsVisible(actor)) {
                this._state.mesageBecameVisibleAndNotRead(actor,
                                                          CHATBOX_MESSAGE_REMINDER_NOTIFICATION_SECONDS,
                                                          showReminder);
            }

            // Listen for any new changes to the scroll state and scroll
            // to the bottom
            chatView.scrollToBottomOnUpdate();

            if (visibleAction)
                visibleAction();
            messageQueue.showNext();
        });

        container = this._state.add_message_for_actor(actor,
                                                      sentBy,
                                                      item,
                                                      location);
        messageQueue.push({
            view: new_message_view_for_state(container,
                                             this.actor_model.getByName(actor),
                                             style,
                                             Lang.bind(this, this._handleResponse, style),
                                             pendingTime,
                                             messageBecameVisibleHandler),
            date: new Date(timestamp),
            actor: sentBy == State.SentBy.USER ? 'user' : actor
        });

        return container;
    },

    _replaceUserInput: function(item, actor, style, location) {
        let stackChild = this._contentsForActor(actor);
        let messageQueue = stackChild.message_queue;
        let inputArea = stackChild.input_area;

        // Here we push a function to messageQueue which gets called when
        // it becomes the first item on the queue. When it is called, we
        // replace the currently active user input and then show the next
        // message.
        //
        // Doing it this way ensures that the input is always shown after
        // the last message was shown.
        messageQueue.push(Lang.bind(this, function() {
            let container = this._state.replaceUserInputWithForActor(actor, item, location);
            inputArea.get_children().forEach(function(child) {
                child.destroy();
            });

            let view_container = new_message_view_for_state(container,
                                                            this.actor_model.getByName(actor),
                                                            style,
                                                            Lang.bind(this, this._handleResponse, style),
                                                            0,
                                                            null);
            view_container.showContent();
            view_container.margin = 10;
            inputArea.pack_end(view_container, true, true, 0);
            stackChild.scrollToBottomOnUpdate();
            messageQueue.showNext();
        }));
        return inputArea;
    },

    // style is the first argument here since it needs to be passed
    // in by _replaceUserInput and _addItem so that we know
    // what style of bubble to create later if we need to create any.
    _handleResponse: function(response, actor, location, style) {
        style = style ? style : [];

        if (response.showmehow_id) {
            // We evaluate the text of the response here in order to get an 'evaluated'
            // piece of text to send back to the game service.
            this.service.evaluate(response.showmehow_id, response.text, Lang.bind(this, function(evaluated) {
                this.game_service.respond_to_message(location, response.text, evaluated);
            }));

            this.chatMessage(actor,
                             response.text,
                             location,
                             (new Date()).toString(),
                             style,
                             State.SentBy.USER,
                             0);
            this.hideUserInput(actor);
        } else if (response.external_event_id) {
            // Notify that this external event has been triggered
            this.game_service.callExternalEvent(response.external_event_id);
        } else if (response.open_attachment) {
            // Notify that this external event has been triggered
            this.game_service.openAttachment(location);
        } else if (response.evaluate) {
            // Nothing to evaluate, just send back the pre-determined evaluated response
            this.game_service.respond_to_message(location, response.text, response.evaluate);
            this.chatMessage(actor,
                             response.text,
                             location,
                             (new Date()).toString(),
                             style,
                             State.SentBy.USER,
                             0);
            this.hideUserInput(actor);
        }
    },

    _notifyItem: function(item, actor, isNew) {
        let body, title;

        let row = this._rowForActor(actor);
        if (!row)
            throw new Error('Couldn\'t find row matching actor ' + actor);

        // TODO: make these translatable
        if (item.type === 'scrolled') {
            title = 'Message from ' + actor;
            body = Views.stripMarkup(item.text);
        } else if (item.type === 'attachment') {
            title = 'Attachment from ' + actor;
            body = Views.stripMarkup(item.attachment.desc);
        } else {
            return;
        }

        // Strip newlines from body to work around
        // https://bugzilla.gnome.org/show_bug.cgi?id=776645
        let stripped = body.split('\n').join(' ');
        row.snippet = stripped;

        if (isNew) {
            this.application.showNotification(title, stripped, row.avatar, actor);
            row.highlight = true;
        }
    },

    chatMessage: function(actor, message, location, timestamp, style, sentBy, pendingTime) {
        let wrapWidth = style.indexOf('code') !== -1 ? Views.CODE_MAX_WIDTH_CHARS :
                                                       Views.MAX_WIDTH_CHARS;
        let item = {
            type: 'scrolled',
            text: message,
            wrap_width: wrapWidth
        };
        this._addItem(item,
                      actor,
                      location,
                      timestamp,
                      style,
                      sentBy,
                      pendingTime,
                      Lang.bind(this, function() {
                          this._notifyItem(item, actor, !this._actorIsVisible(actor));
                      }));
    },

    chatAttachment: function(actor, attachment, location, timestamp, style, pendingTime) {
        let item = {
            type: 'attachment',
            attachment: attachment
        };
        this._addItem(item,
                      actor,
                      location,
                      timestamp,
                      style,
                      State.SentBy.ACTOR,
                      pendingTime,
                      Lang.bind(this, function() {
                          this._notifyItem(item, actor, !this._actorIsVisible(actor));
                      }));
    },

    chatUserInput: function(actor, spec, location, style, pendingTime) {
        this._replaceUserInput(spec, actor, style, location);
    },

    hideUserInput: function(actor) {
        let userInputArea = this._contentsForActor(actor).input_area;
        userInputArea.get_children().forEach(function(child) {
            child.destroy();
        });
    },

    switchToChatWith: function(actor) {
        let row = this._rowForActor(actor);
        if (row)
            this.chatbox_list_box.select_row(row);
    }
});

function load_style_sheet(resourcePath) {
    let provider = new Gtk.CssProvider();
    provider.load_from_resource(resourcePath);
    Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(),
                                             provider,
                                             Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
}

// determineWaitTimeForEvent
//
// Examines event and determine how long we should wait before
// running it. This is to make the chatbox interface a little more
// realistic.
function determineMessagePendingTime(type, content) {
    switch (type) {
        case 'chat-actor':
            // Simple message. Assume that the average person
            // types at 200 character per minute - 3 characters
            // per second and thus 300 milliseconds per character.
            // We then divide by 2.5 to make things a little quicker.
            //
            // This is capped at 1500 to make sure we're not waiting
            // too long.
            return Math.min(content.length * 120, 1500);
        case 'chat-actor-attachment':
            // Attachment. Fixed 1.5 second delay + character length
            // of description
            return 1500 + Math.min(content.desc.length * 60,
                                   500);
        case 'input-user':
            // User input. Fixed 1 second delay
            return 1000;
        default:
            return 0;
    }
}


const CodingChatboxApplication = new Lang.Class({
    Name: 'CodingChatboxApplication',
    Extends: Gtk.Application,

    _init: function() {
        this._mainWindow = null;

        this.parent({ application_id: pkg.name });
        GLib.set_application_name(_("ChatBox"));

        let chatWithAction = new Gio.SimpleAction({ name: CHAT_WITH_ACTION,
                                                    parameter_type: new GLib.VariantType('s') });
        chatWithAction.connect('activate', Lang.bind(this, function(action, parameter) {
            this.activate();

            let actor = parameter.unpack();
            this._mainWindow.switchToChatWith(actor);
        }));
        this.add_action(chatWithAction);
    },

    vfunc_startup: function() {
        this.parent();

        Gtk.Settings.get_default().gtk_application_prefer_dark_theme = true;
        load_style_sheet('/com/endlessm/Coding/Chatbox/application.css');

        this._service = new Service.CodingChatboxTextService();
        this._gameService = new Service.CodingGameService();
        this._actorModel = new ActorModel();
    },

    vfunc_activate: function() {
        if (!this._mainWindow)
            this._mainWindow = new CodingChatboxMainWindow({ application: this,
                                                             actor_model: this._actorModel,
                                                             service: this._service,
                                                             game_service: this._gameService });

        this._mainWindow.present();
    },

    vfunc_dbus_register: function(conn, object_path) {
        this.parent(conn, object_path);
        this._skeleton = new Service.ChatboxReceiverService();
        this._skeleton.export(conn, object_path);

        this._skeleton.connect('chat-message', Lang.bind(this, function(service, actor, message, location, timestamp, styles) {
            if (this._mainWindow) {
                this._mainWindow.chatMessage(actor,
                                             message,
                                             location,
                                             timestamp,
                                             styles,
                                             State.SentBy.ACTOR,
                                             determineMessagePendingTime('chat-actor', message));
            } else {
                let title = 'Message from ' + actor;
                let actorObj = this._actorModel.getByName(actor);
                this.showNotification(title, Views.stripMarkup(message), actorObj.avatar, actor);
            }
        }));

        this._skeleton.connect('chat-attachment', Lang.bind(this, function(service, actor, attachment, location, timestamp, styles) {
            if (this._mainWindow) {
                this._mainWindow.chatAttachment(actor,
                                                attachment,
                                                location,
                                                timestamp,
                                                styles,
                                                determineMessagePendingTime('chat-actor-attachment', attachment));
            } else {
                let title = 'Attachment from ' + actor;
                let actorObj = this._actorModel.getByName(actor);
                this.showNotification(title, Views.stripMarkup(attachment.desc), actorObj.avatar, actor);
            }
        }));

        this._skeleton.connect('user-input-bubble', Lang.bind(this, function(service, actor, spec, location, styles) {
            if (this._mainWindow)
                this._mainWindow.chatUserInput(actor, spec, location, styles, 1);
        }));

        return true;
    },

    vfunc_dbus_unregister: function(conn, object_path) {
        if (this._skeleton && this._skeleton.has_connection(conn)) {
            this._skeleton.unexport();
        }

        this.parent(conn, object_path);
    },

    showNotification: function(title, body, icon, actor) {
        let notification = new Gio.Notification();
        notification.set_title(title);
        notification.set_body(body);
        if (icon)
            notification.set_icon(icon);
        notification.set_default_action_and_target('app.' + CHAT_WITH_ACTION, new GLib.Variant('s', actor));
        this.send_notification(notificationId(actor), notification);
    }
});

function main(argv) { // eslint-disable-line no-unused-vars
    return (new CodingChatboxApplication()).run(argv);
}
