// src/contact.js
//
// Copyright (c) 2016-2017 Endless Mobile Inc.
//
// Render the contacts area of the chatbox and show notifications.

const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;

const Actor = imports.actor;
const Lang = imports.lang;

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
    Children: ['content-grid', 'contact-name-label', 'contact-message-notification'],
    Properties: {
        'actor': GObject.ParamSpec.object('actor',
                                          '',
                                          '',
                                          GObject.ParamFlags.READWRITE |
                                          GObject.ParamFlags.CONSTRUCT_ONLY,
                                          Actor.Actor.$gtype)
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
