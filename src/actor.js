// src/actor.js
//
// Copyright (c) 2016-2017 Endless Mobile Inc.
//
// Manage actor states and render avatars.

const Cairo = imports.cairo;
const GdkPixbuf = imports.gi.GdkPixbuf;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Gdk = imports.gi.Gdk;
const Gtk = imports.gi.Gtk;

const Lang = imports.lang;

const CONTACT_IMAGE_SIZE = 48;

function initials_from_name(name) {
    return String(name.split().map(function(word) {
        return word[0];
    })).toUpperCase();
}

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

const Model = new Lang.Class({
    Name: 'Model',
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

    forEach: function(callback) {
        for (let idx = 0; idx < this.get_n_items(); idx++) {
            callback(this.get_item(idx));
        }
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
