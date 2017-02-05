// src/queue.js
//
// Copyright (c) 2016-2017 Endless Mobile, Inc.

// This class implements a queue of items which could be passed
// to a consumer progressively according to the needs of the application.
// The first item always gets added straight away, but is pushed to the back
// of the queue. While the queue has items in it, queuing more items will just
// cause them to be added to the queue. Calling the 'showNext' method will
// cause the front of the queue to be popped and the widget at the
// front of the queue to be added to the box.
//
// This class is used by the chatbox view to show pending animations
// for already-received messages and otherwise show messages in the order
// that they were received. When a message is done "showing", it can call
// showNext on the queue to start the animation for the next message.

const GObject = imports.gi.GObject;

const Lang = imports.lang;

const TriggerableEventQueue = new Lang.Class({
    Name: 'TriggerableEventQueue',
    Extends: GObject.Object,

    _init: function(itemConsumer) {
        this.parent({});
        this._queue = [];
        this._itemConsumer = itemConsumer;
    },

    showNext: function() {
        this._queue.shift();
        if (this._queue.length) {
            let item = this._queue[0];
            this._itemConsumer(item);
        }
    },

    // push
    //
    // push accepts anything. If it would be the first item on the queue
    // we immediately pass it to the consumer otherwise we keep it on the
    // queue and pass it to the consumer when showNext is called.
    push: function(item) {
        let hadLength = this._queue.length > 0;
        this._queue.push(item);

        if (!hadLength) {
            this._itemConsumer(item);
        }
    }
});
