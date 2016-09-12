#!/usr/bin/env gjs
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

function initials_from_name(name) {
    return String(name.split().map(function(word) {
        return word[0];
    })).toUpperCase();
}

const CONTACT_IMAGE_FONT_DESC = Pango.FontDescription.from_string("Sans Bold 27");

const ChatBubbleContent = new Lang.Interface({
    Name: 'ChatBubbleContent',

    /**
     * appendContent
     *
     * Append some new content to the bubble.
     */
    appendContent: function() {
    },

    /**
     * view
     *
     * Return the internal view, used for rendering
     */
    view: Lang.UMIMPLEMENTED,
});

const MAX_WIDTH_CHARS = 30;


const TextChatBubbleContent = new Lang.Class({
    Name: 'TextChatBubbleContent',
    Implements: [ ChatBubbleContent ],
    Properties: {
        /**
         * 'text'
         *
         * Text to display in the bubble
         */
        'text': GObject.ParamSpec.string('text',
                                         '',
                                         '',
                                         GObject.ParamFlags.READWRITE |
                                         GObject.ParamFlags.CONSTRUCT_ONLY,
                                         '')
    },

    _init: function(params) {
        this.parent(params);
        this._view = new Gtk.Box({ name: 'text-chat-bubble', visible: true });
        this._label = new Gtk.Label({
            visible: true,
            wrap: true,
            max_width_chars: MAX_WIDTH_CHARS,
            label: params.text
        });
        this._view.pack_start(this._label, false, false, 0);
    },

    view: function() {
        return this._view;
    }
});

const ChoiceChatBubbleContent = new Lang.Class({
    Name: 'ChoiceChatBubbleContent',
    Implements: [ ChatBubbleContent ],

    _init: function(params, choices) {
        this.parent(params);
        this._view = new Gtk.Box({
            name: 'choice-chat-bubble',
            visible: true,
            orientation: Gtk.Orientation.VERTICAL
        });
        this._buttons = choices.map(function(choice) {
            return new Gtk.Button({
                visible: true,
                label: choice.text
            });
        });
        this._buttons.forEach(Lang.bind(this, function(button) {
            this._view.pack_end(button, true, true, 10);
        }));
    },

    view: function() {
        return this._view;
    }
});

const InputChatBubbleContent = new Lang.Class({
    Name: 'InputChatBubbleContent',
    Implements: [ ChatBubbleContent ],

    Properties: {
        /**
         * 'text'
         *
         * Text to display in the bubble before the input box.
         */
        'text': GObject.ParamSpec.string('text',
                                         '',
                                         '',
                                         GObject.ParamFlags.READWRITE |
                                         GObject.ParamFlags.CONSTRUCT_ONLY,
                                         '')
    },

    _init: function(params) {
        this.parent(params);
        this._view = new Gtk.Box({
            name: 'input-chat-bubble',
            visible: true,
            orientation: Gtk.Orientation.VERTICAL
        });
        this._label = new Gtk.Label({
            visible: true,
            wrap: true,
            max_width_chars: MAX_WIDTH_CHARS,
            label: 'A question with potentially many answers'
        });
        this._input = new Gtk.Entry({
            visible: true,
            width_request: MAX_WIDTH_CHARS * 5
        });
        this._view.pack_start(this._label, true, true, 0);
        this._view.pack_start(this._input, true, true, 10);
    },

    view: function() {
        return this._view;
    }
});


/**
 * loadImageFromFile
 *
 * Attempt to create a cairo_surface_t from the specified path
 * by loading a png image. Once done, callback will be called
 * with either null, or a cairo_surface_t containing the
 * image.
 */
function loadImageFromResourceAsync(filename, callback) {
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
            log("An error occurred whilst trying to load image from " + filename + " " + String(e));
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

        loadImageFromResourceAsync(this.contact_image, Lang.bind(this, function(surface) {
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
                                            GObject.ParamFlags.READWRITE |
                                            GObject.ParamFlags.CONSTRUCT_ONLY,
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
    }
});


const ChatboxClasses = {
    scrolled: TextChatBubbleContent,
    scroll_wait: TextChatBubbleContent,
    text: InputChatBubbleContent,
    console: InputChatBubbleContent,
    choice: ChoiceChatBubbleContent,
    external_events: null
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
        let actorsFile = Gio.File.new_for_uri('resource:///com/endlessm/Mission/Chatbox/chatbox-data.json');

        params.title = "";
        this.parent(params);

        actorsFile.load_contents_async(null, Lang.bind(this, function(file, result) {
            let contents;
            try {
                contents = file.load_contents_finish(result)[1];
            } catch (e) {
                log("Couldn't load chatbox data file from data resource: " + String(e));
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

                /* On each chat add a few bubbles
                for(let i = 0; i < 10; ++i) {
                    let args = CONSTRUCT_PROPERTY_CHOICES[i % 3];
                    let content = new CLASS_CHOICES[i % 3](args[0], args[1]);
                    let container = new MissionChatboxChatBubbleContainer({
                        visible: true,
                        content: content.view(),
                        by_user: i % 2 == 1
                    });

                    chat_contents.pack_start(container, false, false, 10);
                }
                */

                this.chatbox_list_box.add(contact_row);
                this.chatbox_stack.add_named(chat_contents, actor.name);
            }));
        }));

        this.service.connect('chat-message', Lang.bind(this, function(service, message) {
            let chat_contents = this.chatbox_stack.get_visible_child();
            let chat_children = chat_contents.get_children();

            if (chat_children.length) {
                let last_child = chat_children[chat_children.length - 1];

                /* If we can just append this content to the last bubble,
                 * then we can return from here */
                if (last_child.controller.appendContent(message)) {
                    return;
                }
            }

            let content = new ChatboxClasses[message.kind]({
                text: message.text
            });
            let container = new MissionChatboxChatBubbleContainer({
                visible: true,
                content: content.view(),
                by_user: false
            });

            chat_children.pack_end(container, false, false, 10);
        }));

        this.service.connect('user-input-bubble', Lang.bind(this, function(service, spec) {
            let chat_contents = this.chatbox_stack.get_visible_child();
            let chat_children = chat_contents.get_children();

            /* It doesn't make much sense to append user input bubbles to
             * each other, so just create a new bubble */
            let content = new ChatboxClasses[spec.kind]({}, spec);
            let container = new MissionChatboxChatBubbleContainer({
                visible: true,
                content: content.view(),
                by_user: false
            });

            content.connect('response', Lang.bind(this, function(bubble, response) {
                this.service.evaluate(response);
            }));

            chat_children.pack_end(container, false, false, 10);
        }));

        this.chatbox_list_box.connect('row-selected', Lang.bind(this, function(list_box, row) {
            this.chatbox_stack.set_visible_child_name(row.contact_name);
        }));
    }
});

const MissionChatboxApplication = new Lang.Class({
    Name: 'MissionChatboxApplication',
    Extends: Gtk.Application,

    _init: function() {
        this.parent({ application_id: pkg.name });
        GLib.set_application_name(_("Mission Chatbox"));
    },

    vfunc_startup: function() {
        this.parent();
        this._service = new Service.MissionChatboxTextService();
    },

    vfunc_activate: function() {
        (new MissionChatboxMainWindow({
            application: this,
            service: this._service
        })).show();
    },

    vfunc_shutdown: function() {
        this.parent();
    }
});

function main(argv) { // eslint-disable-line no-unused-vars
    return (new MissionChatboxApplication()).run(argv);
}
