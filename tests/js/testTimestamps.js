// tests/js/testCodingGameService.js
//
// Copyright (c) 2016 Endless Mobile Inc.
// All Rights Reserved.
//
// These unit tests test the underlying functionality in CodingGameController
// (apart from the actual sequencing of events themselves).

const GLib = imports.gi.GLib;

const Timestamp = imports.timestamp;

describe('Timestamp calculation', function () {
    beforeEach(function () {
        GLib.setenv('GSETTINGS_BACKEND', 'memory', true);
    });

    it('shows "last year" if date was in the last calendar year', function() {
        let current = new Date("1 January 2010");
        let date = new Date("31 December 2009");
        let msg = Timestamp.calculateMessageReceivedTextFromDate(date, current);
        expect(msg).toEqual("Last year");
    });

    it('shows "About 2 years ago" if date was two calendar years ago', function() {
        let current = new Date("1 January 2010");
        let date = new Date("31 December 2008");
        let msg = Timestamp.calculateMessageReceivedTextFromDate(date, current);
        expect(msg).toEqual("About 2 years ago");
    });

    it('shows "Last month" if date was in the last calendar month', function() {
        let current = new Date("1 February 2010");
        let date = new Date("31 January 2010");
        let msg = Timestamp.calculateMessageReceivedTextFromDate(date, current);
        expect(msg).toEqual("Last month");
    });

    it('shows "About 2 months ago" if date was in the last two calendar months', function() {
        let current = new Date("1 March 2010");
        let date = new Date("31 January 2010");
        let msg = Timestamp.calculateMessageReceivedTextFromDate(date, current);
        expect(msg).toEqual("About 2 months ago");
    });

    it('shows "Last week" if date was in the last calendar week', function() {
        let current = new Date("13 February 2017");
        let date = new Date("12 February 2017");
        let msg = Timestamp.calculateMessageReceivedTextFromDate(date, current);
        expect(msg).toEqual("Last week");
    });

    it('shows "2 weeks ago" if date was in the last two calendar weeks', function() {
        let current = new Date("20 February 2017");
        let date = new Date("12 February 2017");
        let msg = Timestamp.calculateMessageReceivedTextFromDate(date, current);
        expect(msg).toEqual("About 2 weeks ago");
    });

    it('shows "Last week" on years where week numbering does not align with NYD', function() {
        let current = new Date("4 January 2016");
        let date = new Date("3 January 2016");
        let msg = Timestamp.calculateMessageReceivedTextFromDate(date, current);
        expect(msg).toEqual("Last week");
    });

    it('shows "About 2 weeks ago" on years where week numbering does not align with NYD and event was 2 weeks ago', function() {
        let current = new Date("11 January 2016");
        let date = new Date("3 January 2016");
        let msg = Timestamp.calculateMessageReceivedTextFromDate(date, current);
        expect(msg).toEqual("About 2 weeks ago");
    });

    it('shows "Yestrerday" if date was in the last calendar day', function() {
        let current = new Date("14 February 2017");
        let date = new Date("13 February 2017");
        let msg = Timestamp.calculateMessageReceivedTextFromDate(date, current);
        expect(msg).toEqual("Yesterday");
    });

    it('shows "2 days ago" if date was in the last two calendar days', function() {
        let current = new Date("15 February 2017");
        let date = new Date("13 February 2017");
        let msg = Timestamp.calculateMessageReceivedTextFromDate(date, current);
        expect(msg).toEqual("About 2 days ago");
    });

    describe('(with 24 hour time enabled)', function() {
        beforeEach(function() {
            Timestamp.GnomeInterfacePreferences.set_enum('clock-format', Timestamp.CLOCK_TYPE_24H);
        });

        it('shows the time in 24H format if date was in the current calendar day', function() {
            let current = new Date("14 February 2017 17:04");
            let date = new Date("14 February 2017 16:04");
            let msg = Timestamp.calculateMessageReceivedTextFromDate(date, current);
            expect(msg).toEqual("16:04");
        });
    });

    describe('(with AM/PM time enabled)', function() {
        beforeEach(function() {
            Timestamp.GnomeInterfacePreferences.set_enum('clock-format', Timestamp.CLOCK_TYPE_AMPM);
        });

        it('shows the time in AMPM format if date was in the current calendar day', function() {
            let current = new Date("14 February 2017 17:04");
            let date = new Date("14 February 2017 16:04");
            let msg = Timestamp.calculateMessageReceivedTextFromDate(date, current);
            expect(msg).toEqual("4:04 PM");
        });
    });
});
