// src/views.js
//
// Copyright (c) 2016 Endless Mobile Inc.
// All Rights Reserved.
//
// The views for chatbox content.
//

const ChatboxPrivate = imports.gi.ChatboxPrivate;
const GnomeDesktop = imports.gi.GnomeDesktop;
const Gdk = imports.gi.Gdk;
const GdkPixbuf = imports.gi.GdkPixbuf;
const GObject = imports.gi.GObject;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Pango = imports.gi.Pango;

const Lang = imports.lang;
const State = imports.state;

const MAX_WIDTH_CHARS = 30;

// An immediately invoked function expression that
// allows views to get a cached GnomeDesktopThumbnailFactory
// for a particular thumbnail size.
//
// The reason we have this is that creating a
// GnomeDesktop.DesktopThumbnailFactory is expensive and
// we don't need to change any of its properties. It is better
// to just use a singleton and create one for each size that
// we might need.
const Thumbnailer = (function() {
    let thumbnailers = {
    };

    return {
        forSize: function(size) {
            if (!thumbnailers[size])
                thumbnailers[size] = GnomeDesktop.DesktopThumbnailFactory.new(size);

            return thumbnailers[size];
        }
    };
})();

// stripMarkup
//
// Strip pango markup from text
function stripMarkup(text) {
    return Pango.parse_markup(text, -1, '')[2];
}

const ChatboxMessageView = new Lang.Interface({
    Name: 'ChatboxMessageView',
    Extends: [ GObject.Object ],
    GTypeName: 'Gjs_ChatboxMessageView',

    focused: function() {
    },

    copyToClipboard: function() {
    },

    supportsCopyPaste: function() {
        return false;
    }
});

// applyStyles
//
// Apply all given style classes to widget
function applyStyles(widget, styles) {
    if (styles && styles.length) {
        let context = widget.get_style_context();
        styles.forEach(function(style) {
            context.add_class(style);
        });
    }
}

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

    _init: function(params, styles) {
        params.wrap = true;
        params.max_width_chars = MAX_WIDTH_CHARS;
        params.use_markup = true;
        this.parent(params);

        applyStyles(this, styles);
        this.state.bind_property('text', this, 'label',
                                 GObject.BindingFlags.DEFAULT |
                                 GObject.BindingFlags.SYNC_CREATE);
    },

    copyToClipboard: function() {
        // We can't use gtk_widget_get_clipboard here since Atom
        // not copyable according to gjs
        let clipboard = Gtk.Clipboard.get_default(Gdk.Display.get_default());
        // We also need to strip any markup before copypasting.
        ChatboxPrivate.utils_copy_text_to_clipboard(this, stripMarkup(this.state.text));
    },

    supportsCopyPaste: function() {
        return true;
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

    _init: function(params, styles) {
        params.orientation = Gtk.Orientation.VERTICAL;

        this.parent(params);
        applyStyles(this, styles);
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

    _init: function(params, styles) {
        params.margin = 10;
        params.width_request = MAX_WIDTH_CHARS * 5;

        this.parent(params);

        applyStyles(this, styles);
    },
});

const _THUMBNAIL_MIME_TYPES = ['image/png', 'image/jpeg'];

// shouldThumbnail
//
// Determine if this file has a content type that makes
// us care about thumbnails
function shouldThumbnail(uri, thumbnailFactory, mimeType, mtime) {
    return thumbnailFactory.can_thumbnail(uri, mimeType, mtime) &&
           _THUMBNAIL_MIME_TYPES.indexOf(mimeType) !== -1;
}

// getPreviewForFile
//
// Get an object containing a reference to both a GIcon
// and potentially a thumbnailing path for the provided
// GFile. The icon will just be the icon and not a preview
// of the file itself.
function getPreviewForFile(path, thumbnailFactory) {
    let info;

    try {
        // XXX: In general, it isn't great that we're doing synchronous
        // IO here, though it is done for now to avoid too much churn.
        info = path.query_info([Gio.FILE_ATTRIBUTE_STANDARD_ICON,
                                Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH,
                                Gio.FILE_ATTRIBUTE_STANDARD_CONTENT_TYPE,
                                Gio.FILE_ATTRIBUTE_TIME_MODIFIED].join(','),
                               Gio.FileQueryInfoFlags.NONE,
                               null);
    } catch (e) {
        logError(e,
                 'Failed to query info for file, ' +
                 'can\'t generate meaningful preview');
        return {
            thumbnail: null,
            icon: Gio.Icon.new_for_string('text-x-generic')
        };
    }

    let contentType = info.get_content_type();
    let mimeType = Gio.content_type_get_mime_type(contentType);
    let mtime = info.get_modification_time();
    let uri = path.get_uri();

    let thumbnail = null;

    if (shouldThumbnail(uri, thumbnailFactory, mimeType, mtime)) {
        let thumbnailPath = info.get_attribute_byte_string(Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH);

        if (thumbnailPath && GLib.file_test(thumbnailPath, GLib.FileTest.EXISTS)) {
            try {
                thumbnail = GdkPixbuf.Pixbuf.new_from_file(thumbnailPath);
            } catch (e) {
                logError(e, 'Couldn\'t read thumbnail at path ' + thumbnailPath);
            }
        }

        // If we don't have a thumbnail after this point, it means that it
        // either didn't exist or we failed to create one. Generate a new
        // thumbnail.
        if (!thumbnail) {
            // A thumbnail does not currently exist. Ask libgnome-desktop to
            // create one (currently we do so synchronously) and then
            // save the result.
            thumbnail = thumbnailFactory.generate_thumbnail(uri, mimeType);

            if (thumbnail) {
                thumbnailFactory.save_thumbnail(thumbnail, uri, mtime);
            } else {
                log('Failed to create thumbnail of ' + uri);
            }
        }
    }

    return {
        icon: info.get_icon(),
        thumbnail: thumbnail
    };
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

    _init: function(params, styles) {
        this.parent(params);

        applyStyles(this, styles);
        this.attachment_name.label = this.state.path.get_basename();
        this.attachment_desc.label = this.state.desc;

        let thumbnailFactory = Thumbnailer.forSize(GnomeDesktop.DesktopThumbnailSize.LARGE);
        let preview = getPreviewForFile(this.state.path, thumbnailFactory);
        if (preview.thumbnail)
            this.attachment_icon.set_from_pixbuf(preview.thumbnail);
        else
            this.attachment_icon.set_from_gicon(preview.icon, Gtk.IconSize.DIALOG);
    },
    copyToClipboard: function() {
        ChatboxPrivate.utils_copy_file_to_clipboard(this, this.state.path);
    },

    supportsCopyPaste: function() {
        return true;
    }
});
