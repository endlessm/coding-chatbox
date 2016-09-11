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
    Gtk: '3.0',
    Gio: '2.0',
    GLib: '2.0',
    GObject: '2.0'
});

const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Pango = imports.gi.Pango;
const PangoCairo = imports.gi.PangoCairo;

const Lang = imports.lang;

const ACTORS = [
    "MEME",
    "DANK",
    "FOOBAR",
    "GOOG",
    "FRUIT"
];

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
        'contact-image': GObject.param_spec_pointer('contact-image',
                                                    '',
                                                    '',
                                                    GObject.ParamFlags.READWRITE |
                                                    GObject.ParamFlags.CONSTRUCT_ONLY)
    },


    _init: function(params) {
        this.parent(params);

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

            if (!params.contact_image) {
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
                let image_width = params.contact_image.getWidth();
                let image_height = params.contact_image.getHeight();

                cr.save();
                cr.scale(width / image_width, height / image_height);
                cr.setSourceSurface(params.contact_image);
                cr.restore();
                cr.paint();
            }

            cr.restore();
            cr.$dispose();
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


let CONSTRUCT_PROPERTY_CHOICES = [
    [{
        text: 'Hello world, this is a sample chat bubble for the mission chatbox app'
    }],
    [{
        text: 'This is a question that might influence your entire career, let alone destiny'
    }, null],
    [{}, [
        {
            text: 'Stay in Wonderland'
        },
        {
            text: 'See how deep the rabbithole goes'
        }
    ], null]
];


let CLASS_CHOICES = [
    TextChatBubbleContent,
    InputChatBubbleContent,
    ChoiceChatBubbleContent
];


const MissionChatboxMainWindow = new Lang.Class({
    Name: 'MissionChatboxMainWindow',
    Extends: Gtk.ApplicationWindow,
    Template: 'resource:///com/endlessm/Mission/Chatbox/main.ui',
    Children: ['chatbox-list-box', 'chatbox-stack', 'main-header'],

    _init: function(params) {
        params.title = "";
        this.parent(params);

        ACTORS.forEach(Lang.bind(this, function(actor) {
            let contact_row = new MissionChatboxContactListItem({
                visible: true,
                contact_name: actor,
                contact_image: null
            });
            let chat_contents = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                visible: true,
            });
            chat_contents.get_style_context().add_class('chatbox-chats');

            /* On each chat add a few bubbles */
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

            this.chatbox_list_box.add(contact_row);
            this.chatbox_stack.add_named(chat_contents, actor);
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
    },

    vfunc_activate: function() {
        (new MissionChatboxMainWindow({ application: this })).show();
    },

    vfunc_shutdown: function() {
        this.parent();
    }
});

function main(argv) { // eslint-disable-line no-unused-vars
    return (new MissionChatboxApplication()).run(argv);
}
