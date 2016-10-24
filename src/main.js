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

const CONTACT_IMAGE_FONT_DESC = Pango.FontDescription.from_string('Sans Bold 27');


/**
 * loadImageFromFile
 *
 * Attempt to create a cairo_surface_t from the specified path
 * by loading a png image. Once done, callback will be called
 * with either null, or a cairo_surface_t containing the
 * image.
 */
function load_image_from_resource_async(filename, callback) {
    let file = Gio.file_new_for_uri('resource:///com/endlessm/Mission/Chatbox/img/' + filename);
    file.load_contents_async(null, function(file, result) {
        let contents;
        try {
            contents = file.load_contents_finish(result)[1];
        } catch(e) {
            log('Couldn\'t load contents from ' + filename + ': ' + String(e));
            return callback(null);
        }
        let pixbufLoader = new GdkPixbuf.PixbufLoader();
        let pixbuf = null;

        try {
            pixbufLoader.write_bytes(contents);
            pixbufLoader.close();
            pixbuf = pixbufLoader.get_pixbuf();
        } catch (e) {
            logError(e, 'An error occurred whilst trying to load image from ' + filename);
            return callback(null);
        }

        return callback(Gdk.cairo_surface_create_from_pixbuf(pixbuf, 1.0, null));
    });
}

const MissionChatboxContactListItem = new Lang.Class({
    Name: 'MissionChatboxContactListItem',
    Extends: Gtk.ListBoxRow,
    Template: 'resource:///com/endlessm/Mission/Chatbox/contact.ui',
    Children: ['contact-image-circle', 'contact-name-label', 'contact-message-snippit-label'],
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
        this.contact_image_circle.connect('draw', Lang.bind(this, function(area, cr) {
            let context = area.get_style_context();
            let width = area.get_allocated_width();
            let height = area.get_allocated_height();

            /* Clip drawing to contact circle */
            cr.save();
            Gtk.render_background(context, cr, 0, 0, width, height);
            cr.arc(width / 2, width / 2, width / 2, 0, Math.PI * 2);
            cr.clip();
            cr.newPath();

            if (!this.contact_image_surface) {
                let layout = PangoCairo.create_layout(cr);
                layout.set_text(initials_from_name(params.contact_name), -1);
                layout.set_font_description(CONTACT_IMAGE_FONT_DESC);
                cr.save();
                cr.moveTo(0, 0);
                cr.setSourceRGBA(0.74, 0.74, 0.74, 1.0);
                cr.paint();
                cr.restore();

                let [text_width, text_height] = layout.get_pixel_size();
                cr.save();
                cr.moveTo(width / 2 - (text_width / 2),
                          height / 2 - (text_height / 2));
                cr.setSourceRGBA(1.0, 1.0, 1.0, 1.0);
                PangoCairo.show_layout(cr, layout);
                cr.restore();
            } else {
                let image_width = this.contact_image_surface.getWidth();
                let image_height = this.contact_image_surface.getHeight();

                cr.save();
                cr.scale(width / image_width, height / image_height);
                cr.setSourceSurface(this.contact_image_surface, 0, 0);
                cr.paint();
                cr.restore();
            }

            cr.restore();
            cr.$dispose();
        }));

        load_image_from_resource_async(this.contact_image, Lang.bind(this, function(surface) {
            this.contact_image_surface = surface;
        }));
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
        let bubble_color = {
            red: params.by_user ? 0.33 :  0.94,
            green: params.by_user ? 0.56 : 0.94,
            blue: params.by_user ? 0.83 : 0.94,
            alpha: 1
        };

        this.bubble_box.connect('draw', Lang.bind(this, function(box, cr) {
            let width = this.get_allocated_width() - 20;
            let height = this.get_allocated_height() - 20;
            let curvature = 20;
            let radius = curvature / 2;
            let [x1, y1] = [radius, radius];
            let [x2, y2] = [width - radius, height - radius];

            cr.save();
            cr.setLineWidth(4.0);
            cr.setSourceRGBA(bubble_color.red, bubble_color.green, bubble_color.alpha, bubble_color.alpha);
            cr.moveTo(x1, 0);
            cr.lineTo(x2, 0);
            cr.arc(x2, y1, radius, -Math.PI / 2, 0);
            cr.lineTo(width, y2);
            cr.arc(x2, y2, radius, 0, Math.PI / 2);
            cr.lineTo(x1, height);
            cr.arc(x1, y2, radius, Math.PI / 2, Math.PI);
            cr.lineTo(0, y1);
            cr.arc(x1, y1, radius, Math.PI, Math.PI  * 1.5);
            cr.fill();
            cr.restore();
            cr.$dispose();
        }));

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
    let view = container.render_view(Lang.bind(this, function(response) {
        service.evaluate(name, position, actor, response);
    }));
    let view_container = new MissionChatboxChatBubbleContainer({
        /* We only want to display the container if the underlying view
         * itself is visible. The assumption here is that the visibility
         * state never changes between renders. */
        visible: view.visible,
        content: view,
        by_user: container.sender
    });

    /* Re-render the view in case something changes */
    container.connect('message-changed', Lang.bind(this, function() {
        view_container.content = container.render_view(Lang.bind(this, function(response) {
            this._service.evaluate(name, position, actor, response);
        }));
    }));

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
