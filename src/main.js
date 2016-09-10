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

const Lang = imports.lang;

const MissionChatboxMainWindow = new Lang.Class({
    Name: 'MissionChatboxMainWindow',
    Extends: Gtk.ApplicationWindow,
    Template: 'resource:///com/endlessm/Mission/Chatbox/main.ui',

    _init: function(params) {
        params.title = "";
        this.parent(params);
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
