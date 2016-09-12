#!/usr/bin/env gjs
/* src/views.js
 *
 * Copyright (c) 2016 Endless Mobile Inc.
 * All Rights Reserved.
 *
 * The views for chatbox content.
 */

const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;

const Lang = imports.lang;
const State = imports.state;

function initials_from_name(name) {
    return String(name.split().map(function(word) {
        return word[0];
    })).toUpperCase();
}

const MAX_WIDTH_CHARS = 30;

const TextChatboxMessageView = new Lang.Class({
    Name: 'TextChatboxMessageView',
    Extends: Gtk.Box,
    Properties: {
        state: GObject.ParamSpec.int('state',
                                     '',
                                     '',
                                     State.TextChatboxMessage,
                                     GObject.ParamFlags.READWRITE |
                                     GObject.ParamFlags.CONSTRUCT_ONLY)
    },

    _init: function(params) {
        this.parent(params);
        this._label = new Gtk.Label({
            visible: true,
            wrap: true,
            max_width_chars: MAX_WIDTH_CHARS,
            label: this.state.text
        });
        this.pack_start(this._label, false, false, 0);
        this.state_binding = new GObject.Binding({
            flags: GObject.BindingFlags.DEFAULT,
            source: this.state,
            source_property: 'text',
            target: this._label,
            target_property: 'label'
        });
    }
});

const ChoiceChatboxMessageView = new Lang.Class({
    Name: 'ChoiceChatboxMessageView',
    Extends: Gtk.Box,
    Properties: {
        state: GObject.ParamSpec.int('state',
                                     '',
                                     '',
                                     State.ChoiceChatboxMessage,
                                     GObject.ParamFlags.READWRITE |
                                     GObject.ParamFlags.CONSTRUCT_ONLY)
    },

    _init: function(params) {
        params.orientation = Gtk.Orientation.VERTICAL;

        this.parent(params);
        this._buttons = this.state.choices.map(function(choice) {
            let button = new Gtk.Button({
                visible: true,
                label: choice.label
            });
            button.connect('clicked', Lang.bind(this, function() {
                this.emit('clicked', choice.name, choice.label);
            }));
        });
        this._buttons.forEach(Lang.bind(this, function(button) {
            this.pack_end(button, true, true, 10);
        }));
    }
});

const InputChatboxMessageView = new Lang.Class({
    Name: 'InputChatboxMessageView',
    Extends: Gtk.Box,
    Properties: {
        state: GObject.ParamSpec.int('state',
                                     '',
                                     '',
                                     State.ChoiceChatboxMessage,
                                     GObject.ParamFlags.READWRITE |
                                     GObject.ParamFlags.CONSTRUCT_ONLY)
    },

    _init: function(params) {
        params.orientation = Gtk.Orientation.VERTICAL;

        this.parent(params);
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
        this.pack_start(this._label, true, true, 0);
        this.pack_start(this._input, true, true, 10);
    },
});
