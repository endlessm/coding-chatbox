// src/main.js
//
// Copyright (c) 2016-2017 Endless Mobile Inc.
//
// This file is the file first run by the entrypoint to the coding-chatbox
// package.
//
pkg.initGettext();
pkg.initFormat();
pkg.require({
    Gdk: '3.0',
    GdkPixbuf: '2.0',
    Gtk: '3.0',
    Gio: '2.0',
    GLib: '2.0',
    GObject: '2.0'
});

const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;

const Actor = imports.actor;
const Contact = imports.contact;
const Containers = imports.containers;
const Lang = imports.lang;
const Service = imports.service;
const State = imports.state;
const Views = imports.views;

const CHAT_WITH_ACTION = 'chat-with';

const CLOCK_SCHEMA = 'org.gnome.desktop.interface';
const CLOCK_FORMAT_KEY = 'clock-format';

const Gettext = imports.gettext;
window._ = Gettext.gettext;

//
// newMessageViewForState
//
// Creates a new message view container for a message state container, which
// automatically updates when the underlying state changes.
//
function newMessageViewForState(container,
                                actorObj,
                                styles,
                                onResponse) {
    styles = styles ? styles : [];
    let responseFunc = function(response) {
        if (onResponse)
            onResponse(response, actorObj.name, container.location);
    };

    let view = container.renderView(responseFunc);
    let viewContainer = new Containers.ChatBubble({
        // We only want to display the container if the underlying view
        // itself is visible. The assumption here is that the visibility
        // state never changes between renders.
        visible: view.visible,
        content: view,
        sender: container.sender,
        expand: true,
        display_image: actorObj.avatar
    }, styles, function() {
        // Re-render the view in case something changes
        container.connect('message-changed', function() {
            viewContainer.content = container.renderView(responseFunc);
        });
    });

    return viewContainer;
}

//
// newMessagePendingView
//
// Creates a new message view container for a message state container, which
// automatically updates when the underlying state changes.
//
function newMessagePendingView(actorObj, sender, styles, timeout, onVisible) {
    styles = styles ? styles : [];
    let pending = new Views.MessagePendingView({ visible: true });

    let viewContainer = new Containers.ChatBubble({
        // We only want to display the container if the underlying view
        // itself is visible. The assumption here is that the visibility
        // state never changes between renders.
        visible: true,
        content: pending,
        sender: sender,
        expand: true,
        display_image: actorObj.avatar
    }, styles.concat('message-pending'), function() {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                         timeout,
                         onVisible);
    });

    return viewContainer;
}

const RenderableTextChatboxMessage = new Lang.Class({
    Name: 'RenderableTextChatboxMessage',
    Extends: State.TextChatboxMessage,

    renderView: function() {
        return new Views.TextChatboxMessageView({
            state: this,
            visible: true
        });
    }
});

const RenderableChoiceChatboxMessage = new Lang.Class({
    Name: 'RenderableChoiceChatboxMessage',
    Extends: State.ChoiceChatboxMessage,

    renderView: function(listener) {
        let view = new Views.ChoiceChatboxMessageView({
            state: this,
            visible: true
        });
        view.connect('clicked', Lang.bind(this, function(view, buttonId, buttonText) {
            listener({
                response: {
                    evaluate: buttonId,
                    text: buttonText
                },
                amendment: {
                    type: 'scrolled',
                    text: buttonText
                }
            });
        }));
        return view;
    }
});

const RenderableInputChatboxMessage = new Lang.Class({
    Name: 'RenderableInputChatboxMessage',
    Extends: State.InputChatboxMessage,

    renderView: function(listener) {
        let view = new Views.InputChatboxMessageView({
            state: this,
            visible: true
        });
        view.connect('activate', Lang.bind(this, function(widget, msg) {
            listener({
                response: {
                    showmehow_id: this.showmehow_id,
                    text: msg
                },
                amendment: {
                    type: 'scrolled',
                    text: msg
                }
            });
        }));
        return view;
    }
});

// contentType
//
// Helper function that returns content type of a GFile.
function contentType(file) {
    let fileInfo = file.query_info('standard::content-type', 0, null, null);
    let type = fileInfo.get_content_type();
    return type;
}

const RenderableAttachmentChatboxMessage = new Lang.Class({
    Name: 'RenderableAttachmentChatboxMessage',
    Extends: State.AttachmentChatboxMessage,

    renderView: function(listener) {
        let view = new Views.AttachmentChatboxMessageView({
            state: this,
            visible: true
        });
        view.connect('clicked', Lang.bind(this, function() {
            let files = [];
            let appInfo = null;
            let attachmentPreview = view.showing_thumbnail ? {
                path: this.path.get_path(),
                name: this.path.get_basename(),
                desc: this.desc
            } : null;

            // If we're going to show an attachment preview, don't
            // launch the application
            if (!attachmentPreview) {
                if (contentType(this.path) == 'application/x-desktop') {
                    appInfo = Gio.DesktopAppInfo.new_from_filename(this.path.get_path());
                } else {
                    appInfo = this.path.query_default_handler(null);
                    files.push(this.path);
                }

                if (appInfo)
                    appInfo.launch(files, null);
                else
                    log('Couldn\'t find appInfo for ' + this.path.get_path() + ' ' + contentType(this.path));
            }

            listener({
                response: {
                    open_attachment: true,
                    attachment_preview: attachmentPreview
                }
            });
        }));
        return view;
    }
});

const MessageClasses = {
    scrolled: RenderableTextChatboxMessage,
    scroll_wait: RenderableTextChatboxMessage,
    choice: RenderableChoiceChatboxMessage,
    text: RenderableInputChatboxMessage,
    console: RenderableInputChatboxMessage,
    attachment: RenderableAttachmentChatboxMessage
};


function notificationId(actor) {
    return actor + '-message';
}

// We'll send a reminder after 20 minutes if the user fails to read a message
const MINUTES_TO_SECONDS_SCALE = 60;
const CHATBOX_MESSAGE_REMINDER_NOTIFICATION_SECONDS = 20 * MINUTES_TO_SECONDS_SCALE;

// Update every hour
const CHATBOX_MESSAGE_RECEIVED_LABELS_UPDATE_PERIOD_SECONDS = 3600;

const CodingChatboxMainWindow = new Lang.Class({
    Name: 'CodingChatboxMainWindow',
    Extends: Gtk.ApplicationWindow,
    Template: 'resource:///com/endlessm/Coding/Chatbox/main.ui',
    Children: [
        'chatbox-list-box',
        'chatbox-stack',
        'chatbox-view-stack',
        'attachment-preview-actor-image-container',
        'attachment-preview-close',
        'attachment-preview-filename',
        'attachment-preview-desc',
        'attachment-preview-image'
    ],
    Properties: {
        actor_model: GObject.ParamSpec.object('actor-model',
                                              '',
                                              '',
                                              GObject.ParamFlags.READWRITE |
                                              GObject.ParamFlags.CONSTRUCT_ONLY,
                                              Actor.Model),
        service: GObject.ParamSpec.object('service',
                                          '',
                                          '',
                                          GObject.ParamFlags.READWRITE |
                                          GObject.ParamFlags.CONSTRUCT_ONLY,
                                          Service.CodingChatboxTextService),
        game_service: GObject.ParamSpec.object('game-service',
                                               '',
                                               '',
                                               GObject.ParamFlags.READWRITE |
                                               GObject.ParamFlags.CONSTRUCT_ONLY,
                                               Service.CodingGameService)
    },

    _init: function(params) {
        // Force the title of the window to be Coding Chatbox here so that it
        // doesn't get overridden as 'Current Page' later.
        params.title = _("ChatBox");
        this.parent(params);

        this._state = new State.CodingChatboxState(MessageClasses);
        this.chatbox_list_box.bind_model(this.actor_model, Lang.bind(this, function(actor) {
            // Ensure we create a content widget for this actor
            this._contentsForActor(actor.name);

            // Get the history for this actor, asynchronously
            this.game_service.chatboxLogForActor(actor.name, Lang.bind(this, function(history) {
                history.filter(function(item) {
                    return item.type.indexOf('chat') == 0;
                }).forEach(Lang.bind(this, function(item) {
                    // We always treat messages obtained through the log as "read"
                    let wrapWidth, spec;

                    switch (item.type) {
                    case 'chat-user':
                    case 'chat-actor':
                        wrapWidth = (item.styles && item.styles.indexOf('code') !== -1) ?
                             Views.CODE_MAX_WIDTH_CHARS :
                             Views.MAX_WIDTH_CHARS;
                        spec = {
                            type: 'scrolled',
                            text: item.message,
                            wrap_width: wrapWidth
                        };
                        this._addItem(spec, actor.name, 'none::none', item.timestamp, item.styles,
                                      item.type === 'chat-actor' ? State.SentBy.ACTOR :
                                                                   State.SentBy.USER,
                                      0, null);
                        this._notifyItem(spec, actor.name, false);
                        break;
                    case 'chat-user-attachment':
                    case 'chat-actor-attachment':
                        spec = {
                            type: 'attachment',
                            attachment: item.attachment
                        };
                        this._addItem(spec, actor.name, item.name, item.timestamp, item.styles,
                                      item.type === 'chat-actor-attachment' ? State.SentBy.ACTOR :
                                                                              State.SentBy.USER,
                                      0, null);
                        this._notifyItem(spec, actor.name, false);
                        break;
                    default:
                        throw new Error('Don\'t know how to handle logged message type ' + item.type);
                    }
                }));

                // Get the very last item in the history and check if it is
                // a user input bubble. If so, display it. Also mark it as
                // unread, unless we're currently on this actor's tab.
                if (history.length &&
                    history[history.length - 1].type == 'input-user' &&
                    history[history.length - 1].input) {
                    let lastMessage = history[history.length - 1];

                    this._replaceUserInput(lastMessage.input,
                                           lastMessage.actor,
                                           lastMessage.styles,
                                           lastMessage.name);
                }
            }));

            let contactListItem = new Contact.CodingChatboxContactListItem({
                visible: true,
                actor: actor
            });

            this._state.bindPropertyForActorState(actor.name,
                                                  'unread-messages',
                                                  contactListItem.contact_message_notification,
                                                  'label',
                                                  GObject.BindingFlags.SYNC_CREATE |
                                                  GObject.BindingFlags.DEFAULT,
                                                  function(value) {
                                                      return String(value);
                                                  },
                                                  function(value) {
                                                      let val = Number.parseInt(value);
                                                      return (val ? val : 0);
                                                  });

            return contactListItem;
        }));

        this.chatbox_list_box.connect('row-selected', Lang.bind(this, function(list_box, row) {
            if (!row)
                return;

            this.chatbox_stack.set_visible_child_name(row.actor.name);
            this._markVisibleActorAsRead();
        }));

        this.connect('notify::is-active', Lang.bind(this, this._markVisibleActorAsRead));

        // Add a new timeout which periodically traverses all message groups
        // and updates the message received label
        GLib.timeout_add_seconds(GLib.PRIORITY_LOW, CHATBOX_MESSAGE_RECEIVED_LABELS_UPDATE_PERIOD_SECONDS, Lang.bind(this, function() {
            this.chatbox_stack.get_children().forEach(function(child) {
                child.updateTimestamps();
            });

            return true;
        }));

        this._clockSettings = new Gio.Settings({ schema: CLOCK_SCHEMA });
        this._clockSettings.connect('changed::' + CLOCK_FORMAT_KEY,
                                    Lang.bind(this, this._updateClockFormat));

        let escAction = new Gio.SimpleAction({ name: 'close-preview' });
        escAction.connect('activate', Lang.bind(this, this._closeAttachmentPreview));

        this.add_action(escAction);
        this.application.set_accels_for_action('win.close-preview', ['Escape']);
        this.attachment_preview_close.set_action_name('win.close-preview');
    },

    _closeAttachmentPreview: function() {
        this.attachment_preview_image.clear();
        this.attachment_preview_filename.label = '';
        this.attachment_preview_desc.label = '';
        this.chatbox_view_stack.set_visible_child_name('chats');
    },

    _updateClockFormat: function() {
        this.chatbox_stack.get_children().forEach(function(child) {
            child.updateTimestamps();
        });
    },

    _markActorAsRead: function(actor) {
        // Assuming here that this will always succeed, because it is part
        // of the chatbox' invariant that an entry in the list box always has
        // a page on the GtkStack and vice versa.
        let row = this._rowForActor(actor);
        let chatContents = this._contentsForActor(actor).chat_contents;
        let groups = chatContents.get_children();
        if (groups.length) {
            let children = groups[groups.length - 1].chatbox_bubbles.get_children();
            children[children.length - 1].focused();
        }

        row.highlight = false;
        this._state.markAllMessagesByActorAsRead(actor);
        this.application.withdraw_notification(notificationId(actor));
    },

    _markVisibleActorAsRead: function() {
        // Sets all the messages on the visible actor as read, by calling
        // focused() on the last view, removing any highlights and withdrawing
        // any notifications.
        //
        // When selecting the row here we'll want to look up the actor name
        // in the model and use that, since a row may not always be
        // 'selected' by the user
        let selectedActor = this.chatbox_stack.get_visible_child_name();
        this._markActorAsRead(selectedActor);
    },

    _actorIsVisible: function(name) {
        return (this.is_active &&
                this.chatbox_stack.get_visible_child_name() === name);
    },

    _contentsForActor: function(actor) {
        let chatboxStackChild = this.chatbox_stack.get_child_by_name(actor);
        if (chatboxStackChild)
            return chatboxStackChild;

        chatboxStackChild = Containers.createChatContentsWidget();
        this.chatbox_stack.add_named(chatboxStackChild, actor);
        return chatboxStackChild;
    },

    _rowForActor: function(actor) {
        let children = this.chatbox_list_box.get_children();
        for (let row of children) {
            if (row.actor.name == actor)
                return row;
        }

        return null;
    },

    _addItem: function(item, actor, location, timestamp, style, sentBy, pendingTime, visibleAction) {
        let messageQueue = this._contentsForActor(actor).message_queue;

        // Scroll view to the bottom after the child is added. We only
        // connect to the signal for this one item, to avoid jumping to the
        // bottom of the view when 'upper' is notified for other reasons.
        let chatView = this.chatbox_stack.get_child_by_name(actor);
        chatView.scrollToBottomOnUpdate();

        // If we can amend the last message, great.
        // Though I'm not really sure if we want this. "amend" currently
        // means 'amend-or-replace'.
        let [amended, container] = this._state.amendLastMessageForActor(actor,
                                                                        sentBy,
                                                                        item);

        if (amended)
            return container;

        let messageBecameVisibleHandler = Lang.bind(this, function() {
            // Now that the pending message container is done showing
            // the animation, show the next text message
            messageQueue.showNext();

            // If actorIsVisible is false here, then we should listen for
            // notifications to show an unread-notification on this actor in a
            // given time period.
            let showReminder = Lang.bind(this, function() {
                let row = this._rowForActor(actor);
                if (!row)
                    throw new Error('Couldn\'t find row matching actor ' + actor);

                this.application.showNotification(_("Waiting on your input"),
                                                  _("%s is still waiting on your response").format(actor),
                                                  row.avatar,
                                                  actor);
            });


            if (!this._actorIsVisible(actor)) {
                this._state.mesageBecameVisibleAndNotRead(actor,
                                                          CHATBOX_MESSAGE_REMINDER_NOTIFICATION_SECONDS,
                                                          showReminder);
            }

            // Listen for any new changes to the scroll state and scroll
            // to the bottom
            chatView.scrollToBottomOnUpdate();

            if (visibleAction)
                visibleAction();

            // Now that we're done with this message, show the next one if
            // it is pending (could be an input bubble or another pending
            // message bubble).
            messageQueue.showNext();
        });

        container = this._state.addMessageForActor(actor,
                                                   sentBy,
                                                   item,
                                                   location);

        if (pendingTime) {
            let pendingMessageContainer = newMessagePendingView(this.actor_model.getByName(actor),
                                                                container.sender,
                                                                style,
                                                                pendingTime,
                                                                function() {
                                                                    pendingMessageContainer.destroy();
                                                                    messageBecameVisibleHandler();
                                                                });
            messageQueue.push({
                view: pendingMessageContainer,
                date: new Date(timestamp),
                actor: sentBy == State.SentBy.USER ? 'user' : actor
            });
        }

        messageQueue.push({
            view: newMessageViewForState(container,
                                         this.actor_model.getByName(actor),
                                         style,
                                         Lang.bind(this, this._handleResponse, style)),
            date: new Date(timestamp),
            actor: sentBy == State.SentBy.USER ? 'user' : actor
        });

        if (!pendingTime) {
            // We can immediately show this message
            messageBecameVisibleHandler();
        }

        return container;
    },

    _replaceUserInput: function(item, actor, style, location) {
        let stackChild = this._contentsForActor(actor);
        let messageQueue = stackChild.message_queue;
        let inputArea = stackChild.input_area;

        // Here we push a function to messageQueue which gets called when
        // it becomes the first item on the queue. When it is called, we
        // replace the currently active user input and then show the next
        // message.
        //
        // Doing it this way ensures that the input is always shown after
        // the last message was shown.
        messageQueue.push(Lang.bind(this, function() {
            let container = this._state.replaceUserInputWithForActor(actor, item, location);
            inputArea.get_children().forEach(function(child) {
                child.destroy();
            });

            let view_container = newMessageViewForState(container,
                                                        this.actor_model.getByName(actor),
                                                        style,
                                                        Lang.bind(this, this._handleResponse, style));
            view_container.showContent();
            view_container.margin = 10;
            inputArea.pack_end(view_container, true, true, 0);
            stackChild.showInputArea();
            stackChild.scrollToBottomOnUpdate();
            messageQueue.showNext();
        }));
        return inputArea;
    },

    // style is the first argument here since it needs to be passed
    // in by _replaceUserInput and _addItem so that we know
    // what style of bubble to create later if we need to create any.
    _handleResponse: function(response, actor, location, style) {
        style = style ? style : [];

        if (response.showmehow_id) {
            // We evaluate the text of the response here in order to get an 'evaluated'
            // piece of text to send back to the game service.
            this.service.evaluate(response.showmehow_id, response.text, Lang.bind(this, function(evaluated) {
                this.game_service.respondToMessage(location, response.text, evaluated);
            }));

            this.chatMessage(actor,
                             response.text,
                             location,
                             (new Date()).toString(),
                             style,
                             State.SentBy.USER,
                             0);
            this.hideUserInput(actor);
        } else if (response.external_event_id) {
            // Notify that this external event has been triggered
            this.game_service.callExternalEvent(response.external_event_id);
        } else if (response.open_attachment) {
            // Notify that this external event has been triggered
            this.game_service.openAttachment(location);

            // We had an attachment preview too. Use the contents
            // of this preview to open a new view to show the attachment
            if (response.attachment_preview) {
                this._showAttachmentPreview(actor,
                                            response.attachment_preview.path,
                                            response.attachment_preview.name,
                                            response.attachment_preview.desc);
            }
        } else if (response.evaluate) {
            // Nothing to evaluate, just send back the pre-determined evaluated response
            this.game_service.respondToMessage(location, response.text, response.evaluate);
            this.chatMessage(actor,
                             response.text,
                             location,
                             (new Date()).toString(),
                             style,
                             State.SentBy.USER,
                             0);
            this.hideUserInput(actor);
        }
    },

    _notifyItem: function(item, actor, isNew) {
        let body, title;

        let row = this._rowForActor(actor);
        if (!row)
            throw new Error('Couldn\'t find row matching actor ' + actor);

        if (item.type === 'scrolled') {
            title = _("Message from %s").format(actor);
            body = Views.stripMarkup(item.text);
        } else if (item.type === 'attachment') {
            title = _("Attachment from %s").format(actor);
            body = Views.stripMarkup(item.attachment.desc);
        } else {
            return;
        }

        // Strip newlines from body to work around
        // https://bugzilla.gnome.org/show_bug.cgi?id=776645
        let stripped = body.split('\n').join(' ');
        if (isNew) {
            this.application.showNotification(title, stripped, row.avatar, actor);
            row.highlight = true;
        }
    },

    _showAttachmentPreview: function(actor, imagePath, name, desc) {
        let actorIcon = this.actor_model.getByName(actor).avatar;

        if (this._roundedImage)
            this._roundedImage.destroy();

        this._roundedImage = new Contact.RoundedImage({
            visible: true,
            pixbuf: actorIcon,
            halign: Gtk.Align.START,
        });

        this.attachment_preview_actor_image_container.add(this._roundedImage);

        this.attachment_preview_image.set_from_file(imagePath);
        this.attachment_preview_filename.label = name;
        this.attachment_preview_desc.label = desc;
        this.chatbox_view_stack.set_visible_child_name('attachment-preview');
    },

    clearConversations: function() {
        this._state.clearConversations();
        this.chatbox_stack.get_children().forEach(function(child) {
            child.destroy();
        });
        this.actor_model.forEach(Lang.bind(this, function(actor) {
            this._contentsForActor(actor.name);
            this._markActorAsRead(actor.name);
        }));
    },

    chatMessage: function(actor, message, location, timestamp, style, sentBy, pendingTime) {
        let wrapWidth = style.indexOf('code') !== -1 ? Views.CODE_MAX_WIDTH_CHARS :
                                                       Views.MAX_WIDTH_CHARS;
        let item = {
            type: 'scrolled',
            text: message,
            wrap_width: wrapWidth
        };
        this._addItem(item,
                      actor,
                      location,
                      timestamp,
                      style,
                      sentBy,
                      pendingTime,
                      Lang.bind(this, function() {
                          this._notifyItem(item, actor, !this._actorIsVisible(actor));
                      }));
    },

    chatAttachment: function(actor, attachment, location, timestamp, style, pendingTime) {
        let item = {
            type: 'attachment',
            attachment: attachment
        };
        this._addItem(item,
                      actor,
                      location,
                      timestamp,
                      style,
                      State.SentBy.ACTOR,
                      pendingTime,
                      Lang.bind(this, function() {
                          this._notifyItem(item, actor, !this._actorIsVisible(actor));
                      }));
    },

    chatUserInput: function(actor, spec, location, style) {
        this._replaceUserInput(spec, actor, style, location);
    },

    hideUserInput: function(actor) {
        this._contentsForActor(actor).hideInputArea();
    },

    switchToChatWith: function(actor) {
        let row = this._rowForActor(actor);
        if (row)
            this.chatbox_list_box.select_row(row);
    }
});

function load_style_sheet(resourcePath) {
    let provider = new Gtk.CssProvider();
    provider.load_from_resource(resourcePath);
    Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(),
                                             provider,
                                             Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
}

// determineWaitTimeForEvent
//
// Examines event and determine how long we should wait before
// running it. This is to make the chatbox interface a little more
// realistic.
function determineMessagePendingTime(type, content) {
    switch (type) {
    case 'chat-actor':
        // Simple message. Assume that the average person
        // types at 200 character per minute - 3 characters
        // per second and thus 300 milliseconds per character.
        // We then divide by 2.5 to make things a little quicker.
        //
        // This is capped at 1500 to make sure we're not waiting
        // too long.
        return Math.min(content.length * 120, 1500);
    case 'chat-actor-attachment':
        // Attachment. Fixed 1.5 second delay + character length
        // of description
        return 1500 + Math.min(content.desc.length * 60,
                               500);
    case 'input-user':
        // User input. Fixed 1 second delay
        return 1000;
    default:
        return 0;
    }
}


const CodingChatboxApplication = new Lang.Class({
    Name: 'CodingChatboxApplication',
    Extends: Gtk.Application,

    _init: function() {
        this._mainWindow = null;

        this.parent({ application_id: pkg.name });
        GLib.set_application_name(_("ChatBox"));

        let chatWithAction = new Gio.SimpleAction({
            name: CHAT_WITH_ACTION,
            parameter_type: new GLib.VariantType('s')
        });
        chatWithAction.connect('activate', Lang.bind(this, function(action, parameter) {
            this.activate();

            let actor = parameter.unpack();
            this._mainWindow.switchToChatWith(actor);
        }));
        this.add_action(chatWithAction);
    },

    vfunc_startup: function() {
        this.parent();

        let settings = Gtk.Settings.get_default();
        settings.gtk_application_prefer_dark_theme = true;

        // We don't want select-on-focus to be enabled here. If we had
        // text selected in one chat bubble and then changed to another
        // conversation, that would cause gtk_widget_grab_focus to be
        // called recursively on the container and then eventually
        // the bubbles themselves. If select-on-focus was enabled here,
        // that would attempt to apply the selection region of the old
        // selected conversation bubble to the new one, which makes
        // no sense. (T15186)
        settings.gtk_label_select_on_focus = false;

        load_style_sheet('/com/endlessm/Coding/Chatbox/application.css');

        this._service = new Service.CodingChatboxTextService();
        this._gameService = new Service.CodingGameService();
        this._actorModel = new Actor.Model();
    },

    vfunc_activate: function() {
        if (!this._mainWindow)
            this._mainWindow = new CodingChatboxMainWindow({
                application: this,
                actor_model: this._actorModel,
                service: this._service,
                game_service: this._gameService
            });

        this._mainWindow.present();
    },

    vfunc_dbus_register: function(conn, object_path) {
        this.parent(conn, object_path);
        this._skeleton = new Service.ChatboxReceiverService();
        this._skeleton.export(conn, object_path);

        this._skeleton.connect('chat-message', Lang.bind(this, function(service, actor, message, location, timestamp, styles) {
            if (this._mainWindow) {
                this._mainWindow.chatMessage(actor,
                                             message,
                                             location,
                                             timestamp,
                                             styles,
                                             State.SentBy.ACTOR,
                                             determineMessagePendingTime('chat-actor', message));
            } else {
                let title = 'Message from ' + actor;
                let actorObj = this._actorModel.getByName(actor);
                this.showNotification(title, Views.stripMarkup(message), actorObj.avatar, actor);
            }
        }));

        this._skeleton.connect('chat-attachment', Lang.bind(this, function(service, actor, attachment, location, timestamp, styles) {
            if (this._mainWindow) {
                this._mainWindow.chatAttachment(actor,
                                                attachment,
                                                location,
                                                timestamp,
                                                styles,
                                                determineMessagePendingTime('chat-actor-attachment', attachment));
            } else {
                let title = 'Attachment from ' + actor;
                let actorObj = this._actorModel.getByName(actor);
                this.showNotification(title, Views.stripMarkup(attachment.desc), actorObj.avatar, actor);
            }
        }));

        this._skeleton.connect('user-input-bubble', Lang.bind(this, function(service, actor, spec, location, styles) {
            if (this._mainWindow)
                this._mainWindow.chatUserInput(actor, spec, location, styles, 1);
        }));

        this._skeleton.connect('reset', Lang.bind(this, function() {
            if (this._mainWindow)
                this._mainWindow.clearConversations();
        }));

        return true;
    },

    vfunc_dbus_unregister: function(conn, object_path) {
        if (this._skeleton && this._skeleton.has_connection(conn)) {
            this._skeleton.unexport();
        }

        this.parent(conn, object_path);
    },

    showNotification: function(title, body, icon, actor) {
        let notification = new Gio.Notification();
        notification.set_title(title);
        notification.set_body(body);
        if (icon)
            notification.set_icon(icon);
        notification.set_default_action_and_target('app.' + CHAT_WITH_ACTION, new GLib.Variant('s', actor));
        this.send_notification(notificationId(actor), notification);
    }
});

function main(argv) { // eslint-disable-line no-unused-vars
    return (new CodingChatboxApplication()).run(argv);
}
