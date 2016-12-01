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
        'contact-name': GObject.ParamSpec.string('contact-name',
                                                 '',
                                                 '',
                                                 GObject.ParamFlags.READWRITE |
                                                 GObject.ParamFlags.CONSTRUCT_ONLY,
                                                 ''),
        'contact-image': GObject.ParamSpec.string('contact-image',
                                                  '',
                                                  '',
                                                  GObject.ParamFlags.READWRITE |
                                                  GObject.ParamFlags.CONSTRUCT_ONLY,
                                                  '')
    },

    _init: function(params) {
        this.parent(params);

        this.contact_name_label.set_text(params.contact_name);
        this._contact_image_pixbuf = null;
        this._contact_image_widget = new RoundedImage({ visible: true,
                                                        margin: 8 });
        this._contact_image_widget.get_style_context().add_class('contact-image');
        this.content_grid.attach_next_to(this._contact_image_widget, null, Gtk.PositionType.LEFT,
                                         1, 1);

        let useContactImage = this.contact_image;
        if (useContactImage) {
            let resourcePath = '/com/endlessm/Coding/Chatbox/img/' + this.contact_image;
            try {
                this._contact_image_pixbuf = GdkPixbuf.Pixbuf.new_from_resource_at_scale(
                    resourcePath, CONTACT_IMAGE_SIZE, CONTACT_IMAGE_SIZE, true);
            } catch(e) {
                logError(e, 'Can\'t load resource at ' + resourcePath);
                useContactImage = false;
            }
        }

        if (!useContactImage) {
            let surface = new Cairo.ImageSurface(Cairo.Format.ARGB32,
                                                 CONTACT_IMAGE_SIZE, CONTACT_IMAGE_SIZE);
            let cr = new Cairo.Context(surface);
            cr.setSourceRGBA(0.74, 0.74, 0.74, 1.0);
            cr.paint();

            let text = initials_from_name(params.contact_name);
            let layout = this._contact_image_widget.create_pango_layout(text);
            let [text_width, text_height] = layout.get_pixel_size();

            let context = this._contact_image_widget.get_style_context();
            Gtk.render_layout(context, cr,
                              (CONTACT_IMAGE_SIZE - text_width) / 2,
                              (CONTACT_IMAGE_SIZE - text_height) / 2,
                              layout);

            cr.$dispose();

            this._contact_image_pixbuf = Gdk.pixbuf_get_from_surface(surface, 0, 0,
                                                                     CONTACT_IMAGE_SIZE, CONTACT_IMAGE_SIZE);
        }
        this._contact_image_widget.pixbuf = this._contact_image_pixbuf;
    },

    get avatar() {
        return this._contact_image_pixbuf;
    }
});

const CodingChatboxChatBubbleContainer = new Lang.Class({
    Name: 'CodingChatboxChatBubbleContainer',
    Extends: Gtk.Box,
    Template: 'resource:///com/endlessm/Coding/Chatbox/chat-bubble-container.ui',
    Children: ['inner-box', 'bubble-box'],
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

    _init: function(params) {
        this.parent(params);

        let [margin_prop, halign] = params.by_user ? ['margin-right', Gtk.Align.END] :
                                                     ['margin-left', Gtk.Align.START];

        this[margin_prop] = 10;
        this.halign = halign;

        if (this.by_user)
            this.bubble_box.get_style_context().add_class('by-user');

        this.inner_box.pack_start(this.content, false, false, 0);
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
    }
});


//
// new_message_view_for_state
//
// Creates a new message view container for a message state container, which
// automatically updates when the underlying state changes.
//
function new_message_view_for_state(container, content_service, game_service, actor) {
    let responseFunc = function(response) {
        if (response.showmehow_id) {
            // We evaluate the text of the response here in order to get an 'evaluated'
            // piece of text to send back to the game service.
            content_service.evaluate(response.showmehow_id, response.text, function(evaluated) {
                game_service.respond_to_message(container.location, response.text, evaluated);
            });
        } else {
            // Nothing to evaluate, just send back the pre-determined evaluated response
            game_service.respond_to_message(container.location, response.text, response.evaluate);
        }
    };

    let view = container.render_view(responseFunc);
    let view_container = new CodingChatboxChatBubbleContainer({
        // We only want to display the container if the underlying view
        // itself is visible. The assumption here is that the visibility
        // state never changes between renders.
        visible: view.visible,
        content: view,
        by_user: (container.sender == State.SentBy.USER)
    });

    // Re-render the view in case something changes
    container.connect('message-changed', function() {
        view_container.content = container.render_view(responseFunc);
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
        view.connect('activate', Lang.bind(this, function(view, msg) {
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

const RenderableExternalEventsChatboxMessage = new Lang.Class({
    Name: 'RenderableExternalEventsChatboxMessage',
    Extends: State.CodingChatboxMessageBase,

    render_view: function(listener) {
        let view = new Views.ExternalEventsChatboxMessageView();
        view.connect('check-events', Lang.bind(this, function() {
            listener({
                response: {
                    evaluate: '',
                    text: ''
                },
                amendment: null
            });
        }));
        return view;
    }
});

const RenderableAttachmentChatboxMessage = new Lang.Class({
    Name: 'RenderableAttachmentChatboxMessage',
    Extends: State.AttachmentChatboxMessage,

    render_view: function(listener) {
        let view = new Views.AttachmentChatboxMessageView({
            state: this,
            visible: true
        });
        view.connect('clicked', Lang.bind(this, function() {
            let handler = this.path.query_default_handler(null);
            handler.launch([this.path], null);
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
    external_events: RenderableExternalEventsChatboxMessage,
    attachment: RenderableAttachmentChatboxMessage
};

function notificationId(actor) {
    return actor + '-message';
}

const CodingChatboxMainWindow = new Lang.Class({
    Name: 'CodingChatboxMainWindow',
    Extends: Gtk.ApplicationWindow,
    Template: 'resource:///com/endlessm/Coding/Chatbox/main.ui',
    Children: ['chatbox-list-box', 'chatbox-stack', 'main-header'],
    Properties: {
        service: GObject.ParamSpec.object('service',
                                          '',
                                          '',
                                          GObject.ParamFlags.READWRITE |
                                          GObject.ParamFlags.CONSTRUCT_ONLY,
                                          Service.CodingChatboxTextService),
        chatbox_service: GObject.ParamSpec.object('chatbox-service',
                                                  '',
                                                  '',
                                                  GObject.ParamFlags.READWRITE |
                                                  GObject.ParamFlags.CONSTRUCT_ONLY,
                                                  Service.ChatboxReceiverService),
        game_service: GObject.ParamSpec.object('game-service',
                                               '',
                                               '',
                                               GObject.ParamFlags.READWRITE |
                                               GObject.ParamFlags.CONSTRUCT_ONLY,
                                               Service.CodingGameService)
    },

    _init: function(params) {
        params.title = '';
        this.parent(params);

        this._state = new State.CodingChatboxState(MessageClasses);

        let add_new_bubble = Lang.bind(this, function(item, actor, location, chat_contents, sent_by) {
            // If we can amend the last message, great.
            // Though I'm not really sure if we want this. "amend" currently
            // means 'amend-or-replace'.
            if (item.type === 'scrolled' &&
                this._state.amend_last_message_for_actor(actor,
                                                         sent_by,
                                                         item)) {
                return;
            }

            let container = this._state.add_message_for_actor(actor,
                                                              sent_by,
                                                              item,
                                                              location);
            chat_contents.pack_start(new_message_view_for_state(container,
                                                                this.service,
                                                                this.game_service,
                                                                actor),
                                     false, false, 10);
        });

        let actorsFile = Gio.File.new_for_uri('resource:///com/endlessm/Coding/Chatbox/chatbox-data.json');
        actorsFile.load_contents_async(null, Lang.bind(this, function(file, result) {
            let contents;
            try {
                contents = file.load_contents_finish(result)[1];
            } catch (e) {
                logError(e, 'Couldn\'t load chatbox data file from data resource');
                return;
            }

            let actors = JSON.parse(String(contents)).actor_details;
            actors.forEach(Lang.bind(this, function(actor) {
                let contact_row = new CodingChatboxContactListItem({
                    visible: true,
                    contact_name: actor.name,
                    contact_image: actor.img
                });
                let chat_contents = new Gtk.Box({
                    orientation: Gtk.Orientation.VERTICAL,
                    visible: true,
                });
                chat_contents.get_style_context().add_class('chatbox-chats');

                // Get the history for this actor, asynchronously
                this.game_service.chatboxLogForActor(actor.name, function(history) {
                    history.filter(function(item) {
                        return item.type.indexOf('chat') == 0;
                    }).forEach(function(item) {
                        switch (item.type) {
                            case 'chat-user':
                            case 'chat-actor':
                                add_new_bubble({ type: 'scrolled', text: item.message },
                                               actor.name,
                                               'none::none',
                                               chat_contents,
                                               item.type === 'chat-actor' ? State.SentBy.ACTOR :
                                                                            State.SentBy.USER);
                                break;
                            case 'chat-user-attachment':
                            case 'chat-actor-attachment':
                                add_new_bubble({ type: 'attachment', attachment: item.attachment },
                                               actor.name,
                                               item.name,
                                               chat_contents,
                                               item.type === 'chat-actor-attachment' ? State.SentBy.ACTOR :
                                                                                       State.SentBy.USER);
                                break;
                            default:
                                throw new Error('Don\'t know how to handle logged message type ' + item.type);
                        }
                    });

                    // Get the very last item in the history and check if it is
                    // a user input bubble. If so, display it.
                    if (history.length &&
                        history[history.length - 1].type == 'input-user' &&
                        history[history.length - 1].input) {
                        let lastMessage = history[history.length - 1];
                        add_new_bubble(lastMessage.input,
                                       lastMessage.actor,
                                       lastMessage.name,
                                       chat_contents,
                                       State.SentBy.USER);
                    }
                });

                this.chatbox_list_box.add(contact_row);
                this.chatbox_stack.add_named(chat_contents, actor.name);
            }));

            this.chatbox_list_box.select_row(this.chatbox_list_box.get_row_at_index(0));
        }));

        this.chatbox_service.connect('chat-message', Lang.bind(this, function(service, actor, message, location) {
            let chat_contents = this.chatbox_stack.get_child_by_name(actor);
            add_new_bubble({ type: 'scrolled', text: message },
                           actor,
                           location,
                           chat_contents,
                           State.SentBy.ACTOR);
            this._showNotification('Message from ' + actor, message, actor);
        }));

        this.chatbox_service.connect('chat-attachment', Lang.bind(this, function(service, actor, spec, location) {
            let chat_contents = this.chatbox_stack.get_child_by_name(actor);
            add_new_bubble({ type: 'attachment', attachment: spec.attachment },
                           actor,
                           location,
                           chat_contents,
                           State.SentBy.ACTOR);
            this._showNotification('Attachment from ' + actor, spec.attachment.desc, actor);
        }));

        this.chatbox_service.connect('user-input-bubble', Lang.bind(this, function(service, actor, spec, location) {
            // Doesn't make sense to append a new bubble, so just
            // create a new one now
            let chat_contents = this.chatbox_stack.get_child_by_name(actor);
            add_new_bubble(spec,
                           actor,
                           location,
                           chat_contents,
                           State.SentBy.USER);
        }));

        this.chatbox_list_box.connect('row-selected', Lang.bind(this, function(list_box, row) {
            if (!row)
                return;

            this.chatbox_stack.set_visible_child_name(row.contact_name);
            let children = this.chatbox_stack.get_visible_child().get_children();
            if (children.length) {
                children[children.length - 1].focused();
            }
            this.application.withdraw_notification(notificationId(row.contact_name));
        }));
    },

    _showNotification: function(title, body, actor) {
        if (!this.is_active) {
            let row = this._actorRow(actor);
            let notification = new Gio.Notification();
            // TODO: make it translatable
            notification.set_title(title);
            notification.set_body(message);
            if (row)
                notification.set_icon(row.avatar);
            notification.set_default_action_and_target('app.' + CHAT_WITH_ACTION, new GLib.Variant('s', actor));
            this.application.send_notification(notificationId(actor), notification);
        }
    },

    _actorRow: function(actor) {
        let children = this.chatbox_list_box.get_children();
        for (let index in children) {
            let row = children[index];
            if (row.contact_name == actor)
                return row;
        }
        return null;
    },

    switchToChatWith: function(actor) {
        let row = this._actorRow(actor);
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
        GLib.set_application_name(_("Coding Chatbox"));

        let chatWithAction = new Gio.SimpleAction({ name: CHAT_WITH_ACTION,
                                                    parameter_type: new GLib.VariantType('s') });
        chatWithAction.connect('activate', Lang.bind(this, function(action, parameter) {
            if (this._mainWindow === null)
                return;

            let actor = parameter.unpack();
            this._mainWindow.switchToChatWith(actor);
            this.activate();
        }));
        this.add_action(chatWithAction);
    },

    vfunc_startup: function() {
        this.parent();

        Gtk.Settings.get_default().gtk_application_prefer_dark_theme = true;
        load_style_sheet('/com/endlessm/Coding/Chatbox/application.css');

        this._service = new Service.CodingChatboxTextService();
        this._gameService = new Service.CodingGameService();
    },

    vfunc_activate: function() {
        if (!this._mainWindow)
            this._mainWindow = new CodingChatboxMainWindow({ application: this,
                                                             service: this._service,
                                                             chatbox_service: this._skeleton,
                                                             game_service: this._gameService });

        this._mainWindow.present();
    },

    vfunc_dbus_register: function(conn, object_path) {
        this.parent(conn, object_path);
        this._skeleton = new Service.ChatboxReceiverService();
        this._skeleton.export(conn, object_path);
        return true;
    },

    vfunc_dbus_unregister: function(conn, object_path) {
        if (this._skeleton) {
            this._skeleton.unexport();
        }

        this.parent(conn, object_path);
    }
});

function main(argv) { // eslint-disable-line no-unused-vars
    return (new CodingChatboxApplication()).run(argv);
}
