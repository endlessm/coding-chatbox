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

const MissionChatboxContactListItem = new Lang.Class({
    Name: 'MissionChatboxContactListItem',
    Extends: Gtk.ListBoxRow,
    Template: 'resource:///com/endlessm/Mission/Chatbox/contact.ui',
    Children: ['contact-image', 'contact-name', 'contact-message-snippit'],

    _init: function(params, contact_name, contact_image) {
        this.parent(params);

        this.contact_name.set_text(contact_name);
        this.contact_message_snippit.set_markup('<i>Last seen</i>');
        this.contact_image.connect('draw', Lang.bind(this, function(area, cr) {
            let context = area.get_style_context();
            let width = area.get_allocated_width();
            let height = area.get_allocated_height();

            /* Clip drawing to contact circle */
            cr.save();
            Gtk.render_background(context, cr, 0, 0, width, height);
            cr.arc(width / 2, width / 2, width / 2, 0, Math.PI * 2);
            cr.clip();
            cr.newPath();

            if (!contact_image) {
                let layout = PangoCairo.create_layout(cr);
                layout.set_text(initials_from_name(contact_name), -1);
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
                let image_width = contact_image.getWidth();
                let image_height = contact_image.getHeight();

                cr.save();
                cr.scale(width / image_width, height / image_height);
                cr.setSourceSurface(contact_image);
                cr.restore();
                cr.paint();
            }

            cr.restore();
        }));
    }
});

const MissionChatboxMainWindow = new Lang.Class({
    Name: 'MissionChatboxMainWindow',
    Extends: Gtk.ApplicationWindow,
    Template: 'resource:///com/endlessm/Mission/Chatbox/main.ui',
    Children: ['chatbox-list-box', 'chatbox-stack', 'main-header'],

    _init: function(params) {
        params.title = "";
        this.parent(params);
        this.chatbox_stack.add(new Gtk.Label({ label: "Hello, world", visible: true }));

        ACTORS.forEach(Lang.bind(this, function(actor) {
            this.chatbox_list_box.add(new MissionChatboxContactListItem({ visible: true }, actor, null));
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
