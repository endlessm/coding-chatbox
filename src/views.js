// src/views.js
//
// Copyright (c) 2016 Endless Mobile Inc.
// All Rights Reserved.
//
// The views for chatbox content.
//

const ChatboxPrivate = imports.gi.ChatboxPrivate;
const GnomeDesktop = imports.gi.GnomeDesktop;
const GdkPixbuf = imports.gi.GdkPixbuf;
const GObject = imports.gi.GObject;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Pango = imports.gi.Pango;

const Lang = imports.lang;
const State = imports.state;

const MAX_WIDTH_CHARS = 30;
const CODE_MAX_WIDTH_CHARS = 65;

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
    let escaped = text.replace(/(<\/?\s*a.*?>)/g, '');
    return Pango.parse_markup(escaped, -1, '')[2];
}

const ChatboxMessageView = new Lang.Interface({
    Name: 'ChatboxMessageView',
    Extends: [ GObject.Object ],
    Requires: [ Gtk.Widget ],
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
        params.xalign = 0;
        this.parent(params);

        this.state.bind_property('text', this, 'label',
                                 GObject.BindingFlags.DEFAULT |
                                 GObject.BindingFlags.SYNC_CREATE);
        this.get_style_context().add_class('chatbox-bubble-contents');
        this.get_style_context().add_class('text');
    },

    copyToClipboard: function() {
        // We also need to strip any markup before copypasting.
        ChatboxPrivate.utils_copy_text_to_clipboard(this, stripMarkup(this.state.text));
    },

    supportsCopyPaste: function() {
        return true;
    }
});

const _HORIZONTAL_TEXT_SIZE_LIMIT_CHARS = 15;

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
        params.expand = true;
        params.halign = Gtk.Align.CENTER;

        this.parent(params);

        this.prompt = new Gtk.Label({
            visible: true,
            label: ''
        });
        this.prompt.get_style_context().add_class('input-hint');
        this.pack_start(this.prompt, true, true, 18);

        this.state.bind_property('prompt',
                                 this.prompt,
                                 'label',
                                 GObject.BindingFlags.SYNC_CREATE |
                                 GObject.BindingFlags.DEFAULT);

        this._buttonsBox = new Gtk.Box({
            visible: true,
            /* If the text is small enough, make the orientation of the box
             * horizontal, otherwise make it vertical */
            orientation: params.state.choices.some(function(choice) {
                return choice.label.length > _HORIZONTAL_TEXT_SIZE_LIMIT_CHARS;
            }) ? Gtk.Orientation.VERTICAL : Gtk.Orientation.HORIZONTAL
        });

        this._buttons = this.state.choices.map(Lang.bind(this, function(choice) {
            let button = new Gtk.Button({
                visible: true
            });
            button.add(new Gtk.Label({
                visible: true,
                label: choice.label,
                use_markup: true
            }));
            button.connect('clicked', Lang.bind(this, function() {
                this.emit('clicked', choice.name, choice.label);
            }));
            return button;
        })).forEach(Lang.bind(this, function(button) {
            this._buttonsBox.pack_start(button, true, true, 6);
        }));

        this.pack_start(this._buttonsBox, true, true, 12);
        this.get_style_context().add_class('chatbox-bubble-contents');
        this.get_style_context().add_class('choice');
    }
});

const InputChatboxMessageView = new Lang.Class({
    Name: 'InputChatboxMessageView',
    Extends: Gtk.Box,
    Implements: [ ChatboxMessageView ],
    Properties: {
        state: GObject.ParamSpec.object('state',
                                        '',
                                        '',
                                        GObject.ParamFlags.READWRITE |
                                        GObject.ParamFlags.CONSTRUCT_ONLY,
                                        State.InputChatboxMessage)
    },
    Signals: {
        'activate': {
            param_types: [ GObject.TYPE_STRING ]
        }
    },

    _init: function(params) {
        params.margin = 10;
        params.width_request = MAX_WIDTH_CHARS * 5;
        params.expand = true;
        this.parent(params);

        this._textBuffer = new Gtk.TextBuffer();
        this._textView = new Gtk.TextView({
            visible: true,
            buffer: this._textBuffer,
            expand: true,
            halign: Gtk.Align.FILL
        });
        this.pack_start(this._textView, true, true, 0);
        this._button = new Gtk.Button({
            visible: true,
            label: 'Send',
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER
        });
        this.pack_start(this._button, false, false, 10);
        this._button.connect('clicked', Lang.bind(this, function() {
            let text = this._textBuffer.get_text(this._textBuffer.get_start_iter(),
                                                 this._textBuffer.get_end_iter(),
                                                 false);
            this.emit('activate', text);
        }));
        this.get_style_context().add_class('chatbox-bubble-contents');
        this.get_style_context().add_class('input');
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
        this.get_style_context().add_class('chatbox-bubble-contents');
        this.get_style_context().add_class('pending');
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

function timevalToUsecs(timeval) {
    return timeval.tv_sec * 1000000 + timeval.tv_usec;
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
        info = path.query_info([
            Gio.FILE_ATTRIBUTE_STANDARD_ICON,
            Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH,
            Gio.FILE_ATTRIBUTE_STANDARD_CONTENT_TYPE,
            Gio.FILE_ATTRIBUTE_TIME_MODIFIED,
            Gio.FILE_ATTRIBUTE_THUMBNAIL_IS_VALID
        ].join(','), Gio.FileQueryInfoFlags.NONE, null);
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

    if (shouldThumbnail(uri, thumbnailFactory, mimeType, mtime)) {
        let thumbnailPath = info.get_attribute_byte_string(Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH);
        let thumbnail = null;

        // Also check to see if the thumbnail is 'valid'. If it is not
        // then we should ignore thumbnailPath and re-thumbnail.
        let thumbnailIsValid = info.get_attribute_boolean(Gio.FILE_ATTRIBUTE_THUMBNAIL_IS_VALID);

        if (thumbnailPath &&
            GLib.file_test(thumbnailPath, GLib.FileTest.EXISTS) &&
            thumbnailIsValid) {
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

        /* Here we return the URI as we will be passing that directly to
         * GtkCssProvider */
        return {
            icon: null,
            thumbnail: {
                path: thumbnailPath,
                width: thumbnail.get_width(),
                height: thumbnail.get_height()
            }
        };
    }

    return {
        icon: info.get_icon(),
        thumbnail: null
    };
}

const CSSAllocator = (function() {
    let counter = 0;
    return function(properties) {
        let class_name = 'themed-widget-' + counter++;
        return [class_name, '.' + class_name + ' { ' +
        Object.keys(properties).map(function(key) {
            return key.replace('_', '-') + ': ' + properties[key] + ';';
        }).join(' ') + ' }'];
    }
})();

const AttachmentChatboxMessageView = new Lang.Class({
    Name: 'AttachmentChatboxMessageView',
    Extends: Gtk.Button,
    Template: 'resource:///com/endlessm/Coding/Chatbox/attachment-view.ui',
    Children: [
        'attachment-icon',
        'attachment-icon-container',
        'attachment-details',
        'attachment-name',
        'attachment-desc',
        'attachment-contents'
    ],
    Implements: [ ChatboxMessageView ],
    Properties: {
        state: GObject.ParamSpec.object('state',
                                        '',
                                        '',
                                        GObject.ParamFlags.READWRITE |
                                        GObject.ParamFlags.CONSTRUCT_ONLY,
                                        State.AttachmentChatboxMessage),
        showing_thumbnail: GObject.ParamSpec.boolean('showing-thumbnail',
                                                     '',
                                                     '',
                                                     GObject.ParamFlags.READABLE,
                                                     false)
    },

    _init: function(params) {
        this.parent(params);

        this.attachment_name.label = this.state.path.get_basename();
        this.attachment_desc.label = this.state.desc;

        let thumbnailFactory = Thumbnailer.forSize(GnomeDesktop.DesktopThumbnailSize.LARGE);
        let preview = getPreviewForFile(this.state.path, thumbnailFactory);
        if (preview.thumbnail) {
            // Where we are using a thumbnail, use GtkCSSProivder to
            // set the background image
            let provider = new Gtk.CssProvider();
            let [class_name, css] = CSSAllocator({
                background_image: 'url("file://' + preview.thumbnail.path + '")',
                min_width: preview.thumbnail.width + 'px',
                min_height: preview.thumbnail.height + 'px'
            });
            provider.load_from_data(css);

            let attachment_icon_context = this.attachment_icon.get_style_context();
            attachment_icon_context.add_provider(provider,
                                                 Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            attachment_icon_context.add_class(class_name);
            attachment_icon_context.add_class('image');

            // Now set some classes to indicate that this is a thumbnail.
            // Because we set the background image through CSS, we will
            // get corner rounding too
            this.attachment_contents.orientation = Gtk.Orientation.VERTICAL;
            this.get_style_context().add_class('thumbnail');
            this._isShowingThumbnail = true;
        }
        else {
            this.attachment_icon.set_from_gicon(preview.icon, Gtk.IconSize.DND);
            this.attachment_contents.orientation = Gtk.Orientation.HORIZONTAL;
            this.get_style_context().add_class('icon');
            this.attachment_icon_container.get_style_context().add_class('icon-container');
        }

        this.get_style_context().add_class('chatbox-bubble-contents');
        this.get_style_context().add_class('attachment');
    },
    copyToClipboard: function() {
        ChatboxPrivate.utils_copy_file_to_clipboard(this, this.state.path);
    },

    supportsCopyPaste: function() {
        return true;
    },

    get showing_thumbnail() {
        return !!this._isShowingThumbnail;
    }
});
