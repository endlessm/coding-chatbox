// src/views.js
//
// Copyright (c) 2016 Endless Mobile Inc.
// All Rights Reserved.
//
// The views for chatbox content.
//

const Gdk = imports.gi.Gdk;
const GObject = imports.gi.GObject;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;

const Lang = imports.lang;
const State = imports.state;

const MAX_WIDTH_CHARS = 30;

const ChatboxMessageView = new Lang.Interface({
    Name: 'ChatboxMessageView',
    Extends: [ GObject.Object ],
    GTypeName: 'Gjs_ChatboxMessageView',

    focused: function() {
    }
});

const TextChatboxMessageView = new Lang.Class({
    Name: 'TextChatboxMessageView',
    Extends: Gtk.Label,
    Implements: [ ChatboxMessageView ],
    Properties: {
        state: GObject.ParamSpec.object('state',
                                        '',
                                        '',
                                        GObject.ParamFlags.READWRITE |
                                        GObject.ParamFlags.CONSTRUCT_ONLY,
                                        State.TextChatboxMessage)
    },

    _init: function(params) {
        params.wrap = true;
        params.max_width_chars = MAX_WIDTH_CHARS;
        this.parent(params);

        this.state.bind_property('text', this, 'label',
                                 GObject.BindingFlags.DEFAULT |
                                 GObject.BindingFlags.SYNC_CREATE);
    }
});

const ChoiceChatboxMessageView = new Lang.Class({
    Name: 'ChoiceChatboxMessageView',
    Extends: Gtk.Box,
    Implements: [ ChatboxMessageView ],
    Properties: {
        state: GObject.ParamSpec.object('state',
                                        '',
                                        '',
                                        GObject.ParamFlags.READWRITE |
                                        GObject.ParamFlags.CONSTRUCT_ONLY,
                                        State.ChoiceChatboxMessage)
    },
    Signals: {
        'clicked': {
            param_types: [ GObject.TYPE_STRING, GObject.TYPE_STRING ]
        }
    },

    _init: function(params) {
        params.orientation = Gtk.Orientation.VERTICAL;

        this.parent(params);
        this._buttons = this.state.choices.map(Lang.bind(this, function(choice) {
            let button = new Gtk.Button({
                visible: true,
                label: choice.label
            });
            button.connect('clicked', Lang.bind(this, function() {
                this.emit('clicked', choice.name, choice.label);
            }));
            return button;
        }));
        this._buttons.forEach(Lang.bind(this, function(button) {
            this.pack_end(button, true, true, 10);
        }));
    }
});

const InputChatboxMessageView = new Lang.Class({
    Name: 'InputChatboxMessageView',
    Extends: Gtk.Entry,
    Implements: [ ChatboxMessageView ],
    Properties: {
        state: GObject.ParamSpec.object('state',
                                        '',
                                        '',
                                        GObject.ParamFlags.READWRITE |
                                        GObject.ParamFlags.CONSTRUCT_ONLY,
                                        State.InputChatboxMessage)
    },

    _init: function(params) {
        params.margin = 10;
        params.width_request = MAX_WIDTH_CHARS * 5;

        this.parent(params);
    },
});

const ExternalEventsChatboxMessageView = new Lang.Class({
    Name: 'ExternalEventsChatboxMessageView',
    Extends: Gtk.Widget,
    Implements: [ ChatboxMessageView ],
    Signals: {
        'check-events': { }
    },

    focused: function() {
        this.emit('check-events');
    }
});

// getIconForFile
//
// Get a GIcon containing an icon for the provided GFile. The
// icon will just be the icon and not a preview of the
// file itself.
function getIconForFile(path, widget) {
    let info = path.query_info(Gio.FILE_ATTRIBUTE_STANDARD_ICON,
                               Gio.FileQueryInfoFlags.NONE,
                               null);
    return info.get_icon();
}

const AttachmentChatboxMessageView = new Lang.Class({
    Name: 'AttachmentChatboxMessageView',
    Extends: Gtk.Button,
    Template: 'resource:///com/endlessm/Coding/Chatbox/attachment-view.ui',
    Children: ['attachment-icon', 'attachment-name', 'attachment-desc'],
    Implements: [ ChatboxMessageView ],
    Properties: {
        state: GObject.ParamSpec.object('state',
                                        '',
                                        '',
                                        GObject.ParamFlags.READWRITE |
                                        GObject.ParamFlags.CONSTRUCT_ONLY,
                                        State.AttachmentChatboxMessage)
    },

    _init: function(params) {
        this.parent(params);
        this.attachment_name.label = this.state.path.get_basename();
        this.attachment_desc.label = this.state.desc;
        this.attachment_icon.set_from_gicon(getIconForFile(this.state.path),
                                            Gtk.IconSize.DIALOG);
    }
});
