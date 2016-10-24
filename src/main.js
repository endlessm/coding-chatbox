/* src/main.js
 *
 * Copyright (c) 2016 Endless Mobile Inc.
 * All Rights Reserved.
 *
 * This file is the file first run by the entrypoint to the mission-chatbox
 * package.
 */
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

const RoundedImage = new Lang.Class({
    Name: 'RoundedImage',
    Extends: Gtk.Image,

    vfunc_draw: function(cr) {
        let width = this.get_allocated_width();
        let height = this.get_allocated_height();

        /* Clip drawing to contact circle */
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

const MissionChatboxContactListItem = new Lang.Class({
    Name: 'MissionChatboxContactListItem',
    Extends: Gtk.ListBoxRow,
    Template: 'resource:///com/endlessm/Mission/Chatbox/contact.ui',
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

        this.contact_image_surface = null;
        this.contact_name_label.set_text(params.contact_name);
        this.contact_message_snippit_label.set_markup('<i>Last seen</i>');
        this._contact_image_widget = new RoundedImage({ visible: true,
                                                        margin: 8 });
        this._contact_image_widget.get_style_context().add_class('contact-image');
        this.content_grid.attach_next_to(this._contact_image_widget, null, Gtk.PositionType.LEFT,
                                         1, 1);

        let useContactImage = this.contact_image;
        if (useContactImage) {
            let resourcePath = '/com/endlessm/Mission/Chatbox/img/' + this.contact_image;
            try {
                let pixbuf = GdkPixbuf.Pixbuf.new_from_resource_at_scale(
                    resourcePath, CONTACT_IMAGE_SIZE, CONTACT_IMAGE_SIZE, true);
                this._contact_image_widget.pixbuf = pixbuf;
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

            this._contact_image_widget.surface = surface;
        }
    }
});

const MissionChatboxChatBubbleContainer = new Lang.Class({
    Name: 'MissionChatboxChatBubbleContainer',
    Extends: Gtk.Box,
    Template: 'resource:///com/endlessm/Mission/Chatbox/chat-bubble-container.ui',
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

        this.inner_box.margin = 20;
        this.inner_box.pack_start(this.content, false, false, 0);
    },

    set content(val) {
        this._content = val;

        /* Can't run this setter if we don't have an inner_box yet */
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
        this.content.focused();
    }
});


/**
 * new_message_view_for_state
 *
 * Creates a new message view container for a message state container, which
 * automatically updates when the underlying state changes.
 */
function new_message_view_for_state(container, service, actor) {
    let [name, position] = container.location.split('::');
    let view = container.render_view(function(response) {
        service.evaluate(name, position, actor, response);
    });
    let view_container = new MissionChatboxChatBubbleContainer({
        /* We only want to display the container if the underlying view
         * itself is visible. The assumption here is that the visibility
         * state never changes between renders. */
        visible: view.visible,
        content: view,
        by_user: (container.sender == State.SentBy.USER)
    });

    /* Re-render the view in case something changes */
    container.connect('message-changed', function() {
        view_container.content = container.render_view(function(response) {
            service.evaluate(name, position, actor, response);
        });
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
                response: button_id,
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
                response: msg,
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
    Extends: State.MissionChatboxMessageBase,

    render_view: function(listener) {
        let view = new Views.ExternalEventsChatboxMessageView();
        view.connect('check-events', Lang.bind(this, function() {
            listener({
                response: '',
                amendment: null
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
    external_events: RenderableExternalEventsChatboxMessage
};


const MissionChatboxMainWindow = new Lang.Class({
    Name: 'MissionChatboxMainWindow',
    Extends: Gtk.ApplicationWindow,
    Template: 'resource:///com/endlessm/Mission/Chatbox/main.ui',
    Children: ['chatbox-list-box', 'chatbox-stack', 'main-header'],
    Properties: {
        service: GObject.ParamSpec.object('service',
                                          '',
                                          '',
                                          GObject.ParamFlags.READWRITE |
                                          GObject.ParamFlags.CONSTRUCT_ONLY,
                                          Service.MissionChatboxTextService)
    },

    _init: function(params) {
        params.title = '';
        this.parent(params);

        this._state = new State.MissionChatboxState(MessageClasses);
        this._service = new Service.MissionChatboxTextService();

        let actorsFile = Gio.File.new_for_uri('resource:///com/endlessm/Mission/Chatbox/chatbox-data.json');
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
                let contact_row = new MissionChatboxContactListItem({
                    visible: true,
                    contact_name: actor.name,
                    contact_image: actor.img
                });
                let chat_contents = new Gtk.Box({
                    orientation: Gtk.Orientation.VERTICAL,
                    visible: true,
                });
                chat_contents.get_style_context().add_class('chatbox-chats');

                /* Get the conversation for each actor and render all the
                 * chat bubbles. We pass a callback here which is used
                 * to call into the service on a reponse */
                if (this._state.conversation_position_for_actor(actor.name) === null) {
                    let [name, position] = actor.location.split('::');
                    this._service.fetch_task_description_for(name, position, actor.name);
                } else {
                    this._state.with_each_message_container(Lang.bind(this, function(container) {
                        chat_contents.pack_start(new_message_view_for_state(container,
                                                                            this._service,
                                                                            actor.name),
                                                 false, false, 10);
                    }));
                }

                this.chatbox_list_box.add(contact_row);
                this.chatbox_stack.add_named(chat_contents, actor.name);
            }));
        }));

        this._service.connect('chat-message', Lang.bind(this, function(service, actor, message) {
            let chat_contents = this.chatbox_stack.get_child_by_name(actor);

            /* If we can amend the last message, great.
             * Though I'm not really sure if we want this. "amend" currently
             * means 'amend-or-replace'. */
            if (this._state.amend_last_message_for_actor(actor,
                                                         State.SentBy.ACTOR,
                                                         message)) {
                return;
            }

            /* Otherwise create a state container and use that */
            let container = this._state.add_message_for_actor(actor,
                                                              State.SentBy.ACTOR,
                                                              message,
                                                              'none::none');
            chat_contents.pack_start(new_message_view_for_state(container,
                                                                this._service,
                                                                actor),
                                     false, false, 10);
        }));

        this._service.connect('user-input-bubble', Lang.bind(this, function(service, actor, spec, name, position) {
            /* Doesn't make sense to append a new bubble, so just
             * create a new one now */
            let chat_contents = this.chatbox_stack.get_child_by_name(actor);
            let container = this._state.add_message_for_actor(actor,
                                                              State.SentBy.USER,
                                                              spec,
                                                              [name, position].join('::'));
            chat_contents.pack_start(new_message_view_for_state(container,
                                                                this._service,
                                                                actor),
                                     false, false, 10);
        }));

        this.chatbox_list_box.connect('row-selected', Lang.bind(this, function(list_box, row) {
            if (!row)
                return;

            this.chatbox_stack.set_visible_child_name(row.contact_name);
            let children = this.chatbox_stack.get_visible_child().get_children();
            children[children.length - 1].focused();
        }));
    }
});

function load_style_sheet(resourcePath) {
    let provider = new Gtk.CssProvider();
    provider.load_from_resource(resourcePath);
    Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(),
                                             provider,
                                             Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
}

const MissionChatboxApplication = new Lang.Class({
    Name: 'MissionChatboxApplication',
    Extends: Gtk.Application,

    _init: function() {
        this._mainWindow = null;

        this.parent({ application_id: pkg.name });
        GLib.set_application_name(_("Mission Chatbox"));
    },

    vfunc_startup: function() {
        this.parent();

        load_style_sheet('/com/endlessm/Mission/Chatbox/application.css');

        this._service = new Service.MissionChatboxTextService();
    },

    vfunc_activate: function() {
        if (!this._mainWindow)
            this._mainWindow = new MissionChatboxMainWindow({ application: this,
                                                              service: this._service });

        this._mainWindow.present();
    }
});

function main(argv) { // eslint-disable-line no-unused-vars
    return (new MissionChatboxApplication()).run(argv);
}
