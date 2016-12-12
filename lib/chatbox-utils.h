/*
 * chatbox-utils.h
 *
 * This is a small helper module to copy a file URI into the clipboard, since
 * Gtk.Clipboard.set_with_data is not exposed to GObject-Introspection.
 *
 */

#ifndef _CHATBOX_UTILS_H
#define _CHATBOX_UTILS_H

#include <gtk/gtk.h>

void chatbox_utils_copy_file_to_clipboard (GtkWidget *widget, GFile *file);

#endif
