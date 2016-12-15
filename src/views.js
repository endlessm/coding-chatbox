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
const Gtk = imports.gi.Gtk;

const Lang = imports.lang;
const State = imports.state;

const MAX_WIDTH_CHARS = 30;

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
    },

    copyToClipboard: function() {
        this.get_clipbpard().set_text(this.state.text, -1);
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

const _THUMBNAIL_MIME_TYPES = ['image/png', 'image/jpeg'];

// careAboutThumbnails
//
// Determine if this file has a content type that makes
// us care about thumbnails
function careAboutThumbnails(uri, thumbnailFactory, mimeType, mtime) {
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
    let info = path.query_info([Gio.FILE_ATTRIBUTE_STANDARD_ICON,
                                Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH,
                                Gio.FILE_ATTRIBUTE_STANDARD_CONTENT_TYPE,
                                Gio.FILE_ATTRIBUTE_TIME_MODIFIED].join(','),
                               Gio.FileQueryInfoFlags.NONE,
                               null);
    let contentType = info.get_content_type();
    let mimeType = Gio.content_type_get_mime_type(contentType);
    let mtime = info.get_modification_time();
    let uri = path.get_uri();

    let thumbnail = null;

    if (careAboutThumbnails(uri, thumbnailFactory, mimeType, mtime)) {
        let thumbnailPath = info.get_attribute_byte_string(Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH);
        let thumbnailPathFile = thumbnailPath ? Gio.File.new_for_path(thumbnailPath) : null;

        if (thumbnailPathFile && thumbnailPathFile.query_exists(null)) {
            thumbnail = GdkPixbuf.Pixbuf.new_from_file(thumbnailPath);
        } else {
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

        // XXX: Not brilliant that we have to create a new
        // DesktopThumbnailFactory here for every attachment view,
        // there doesn't seem to be another way to do this that wouldn't
        // involve things like singletons or passing props deep down
        // the hierarchy.
        this._thumbnailFactory = GnomeDesktop.DesktopThumbnailFactory.new(GnomeDesktop.DesktopThumbnailSize.LARGE);

        let preview = getPreviewForFile(this.state.path, this._thumbnailFactory);
        if (preview.thumbnail) {
            this.attachment_icon.set_from_pixbuf(preview.thumbnail);
        } else {
            this.attachment_icon.set_from_gicon(preview.icon,
                                                Gtk.IconSize.DIALOG);
        }
    },
    copyToClipboard: function() {
        ChatboxPrivate.utils_copy_file_to_clipboard(this, this.state.path);
    },

    supportsCopyPaste: function() {
        return true;
    }
});
