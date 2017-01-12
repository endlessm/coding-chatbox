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

const CHATBOX_MESSAGE_VIEW_WIDTH_REQUEST = 250;
const CODE_CHATBOX_MESSAGE_VIEW_WIDTH_REQUEST = 280;

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
// Strip pango markup from text. We also need to strip any embedded
// links before passing to pango_parse_markup so that the latter does not
// throw an error
function stripMarkup(text) {
    let escaped = text.replace(/(<\/?\s*a.*?>)/g, '')
    return Pango.parse_markup(escaped, -1, '')[2];
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
    if (styles) {
        let context = widget.get_style_context();
        styles.forEach(function(style) {
            context.add_class(style);
        });
    }
}

// removeStyles
//
// Remove all styles from a widget.
function removeStyles(widget, styles) {
    if (styles) {
        let context = widget.get_style_context();
        styles.forEach(function(style) {
            context.remove_class(style);
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

    _init: function(params) {
        params.wrap = true;
        params.max_width_chars = params.state.wrap_width;
        params.use_markup = true;
        params.selectable = true;
        this.parent(params);

        this.state.bind_property('text', this, 'label',
                                 GObject.BindingFlags.DEFAULT |
                                 GObject.BindingFlags.SYNC_CREATE);
    },

    copyToClipboard: function() {
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

    _init: function(params) {
        params.orientation = Gtk.Orientation.VERTICAL;
        params.spacing = 16;

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
        })).forEach(Lang.bind(this, function(button) {
            this.add(button);
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
        params.width_request = CHATBOX_MESSAGE_VIEW_WIDTH_REQUEST;

        this.parent(params);
    },
});

const MessagePendingView = new Lang.Class({
    Name: 'MessagePendingView',
    Extends: Gtk.Box,
    Template: 'resource:///com/endlessm/Coding/Chatbox/message-pending-view.ui',
    Children: ['animation'],
    Implements: [ ChatboxMessageView ],

    _init: function(params) {
        this.parent(params);
        this._dotTimings = [0, -15, -30];
        this.animation.connect('draw', Lang.bind(this, function(widget, cr) {
            this._dotTimings = this._dotTimings.map(function(timing) {
                return timing + 1 > 30 ? -50 : timing + 1;
            });

            this._dotTimings.forEach(function(timing, index) {
                cr.setSourceRGBA(1.0,
                                 1.0,
                                 1.0,
                                 Math.sin(Math.max(0, timing) * 0.104) * 0.7 + 0.3);
                cr.arc(10 + index * 15,
                       16,
                       5,
                       0,
                       2 * Math.PI);
                cr.fill();
            });
            cr.$dispose();
            widget.queue_draw();
        }));
        this.animation.queue_draw();
    }
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
    if (Gio.content_type_is_a(contentType, 'application/x-desktop')) {
        let appInfo = Gio.DesktopAppInfo.new_from_filename(path.get_path());
        let icon = null;
        if (appInfo)
            icon = appInfo.get_icon();

        if (!icon)
            icon = Gio.Icon.new_for_string('application-x-executable');

        return {
            thumbnail: null,
            icon: icon
        };
    }

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

    _init: function(params) {
        this.parent(params);

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
