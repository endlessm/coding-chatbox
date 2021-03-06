// src/timestmap.js
//
// Copyright (c) 2016-2017 Endless Mobile Inc.
//
// This file contains the logic for computing message timestamps.
//

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Gettext = imports.gettext;
window._ = Gettext.gettext;

const GnomeInterfacePreferences = new Gio.Settings({
    schema: 'org.gnome.desktop.interface'
});

const CLOCK_TYPE_24H = 0;
const CLOCK_TYPE_AMPM = 1;  // eslint-disable-line no-unused-vars

// calculateMessageReceivedTextFromDate
//
// Calculate the 'message received' text from a timestamp. Right now this
// calculates time the 'accurate' way but not necessarily in line with
// user expectations.
//
// @param {object.Date} date - The date of the message
// @param {object.Date} current - The current time (injected so that it
//                                can be controlled from tests).
//
// eslint-disable-next-line no-unused-vars
function calculateMessageReceivedTextFromDate(date, current=null) {
    // Sanity check for clock skew. In this case, we just display
    // 'In the future'
    current = current || new Date();

    if (date.getTime() > current.getTime()) {
        return _("In the future");
    }

    // Convert to GDateTime and use that API consistently throuhgout
    let datetime = GLib.DateTime.new_from_unix_local(date.getTime() / 1000);
    let now = GLib.DateTime.new_from_unix_local(current.getTime() / 1000);

    let todayMidnight = GLib.DateTime.new_local(now.get_year(),
                                                now.get_month(),
                                                now.get_day_of_month(),
                                                0, 0, 0);

    // To do this, we need to get the current day and then subtract
    // the number of days from the first day of this week. That might
    // end up putting beginningOfWeek into last month or even last year
    // but that's fine.
    let beginningOfWeek = GLib.DateTime.new_local(now.get_year(),
                                                  now.get_month(),
                                                  now.get_day_of_month(),
                                                  0, 0, 0);
    beginningOfWeek.add_days(-(now.get_day_of_week() - 1));
    let beginningOfMonth = GLib.DateTime.new_local(now.get_year(),
                                                   now.get_month(),
                                                   1, 0, 0, 0);
    let beginningOfYear = GLib.DateTime.new_local(now.get_year(),
                                                  1, 1, 0, 0, 0);

    // Compare deltas between the dates until we can determine a
    // string to show
    let yearDelta = beginningOfYear.get_year() - datetime.get_year();
    if (yearDelta === 1) {
        return _("Last year");
    } else if (yearDelta > 0) {
        return _("About %d years ago").format(yearDelta);
    }

    let monthDelta = beginningOfMonth.get_month() - datetime.get_month();
    if (monthDelta === 1) {
        return _("Last month");
    } else if (monthDelta > 0) {
        return _("About %d months ago").format(monthDelta);
    }

    let weekDelta = beginningOfWeek.get_week_of_year() - datetime.get_week_of_year();
    if (weekDelta < 0) {
        // If the week delta is negative, then that means that we were still
        // in the final week of last year, which continued into this year. In
        // that case, subtract 53 weeks from datetime and measure again.
        weekDelta = beginningOfWeek.get_week_of_year() - (datetime.get_week_of_year() - 53);
    }

    if (weekDelta === 1) {
        return _("Last week");
    } else if (weekDelta > 0) {
        return _("About %d weeks ago").format(weekDelta);
    }

    let dayDelta = todayMidnight.get_day_of_year() - datetime.get_day_of_year();
    if (dayDelta === 1) {
        return _("Yesterday");
    } else if (dayDelta > 0) {
        return _("About %d days ago").format(dayDelta);
    }


    // On the same day, display the timestamp in the hours / minutes format
    // depending on the user's time settings
    if (GnomeInterfacePreferences.get_enum('clock-format') !== CLOCK_TYPE_24H) {
        return datetime.format('%l:%M %p').trim();
    } else {
        return datetime.format('%k:%M');
    }
}
