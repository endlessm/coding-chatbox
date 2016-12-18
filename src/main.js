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
    GObject: '2.0',
    Pango: '1.0',
    PangoCairo: '1.0'
});

const Cairo = imports.cairo;
const Gdk = imports.gi.Gdk;
const GdkPixbuf = imports.gi.GdkPixbuf;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Pango = imports.gi.Pango;
const PangoCairo = imports.gi.PangoCairo;

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
    Children: ['content-grid', 'contact-name-label', 'contact-message-snippit-label'],
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
        this._contact_image_pixbuf = null;
        this._contact_image_widget = new RoundedImage({ visible: true,
                                                        margin: 8 });

        this._contact_image_overlay = new Gtk.Overlay({ visible: true });
        this._contact_image_overlay.add(this._contact_image_widget);

        let frame = new Gtk.Frame({ visible: true,
                                    shadow_type: Gtk.ShadowType.NONE });
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
            this.get_style_context().remove_class('new-content');
            return;
        }

        // If highlight was set, then it means that we were not
        // considered to be visible, so show a highlight here.
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
    Children: ['inner-box', 'event-box'],
    Properties: {
        'content': GObject.ParamSpec.object('content',
                                            '',
                                            '',
                                            GObject.ParamFlags.READWRITE,
                                            Gtk.Widget),
        'by-user': GObject.ParamSpec.boolean('by-user',
                                             '',
                                             '',
                                             GObject.ParamFlags.READWRITE |
                                             GObject.ParamFlags.CONSTRUCT_ONLY,
                                             false)
    },

    _init: function(params, styles, showContentHandler) {
        this.parent(params);

        Views.applyStyles(this, styles);
        this._popover = createCopyPopover(this, Lang.bind(this, function() {
            this.content.copyToClipboard();
            this._popover.hide();
        }));

        let [margin_prop, halign] = params.by_user ? ['margin-end', Gtk.Align.END] :
                                                     ['margin-start', Gtk.Align.START];

        this[margin_prop] = 10;
        this.halign = halign;

        if (this.by_user)
            this.get_style_context().add_class('by-user');

        this.inner_box.pack_start(this.content, false, false, 0);
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
        this.inner_box.pack_start(this._content, false, false, 0);
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


//
// new_message_view_for_state
//
// Creates a new message view container for a message state container, which
// automatically updates when the underlying state changes.
//
function new_message_view_for_state(container,
                                    content_service,
                                    game_service,
                                    actor,
                                    styles,
                                    timeout,
                                    onVisible) {
    let responseFunc = function(response) {
        if (response.showmehow_id) {
            // We evaluate the text of the response here in order to get an 'evaluated'
            // piece of text to send back to the game service.
            content_service.evaluate(response.showmehow_id, response.text, function(evaluated) {
                game_service.respond_to_message(container.location, response.text, evaluated);
            });
        } else if (response.external_event_id) {
            // Notify that this external event has been triggered
            game_service.callExternalEvent(response.external_event_id);
        } else if (response.open_attachment) {
            // Notify that this external event has been triggered
            game_service.openAttachment(container.location);
        } else if (response.evaluate) {
            // Nothing to evaluate, just send back the pre-determined evaluated response
            game_service.respond_to_message(container.location, response.text, response.evaluate);
        }
    };

    let view = container.render_view(responseFunc);
    let pending = new Views.MessagePendingView({ visible: true });

    let renderRealContent = function() {
        onVisible();
        view_container.content = view;
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
        by_user: (container.sender == State.SentBy.USER)
    }, styles, function() {
        // Re-render the view in case something changes
        if (timeout > 0) {
            GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,
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
        view.connect('activate', Lang.bind(this, function(view) {
            let msg = view.text;
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
        this.parent({ visible: true,
                      width_request: 500,
                      max_content_width: 750 });

        this.chatContents = chatContents;
        this.add(chatContents);
    }
});

// This class implements a queue of widgets which could be addd
// to the box progressively. The first item always gets added
// straight away, but is pushed to the back of the queue. While
// the queue has items in it, queuing more items will just cause
// them to be added to the queue. Calling the 'showNext' method will
// cause the front of the queue to be popped and the widget at the
// front of the queue to be added to the box.
//
// Once a widget is displayed, the showContent handler will be called
// on the widget so that it can display any animations necessary to
// show its contents.
const QueueableBox = new Lang.Class({
    Name: 'QueueableBox',
    Extends: Gtk.Box,

    _init: function(params) {
        this.parent(params);
        this._queue = [];
    },

    pushWidget: function(widget) {
        let hadLength = this._queue.length > 0;
        this._queue.push(widget);

        if (!hadLength) {
            this.pack_start(widget, false, false, 0);
            widget.showContent();
        }
    },

    showNext: function(widget) {
        this._queue.shift();
        if (this._queue.length) {
            this.pack_start(this._queue[0], false, false, 0);
            this._queue[0].showContent();
        }
    }
});

function notificationId(actor) {
    return actor + '-message';
}

// We'll send a reminder after 20 minutes if the user fails to read a message
const MINUTES_TO_SECONDS_SCALE = 60;
const CHATBOX_MESSAGE_REMINDER_NOTIFICATION_SECONDS = 20 * MINUTES_TO_SECONDS_SCALE;

const CodingChatboxMainWindow = new Lang.Class({
    Name: 'CodingChatboxMainWindow',
    Extends: Gtk.ApplicationWindow,
    Template: 'resource:///com/endlessm/Coding/Chatbox/main.ui',
    Children: ['chatbox-list-box', 'chatbox-stack', 'main-header'],
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
                    switch (item.type) {
                    case 'chat-user':
                    case 'chat-actor':
                        let wrapWidth = (item.styles && item.styles.indexOf('code') !== -1) ?
                            Views.CODE_MAX_WIDTH_CHARS :
                            Views.MAX_WIDTH_CHARS;
                        let spec = { type: 'scrolled',
                                     text: item.message,
                                     wrap_width: wrapWidth };
                        this._addItem(spec, actor.name, 'none::none', item.styles,
                                      item.type === 'chat-actor' ? State.SentBy.ACTOR :
                                                                   State.SentBy.USER,
                                      0, null);
                        this._notifyItem(spec, actor.name, false);
                        break;
                    case 'chat-user-attachment':
                    case 'chat-actor-attachment':
                        spec = { type: 'attachment',
                                 attachment: item.attachment };
                        this._addItem(spec, actor.name, item.name, item.styles,
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

                    this._addItem(lastMessage.input,
                                  lastMessage.actor,
                                  lastMessage.name,
                                  lastMessage.styles,
                                  !this._actorIsVisible(actor.name),
                                  State.SentBy.USER,
                                  0,
                                  null);
                }
            }));

            return new CodingChatboxContactListItem({
                visible: true,
                actor: actor
            });
        }));

        this.chatbox_list_box.connect('row-selected', Lang.bind(this, function(list_box, row) {
            if (!row)
                return;

            this.chatbox_stack.set_visible_child_name(row.actor.name);
            this._markVisibleActorAsRead();
        }));

        this.connect('notify::is-active', Lang.bind(this, this._markVisibleActorAsRead));
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
        let chatContents = this._contentsForActor(selectedActor);
        let children = chatContents.get_children();
        if (children.length)
            children[children.length - 1].focused();

        row.highlight = false;
        this._state.markAllMessagesByActorAsRead(selectedActor);
        this.application.withdraw_notification(notificationId(selectedActor));
    },

    _actorIsVisible: function(name) {
        return (this.is_active &&
                this.chatbox_stack.get_visible_child_name() === name);
    },

    _contentsForActor: function(actor) {
        let scrollView = this.chatbox_stack.get_child_by_name(actor);
        if (scrollView)
            return scrollView.chatContents;

        let chatContents = new QueueableBox({
            orientation: Gtk.Orientation.VERTICAL,
            visible: true,
        });
        chatContents.get_style_context().add_class('chatbox-chats');

        scrollView = new CodingChatboxChatScrollView(chatContents);
        this.chatbox_stack.add_named(scrollView, actor);

        return chatContents;
    },

    _rowForActor: function(actor) {
        let children = this.chatbox_list_box.get_children();
        for (let row of children) {
            if (row.actor.name == actor)
                return row;
        }

        return null;
    },

    _addItem: function(item, actor, location, style, sentBy, pendingTime, visibleAction) {
        let chatContents = this._contentsForActor(actor);

        // Scroll view to the bottom after the child is added. We only
        // connect to the signal for this one item, to avoid jumping to the
        // bottom of the view when 'upper' is notified for other reasons.
        let scrollView = this.chatbox_stack.get_child_by_name(actor);
        let vadjustment = scrollView.vadjustment;
        let notifyId = vadjustment.connect('notify::upper', function() {
            vadjustment.disconnect(notifyId);
            vadjustment.set_value(vadjustment.upper - vadjustment.page_size);
        });

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
            if (!this._actorIsVisible(actor)) {
                this._state.performActionIfStillUnreadAfter(actor,
                                                            CHATBOX_MESSAGE_REMINDER_NOTIFICATION_SECONDS,
                                                            Lang.bind(this, function() {
                    let row = this._rowForActor(actor);
                    if (!row)
                        throw new Error('Couldn\'t find row matching actor ' + actor);

                    // TODO: Translations
                    this.application.showNotification('Waiting on your input',
                                                      actor + ' is still waiting on your response!',
                                                      row.avatar,
                                                      actor);
                }));
            }
            if (visibleAction)
                visibleAction();
            chatContents.showNext();
        });

        container = this._state.add_message_for_actor(actor,
                                                      sentBy,
                                                      item,
                                                      location);
        chatContents.pushWidget(new_message_view_for_state(container,
                                                           this.service,
                                                           this.game_service,
                                                           actor,
                                                           style,
                                                           pendingTime,
                                                           messageBecameVisibleHandler));

        return container;
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

    chatMessage: function(actor, message, location, style, pendingTime) {
        let wrapWidth = style.indexOf('code') !== -1 ? Views.CODE_MAX_WIDTH_CHARS :
                                                       Views.MAX_WIDTH_CHARS;
        let item = { type: 'scrolled',
                     text: message,
                     wrap_width: wrapWidth };
        this._addItem(item,
                      actor,
                      location,
                      style,
                      State.SentBy.ACTOR,
                      pendingTime,
                      Lang.bind(this, function() {
                          this._notifyItem(item, actor, !this._actorIsVisible(actor));
                      }));
    },

    chatAttachment: function(actor, attachment, location, style, pendingTime) {
        let item = { type: 'attachment',
                     attachment: attachment };
        this._addItem(item,
                      actor,
                      location,
                      style,
                      State.SentBy.ACTOR,
                      pendingTime,
                      Lang.bind(this, function() {
                          this._notifyItem(item, actor, !this._actorIsVisible(actor));
                      }));
    },

    chatUserInput: function(actor, spec, location, style, pendingTime) {
        this._addItem(spec,
                      actor,
                      location,
                      style,
                      State.SentBy.USER,
                      pendingTime,
                      Lang.bind(this, function() {
                          this._notifyItem(spec, actor, !this._actorIsVisible(actor));
                      }));
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

        this._skeleton.connect('chat-message', Lang.bind(this, function(service, actor, message, location, styles) {
            if (this._mainWindow) {
                this._mainWindow.chatMessage(actor, message, location, styles, 2);
            } else {
                let title = 'Message from ' + actor;
                let actorObj = this._actorModel.getByName(actor);
                this.showNotification(title, Views.stripMarkup(message), actorObj.avatar, actor);
            }
        }));

        this._skeleton.connect('chat-attachment', Lang.bind(this, function(service, actor, attachment, location, styles) {
            if (this._mainWindow) {
                this._mainWindow.chatAttachment(actor, attachment, location, styles, 3);
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
